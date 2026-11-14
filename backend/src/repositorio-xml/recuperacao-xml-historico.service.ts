import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, RecuperacaoXmlHistorico } from '@prisma/client';
import { setImmediate as ceder } from 'node:timers/promises';
import { CustosService, registrarUso } from '../custos/custos.service';
import { getFirst, getText, MAX_TAMANHO_XML, parseXml } from '../importacao-xml/shared/xml-parser';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RepositorioXmlService } from './repositorio-xml.service';
import { indexarXml } from './xml-indice';
import { lerArquivosDoZip } from './zip-seguro';

const SERVICO = 'SERPRO_CONSULTA_NFE';
const GATEWAY = 'https://gateway.apiserpro.serpro.gov.br';
const LIMITE_EFD = 64 * 1024 * 1024;
const VALIDADE_PREVIA = 30 * 60_000;
const TAMANHO_LOTE = 5000;
const TIMEOUT = 20_000;

type Cobertura = {
  competencia: string;
  fonte: string;
  chaves: number;
  faltantes: number;
  recuperadas?: number;
  indisponiveis?: number;
  falhas?: number;
  reaproveitadas?: number;
};

function dataValida(data: unknown): data is string {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(data);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

function isoDeDataEfd(data: string) {
  return /^\d{8}$/.test(data) ? data.slice(4) + '-' + data.slice(2, 4) + '-' + data.slice(0, 2) : '';
}

export function lerEfd(buffer: Buffer, documento: string, de: string, ate: string) {
  const texto = buffer.toString('latin1');
  const linhas = texto.split(/\r?\n/);
  const abertura = (linhas[0] ?? '').replace(/^\xEF\xBB\xBF/, '').split('|');
  const competencia = isoDeDataEfd(abertura[4] ?? '').slice(0, 7);
  if (abertura[1] !== '0000' || !/^\d{3}$/.test(abertura[2] ?? '')
    || !['0', '1'].includes(abertura[3] ?? '') || ![abertura[7], abertura[8]].includes(documento)
    || !dataValida(isoDeDataEfd(abertura[4] ?? '')) || !dataValida(isoDeDataEfd(abertura[5] ?? ''))
    || !linhas.some((linha) => linha.startsWith('|9999|'))) return null;
  const chaves = new Set<string>();
  for (const linha of linhas) {
    if (!linha.startsWith('|C100|')) continue;
    const campos = linha.split('|');
    const chave = campos[9] ?? '';
    const emissao = isoDeDataEfd(campos[10] ?? '');
    if (campos[5] === '55' && /^\d{20}55\d{22}$/.test(chave) && dataValida(emissao)
      && emissao >= de && emissao <= ate) chaves.add(chave);
  }
  return { competencia, chaves };
}

export function indiceHistorico(buffer: Buffer, chave: string, documento: string) {
  const xml = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  try {
    const root = parseXml(xml).documentElement;
    if (root?.localName !== 'nfeProc' || root.namespaceURI !== 'http://www.portalfiscal.inf.br/nfe') return null;
    const nota = getFirst(root, 'NFe');
    const assinatura = getFirst(nota, 'Signature');
    const protocolo = getFirst(getFirst(root, 'protNFe'), 'infProt');
    if (assinatura?.namespaceURI !== 'http://www.w3.org/2000/09/xmldsig#'
      || !getText(assinatura, 'SignatureValue') || !/^\d{15,17}$/.test(getText(protocolo, 'nProt'))
      || getText(protocolo, 'chNFe') !== chave || !['100', '150', '101', '151', '155'].includes(getText(protocolo, 'cStat'))) return null;
    const indice = indexarXml(xml);
    return indice?.chave === chave && indice.modelo === '55'
      && [indice.emitenteDoc, indice.destinatarioDoc].includes(documento) ? indice : null;
  } catch {
    return null;
  }
}

@Injectable()
export class RecuperacaoXmlHistoricoService {
  private readonly log = new Logger(RecuperacaoXmlHistoricoService.name);
  private executando = false;
  private token?: { valor: string; expira: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly repo: RepositorioXmlService,
    private readonly custos: CustosService,
  ) {}

  private configurado() {
    return !!(process.env.SERPRO_NFE_CONSUMER_KEY?.trim() && process.env.SERPRO_NFE_CONSUMER_SECRET?.trim());
  }

  private apresentar({ chaves: _chaves, ocupado_ate: _ocupado, ...lote }: RecuperacaoXmlHistorico) {
    return {
      ...lote,
      configurado: this.configurado(),
      estimativa: lote.preco_unitario === null ? null : Math.ceil(lote.total * lote.preco_unitario * 100) / 100,
      custo_registrado: Math.round(lote.cobradas * (lote.preco_unitario ?? 0) * 100) / 100,
      expirada: Date.now() - lote.createdAt.getTime() > VALIDADE_PREVIA,
    };
  }

  async listar(empresaId: string) {
    const lotes = await this.prisma.recuperacaoXmlHistorico.findMany({
      where: { empresa_id: empresaId, situacao: { not: 'PREVIA' } },
      orderBy: { createdAt: 'desc' }, take: 10,
    });
    return lotes.map((lote) => this.apresentar(lote));
  }

  async preparar(empresaId: string, de: unknown, ate: unknown, usuario: string) {
    if (!dataValida(de) || !dataValida(ate) || de > ate || ate > new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)) {
      throw new BadRequestException('Informe um período válido, até hoje.');
    }
    const inicio = new Date(de);
    const fim = new Date(ate);
    const distancia = (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + fim.getUTCMonth() - inicio.getUTCMonth();
    const limite = new Date(inicio);
    limite.setUTCFullYear(inicio.getUTCFullYear() + 5);
    if (fim > limite) throw new BadRequestException('Selecione um intervalo de até cinco anos.');
    const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { cnpj_cpf: true } });
    if (!empresa) throw new NotFoundException('Empresa não localizada.');
    const documento = (empresa.cnpj_cpf ?? '').replace(/\D/g, '');
    if (!/^\d{14}$/.test(documento)) throw new BadRequestException('A recuperação pela EFD exige o CNPJ do estabelecimento.');

    const meses = Array.from({ length: distancia + 1 }, (_, i) =>
      new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
    const sped = await this.prisma.spedDownload.findMany({
      where: { empresa_id: empresaId, escrituracao: 'EFD_ICMS_IPI', situacao: 'GUARDADO', competencia: { in: meses }, arquivo_id: { not: null } },
      orderBy: [{ retificadora: 'desc' }, { createdAt: 'desc' }], select: { competencia: true, arquivo_id: true },
    });
    const arquivos = await this.prisma.arquivoEmpresa.findMany({
      where: { empresa_id: empresaId, id: { in: [...new Set(sped.map((item) => item.arquivo_id!))] } },
      select: { id: true, storage_key: true, tamanho: true },
    });
    const porId = new Map(arquivos.map((arquivo) => [arquivo.id, arquivo]));
    const chaves = new Set<string>();
    const cobertura: Cobertura[] = [];
    const competenciaPorChave = new Map<string, string>();
    const leituras = new Map<string, Set<string>>();
    for (const competencia of meses) {
      let fonte = 'SEM_EFD';
      for (const spedMes of sped.filter((item) => item.competencia === competencia)) {
        const arquivo = porId.get(spedMes.arquivo_id!);
        if (!arquivo || arquivo.tamanho > LIMITE_EFD) { fonte = 'EFD_NAO_LIDA'; continue; }
        try {
          const buffer = await this.storage.getObjectBuffer(arquivo.storage_key);
          if (buffer.length > LIMITE_EFD) throw new Error('Arquivo acima do limite.');
          const partes = buffer.subarray(0, 2).toString() === 'PK'
            ? lerArquivosDoZip(buffer, { maxEntradas: 50, maxTotal: LIMITE_EFD, maxPorArquivo: LIMITE_EFD }, (nome) => !/\/\s*$|\.rec$|recibo/i.test(nome)).entradas.map((item) => item.buffer)
            : [buffer];
          const efd = partes.map((parte) => lerEfd(parte, documento, de, ate)).find((item) => item?.competencia === competencia);
          if (!efd) { fonte = 'EFD_NAO_LIDA'; continue; }
          leituras.set(competencia, efd.chaves);
          for (const chave of efd.chaves) {
            chaves.add(chave);
            if (!competenciaPorChave.has(chave)) competenciaPorChave.set(chave, competencia);
          }
          fonte = 'EFD_LIDA';
          break;
        } catch {
          fonte = 'EFD_NAO_LIDA';
        }
      }
      cobertura.push({ competencia, fonte, chaves: leituras.get(competencia)?.size ?? 0, faltantes: 0 });
      await ceder();
    }

    const existentes = new Set<string>();
    const todas = [...chaves];
    for (let i = 0; i < todas.length; i += 2000) {
      const docs = await this.prisma.documentoXml.findMany({
        where: { empresa_id: empresaId, tipo: 'NFE', evento_tipo: '', sequencia: 0, conteudo: 'COMPLETO', storage_key: { not: null }, chave: { in: todas.slice(i, i + 2000) } },
        select: { chave: true },
      });
      for (const doc of docs) existentes.add(doc.chave);
    }
    for (const linha of cobertura) linha.faltantes = [...(leituras.get(linha.competencia) ?? [])].filter((chave) => !existentes.has(chave)).length;
    const pendentes = todas.filter((chave) => !existentes.has(chave));
    const { precos } = await this.custos.precos();
    const preco = precos[SERVICO];
    await this.prisma.recuperacaoXmlHistorico.deleteMany({
      where: { empresa_id: empresaId, situacao: 'PREVIA', createdAt: { lt: new Date(Date.now() - VALIDADE_PREVIA) } },
    });
    const lote = await this.prisma.recuperacaoXmlHistorico.create({
      data: { empresa_id: empresaId, solicitado_por: usuario, de, ate, chaves: pendentes.slice(0, TAMANHO_LOTE).map((chave) => ({ chave, competencia: competenciaPorChave.get(chave)! })), cobertura,
        total: Math.min(pendentes.length, TAMANHO_LOTE), preco_unitario: Number.isFinite(preco) && preco > 0 ? preco : null,
        mensagem: pendentes.length > TAMANHO_LOTE ? 'O período excede 5.000 chaves faltantes. Esta prévia inclui as primeiras 5.000. Para cobrir o restante, gere novas prévias por períodos menores.' : null },
    });
    return this.apresentar(lote);
  }

  async confirmar(empresaId: string, id: string, usuario: string) {
    const lote = await this.prisma.recuperacaoXmlHistorico.findFirst({ where: { id, empresa_id: empresaId, solicitado_por: usuario } });
    if (!lote) throw new NotFoundException('Prévia não localizada.');
    if (!this.configurado()) throw new BadRequestException('Configure o contrato Consulta NF-e do Serpro no servidor.');
    const { precos } = await this.custos.precos();
    if (!lote.total || !lote.preco_unitario || lote.preco_unitario !== precos[SERVICO]) {
      throw new BadRequestException('A prévia precisa ter chaves pendentes e preço vigente em Administração → Custos.');
    }
    try {
      const resultado = await this.prisma.recuperacaoXmlHistorico.updateMany({
        where: { id, situacao: 'PREVIA', createdAt: { gte: new Date(Date.now() - VALIDADE_PREVIA) } },
        data: { situacao: 'EM_FILA' },
      });
      if (!resultado.count) throw new ConflictException('Prévia vencida ou já autorizada.');
    } catch (erro) {
      if ((erro as { code?: string }).code === 'P2002') throw new ConflictException('Já existe uma recuperação em andamento nesta empresa.');
      throw erro;
    }
    return { id };
  }

  private async bearer() {
    if (this.token && this.token.expira > Date.now()) return this.token.valor;
    const basic = Buffer.from(process.env.SERPRO_NFE_CONSUMER_KEY?.trim() + ':' + process.env.SERPRO_NFE_CONSUMER_SECRET?.trim()).toString('base64');
    const resposta = await fetch(GATEWAY + '/token', {
      method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resposta.ok) { await resposta.body?.cancel(); throw new Error('Falha ao autenticar no Serpro.'); }
    const dados = await resposta.json() as { access_token?: string; expires_in?: number };
    if (!dados.access_token) throw new Error('O Serpro não enviou o token.');
    this.token = { valor: dados.access_token, expira: Date.now() + Math.max(0, (Number(dados.expires_in) || 0) - 60) * 1000 };
    return this.token.valor;
  }

  private async consultar(chave: string, bearer: string, lote: RecuperacaoXmlHistorico, documento: string) {
    const resposta = await fetch(GATEWAY + '/nfe/1/' + chave, {
      headers: { Authorization: 'Bearer ' + bearer, Accept: 'application/xml' },
      redirect: 'error', signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resposta.ok) {
      await resposta.body?.cancel();
      if (resposta.status === 404) return 'indisponiveis';
      if ([401, 403, 429].includes(resposta.status)) return 'interromper';
      return 'falhas';
    }

    await this.prisma.recuperacaoXmlHistorico.update({ where: { id: lote.id }, data: { cobradas: { increment: 1 } } });
    await registrarUso(this.prisma, SERVICO, lote.solicitado_por, lote.empresa_id, lote.id);
    const leitor = resposta.body?.getReader();
    if (!leitor) return 'falhas';
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      tamanho += value.length;
      if (tamanho > MAX_TAMANHO_XML) { await leitor.cancel(); return 'falhas'; }
      partes.push(value);
    }
    const buffer = Buffer.concat(partes);
    const indice = indiceHistorico(buffer, chave, documento);
    if (!indice) return 'falhas';
    const registro = await this.repo.registrar(lote.empresa_id, buffer, { origem: 'HISTORICO', usuario: lote.solicitado_por, indice });
    return registro.resultado === 'DUPLICADO' ? 'reaproveitadas'
      : registro.resultado === 'IGNORADO' ? 'falhas' : 'recuperadas';
  }

  @Cron('*/10 * * * * *')
  async processar() {
    if (this.executando || !this.configurado()) return;
    this.executando = true;
    try {
      const agora = new Date();
      const livre = { OR: [{ ocupado_ate: null }, { ocupado_ate: { lt: agora } }] };
      const lote = await this.prisma.recuperacaoXmlHistorico.findFirst({
        where: { situacao: 'EM_FILA', ...livre }, orderBy: { updatedAt: 'asc' },
      });
      if (!lote) return;
      const lease = new Date(agora.getTime() + 5 * 60_000);
      const reserva = await this.prisma.recuperacaoXmlHistorico.updateMany({
        where: { id: lote.id, situacao: 'EM_FILA', ...livre }, data: { ocupado_ate: lease },
      });
      if (!reserva.count) return;
      await this.processarLote(lote, lease);
    } catch {
      this.log.warn('Falha no processamento da recuperação histórica. A fila será retomada.');
    } finally {
      this.executando = false;
    }
  }

  private async processarLote(lote: RecuperacaoXmlHistorico, lease: Date) {
    const where = { id: lote.id, situacao: 'EM_FILA', ocupado_ate: lease };
    let situacao = 'EM_FILA';
    let mensagem: string | undefined;
    try {
      const empresa = await this.prisma.empresa.findUnique({ where: { id: lote.empresa_id }, select: { cnpj_cpf: true } });
      const documento = empresa?.cnpj_cpf?.replace(/\D/g, '');
      if (!documento) throw new Error('Empresa indisponível.');
      let cursor = lote.cursor;
      const cobertura = lote.cobertura as Cobertura[];
      const chaves = lote.chaves as { chave: string; competencia: string }[];
      for (const { chave, competencia } of chaves.slice(cursor, cursor + 8)) {
        const linha = cobertura.find((item) => item.competencia === competencia)!;
        const existente = await this.prisma.documentoXml.findFirst({
          where: { empresa_id: lote.empresa_id, tipo: 'NFE', chave, evento_tipo: '', sequencia: 0, conteudo: 'COMPLETO', storage_key: { not: null } }, select: { id: true },
        });
        const bearer = existente ? null : await this.bearer();
        // Reserva a tentativa antes da chamada externa. Uma interrupção do servidor nunca repete uma possível cobrança.
        const contador = existente ? 'reaproveitadas' : 'falhas';
        linha[contador] = (linha[contador] ?? 0) + 1;
        const dados: Prisma.RecuperacaoXmlHistoricoUpdateManyMutationInput = {
          cobertura,
          cursor: { increment: 1 },
          ...(existente ? { reaproveitadas: { increment: 1 } } : { falhas: { increment: 1 } }),
        };
        if (!(await this.prisma.recuperacaoXmlHistorico.updateMany({ where, data: dados })).count) return;
        cursor++;
        if (!bearer) continue;
        const resultado = await this.consultar(chave, bearer, lote, documento).catch(() => 'falhas' as const);
        if (resultado === 'interromper') {
          this.token = undefined;
          situacao = 'INTERROMPIDA';
          mensagem = 'O Serpro recusou o acesso ou limitou as consultas. Confira o contrato antes de gerar uma nova prévia.';
          break;
        }
        if (resultado !== 'falhas') {
          linha.falhas = (linha.falhas ?? 1) - 1;
          linha[resultado] = (linha[resultado] ?? 0) + 1;
          await this.prisma.recuperacaoXmlHistorico.updateMany({
            where, data: { cobertura, falhas: { decrement: 1 }, [resultado]: { increment: 1 } },
          });
        }
      }
      if (situacao === 'EM_FILA' && cursor >= lote.total) situacao = 'CONCLUIDA';
    } catch {
      situacao = 'INTERROMPIDA';
      mensagem = 'A recuperação foi interrompida. Confira a configuração e gere nova prévia para consultar as chaves restantes.';
    } finally {
      await this.prisma.recuperacaoXmlHistorico.updateMany({ where, data: { situacao, mensagem, ocupado_ate: null } });
    }
  }
}
