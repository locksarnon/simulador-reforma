import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { registrarUso } from '../custos/custos.service';
import { StorageService } from '../storage/storage.service';
import { MonitoramentoService } from '../monitoramento/monitoramento.service';
import { hojeEmBrasilia, utcDe } from '../tarefas/tarefas.regras';
import { situacaoDoDocumento } from '../documentos/documentos.service';
import { interpretarCertidao, interpretarCertidaoGenerica, LeituraCertidao, textoDoPdf } from './leitor-certidoes';
import { SerproCertidoes } from './serpro-certidoes';
import { InfosimplesService, ResultadoCertidao } from '../infosimples/infosimples.service';

type Usuario = { email?: string; id?: string } | undefined;
export type TipoCertidaoCliente = 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL' | 'TRABALHISTA' | 'FGTS';

/** As cinco certidões do cliente, com o tipo de documento já cadastrado em Arquivos e documentos (migração 20261111150000). */
export const CERTIDOES: { tipo: TipoCertidaoCliente; rotulo: string; tipoDocumento: string; portal: string | null; como: string }[] = [
  { tipo: 'FEDERAL', rotulo: 'CND federal (Receita e PGFN)', tipoDocumento: 'CND federal (Receita e PGFN)', portal: 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj', como: '' },
  { tipo: 'ESTADUAL', rotulo: 'CND estadual', tipoDocumento: 'CND estadual', portal: null, como: '' },
  { tipo: 'MUNICIPAL', rotulo: 'CND municipal', tipoDocumento: 'CND municipal', portal: null, como: '' },
  { tipo: 'TRABALHISTA', rotulo: 'CNDT (débitos trabalhistas)', tipoDocumento: 'CNDT (débitos trabalhistas)', portal: 'https://cndt-certidao.tst.jus.br/inicio.faces', como: '' },
  { tipo: 'FGTS', rotulo: 'CRF do FGTS', tipoDocumento: 'CRF do FGTS', portal: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf', como: '' },
];
const DEF = new Map(CERTIDOES.map((c) => [c.tipo, c]));
const PASTA = 'Certidões';
/** dd/mm/aaaa → meio-dia UTC do mesmo dia (a data não muda com o fuso). */
const isoDeBr = (br: string | null) => { const m = String(br ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`) : null; };
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/**
 * BPO Fiscal > Monitoramento > Certidões: as certidões já emitidas do cliente, em PDF, com situação e validade. A federal sai pela
 * API Consulta CND (produção com as chaves); as demais vêm por anexo do PDF baixado no portal oficial, e o InTAX lê o documento.
 * Tudo fica em Arquivos e documentos (pasta Certidões), com o aviso de vencimento do sino.
 */
@Injectable()
export class CertidoesService {
  private readonly log = new Logger(CertidoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly serpro: SerproCertidoes,
    private readonly monitoramento: MonitoramentoService,
    private readonly infosimples: InfosimplesService,
  ) {}

  private async empresa(id: string) {
    const e = await this.prisma.empresa.findUnique({ where: { id }, select: { id: true, razao_social: true, cnpj_cpf: true, uf: true, municipio: true } });
    if (!e) throw new NotFoundException('Cliente não encontrado.');
    return e;
  }

  private async tiposPorNome() {
    const tipos = await this.prisma.tipoDocumento.findMany({ where: { nome: { in: CERTIDOES.map((c) => c.tipoDocumento) } } });
    return new Map(tipos.map((t) => [t.nome, t]));
  }

  async listar(empresaId: string) {
    const e = await this.empresa(empresaId);
    const tipos = await this.tiposPorNome();
    const ids = [...tipos.values()].map((t) => t.id);
    const docs = await this.prisma.documentoEmpresa.findMany({ where: { empresa_id: empresaId, tipo_id: { in: ids } }, orderBy: [{ emissao: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }] });
    const arquivos = await this.prisma.arquivoEmpresa.findMany({ where: { id: { in: docs.map((d) => d.arquivo_id).filter(Boolean) as string[] } } });
    const arq = new Map(arquivos.map((a) => [a.id, a]));
    const hoje = utcDe(hojeEmBrasilia());
    const modo = await this.monitoramento.modo();
    const cndApi = modo === 'PRODUCAO' && !!(await this.serpro.disponivelEmProducao('cnd'));
    const infosimples = (await this.infosimples.estado()).configurado;
    return {
      empresa: { id: e.id, razao_social: e.razao_social, cnpj: so(e.cnpj_cpf), uf: e.uf ?? null, municipio: e.municipio ?? null },
      emissao_automatica_federal: cndApi,
      emissao_automatica: { FEDERAL: cndApi, TRABALHISTA: infosimples, FGTS: infosimples },
      modo,
      certidoes: CERTIDOES.map((c) => {
        const t = tipos.get(c.tipoDocumento);
        const lista = t ? docs.filter((d) => d.tipo_id === t.id) : [];
        const atual = lista[0];
        const a = atual?.arquivo_id ? arq.get(atual.arquivo_id) : null;
        return {
          ...c,
          atual: atual ? {
            id: atual.id, emissao: atual.emissao, validade: atual.validade, numero: atual.numero, descricao: atual.descricao, criado_por: atual.criado_por,
            situacao: situacaoDoDocumento(atual.validade, t?.alerta_dias ?? 15, hoje),
            arquivo: a ? { id: a.id, nome: a.nome } : null,
          } : null,
          anteriores: lista.length - (atual ? 1 : 0),
          // Todas as certidões guardadas da esfera, da mais nova para a mais antiga (tabela da subaba).
          historico: lista.map((d) => {
            const x = d.arquivo_id ? arq.get(d.arquivo_id) : null;
            return {
              id: d.id, emissao: d.emissao, validade: d.validade, numero: d.numero, descricao: d.descricao, criado_por: d.criado_por, createdAt: d.createdAt,
              situacao: situacaoDoDocumento(d.validade, t?.alerta_dias ?? 15, hoje),
              origem: /(API Consulta CND)/.test(d.descricao ?? '') ? 'API Consulta CND (Serpro)' : /(Infosimples)/.test(d.descricao ?? '') ? 'Portal oficial, pela Infosimples' : 'PDF do portal oficial',
              arquivo: x ? { id: x.id, nome: x.nome } : null,
            };
          }),
        };
      }),
    };
  }

  /** Guarda o PDF na pasta Certidões do cliente e cria o documento com validade (o sino avisa antes de vencer). */
  private async guardar(empresaId: string, tipo: TipoCertidaoCliente, pdf: Buffer, nome: string, l: { emissao: string | null; validade: string | null; numero: string | null; situacao: string }, usuario: Usuario, mime = 'application/pdf') {
    const tipos = await this.tiposPorNome();
    const t = tipos.get(DEF.get(tipo)!.tipoDocumento);
    const chave = `arquivos/empresa/${empresaId}/${randomUUID()}-${nome}`;
    await this.storage.guardar(chave, pdf, mime);
    const quem = usuario?.email ?? usuario?.id ?? 'InTAX';
    const arquivo = await this.prisma.arquivoEmpresa.create({ data: { empresa_id: empresaId, pasta: PASTA, nome, tamanho: pdf.length, tipo_mime: mime, storage_key: chave, enviado_por: quem } });
    return this.prisma.documentoEmpresa.create({
      data: {
        empresa_id: empresaId, tipo_id: t?.id ?? null, descricao: `${DEF.get(tipo)!.rotulo}: ${l.situacao}`.slice(0, 300), numero: l.numero?.slice(0, 80) ?? null,
        emissao: isoDeBr(l.emissao), validade: isoDeBr(l.validade), arquivo_id: arquivo.id, criado_por: quem,
      },
    });
  }

  /** Anexa a certidão baixada no portal e lê situação, validade e CNPJ. A validade informada na tela vence a lida. */
  async anexar(empresaId: string, tipo: string, pdf: Buffer | undefined, validadeInformada: string | undefined, usuario: Usuario) {
    const def = DEF.get(tipo as TipoCertidaoCliente);
    if (!def) throw new BadRequestException('Tipo de certidão desconhecido.');
    if (!pdf?.length) throw new BadRequestException('Envie o PDF da certidão.');
    if (pdf.length > 10 * 1024 * 1024) throw new BadRequestException('O PDF passa de 10 MB.');
    const e = await this.empresa(empresaId);
    let texto = '';
    try { texto = await textoDoPdf(pdf); } catch (err) { throw new BadRequestException(`Não consegui ler o PDF: ${(err as Error).message}`); }
    const cnpj = so(e.cnpj_cpf);
    let l: LeituraCertidao;
    if (tipo === 'FEDERAL') l = interpretarCertidao('PGFN', texto, cnpj);
    else if (tipo === 'TRABALHISTA') l = interpretarCertidao('TRABALHISTA', texto, cnpj);
    else if (tipo === 'FGTS') l = interpretarCertidao('FGTS', texto, cnpj);
    else l = interpretarCertidaoGenerica(texto, cnpj);
    if (validadeInformada) {
      const m = String(validadeInformada).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) throw new BadRequestException('Validade inválida. Use AAAA-MM-DD.');
      l = { ...l, validade: `${m[3]}/${m[2]}/${m[1]}` };
    }
    if (!texto.trim()) l = { ...l, status: 'MANUAL', resumo: 'O PDF não tem texto (imagem escaneada): informe a validade na tela.', situacao: 'não lida' };
    if (l.situacao === 'documento não reconhecido') throw new BadRequestException(l.resumo);
    const doc = await this.guardar(empresaId, def.tipo, pdf, `${def.rotulo} ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, '-'), l, usuario);
    return { leitura: l, documento_id: doc.id, avisos: [!l.confere && texto.trim() ? 'O CNPJ da certidão não é o deste cliente (ou não foi lido). Confira o PDF.' : '', !l.validade ? 'A validade não foi lida: edite o documento em Arquivos e documentos ou anexe de novo informando a data.' : ''].filter(Boolean) };
  }

  /**
   * Todo dia às 06:45 (Brasília), em produção e com a API Consulta CND contratada: para cada cliente do BPO fiscal sem CND federal
   * válida, ou com ela vencendo em até 15 dias, emite e guarda a certidão. Ninguém precisa anexar nada.
   */
  @Cron('45 6 * * *', { timeZone: 'America/Sao_Paulo' })
  async rotinaFederal(agora = new Date()) {
    if (String(process.env.MONITORAMENTO_AGENDADOR ?? '').toLowerCase() === 'off') return { emitidas: 0, motivo: 'desligado no servidor' };
    const fontes: TipoCertidaoCliente[] = [];
    if ((await this.monitoramento.modo()) === 'PRODUCAO' && (await this.serpro.disponivelEmProducao('cnd'))) fontes.push('FEDERAL');
    if (process.env.NODE_ENV === 'production' && (await this.infosimples.estado()).configurado) fontes.push('TRABALHISTA', 'FGTS');
    if (!fontes.length) return { emitidas: 0, motivo: 'sem fonte automática configurada' };
    const bpo = await this.prisma.servicoContratado.findMany({ where: { tipo: 'BPO_FISCAL', situacao: 'ATIVO' }, select: { empresa_id: true } });
    const tipos = await this.tiposPorNome();
    // O CRF do FGTS vale 30 dias: renova com 5 dias de folga; as outras com 15.
    const folga = (t: TipoCertidaoCliente) => (t === 'FGTS' ? 5 : 15);
    let emitidas = 0;
    for (const empresaId of [...new Set(bpo.map((b) => b.empresa_id))]) {
      for (const tipo of fontes) {
        const t = tipos.get(DEF.get(tipo)!.tipoDocumento);
        const limite = new Date(agora.getTime() + folga(tipo) * 86_400_000);
        const vigente = t ? await this.prisma.documentoEmpresa.findFirst({ where: { empresa_id: empresaId, tipo_id: t.id, validade: { gt: limite } } }) : null;
        if (vigente) continue;
        try { if ((await this.emitir(empresaId, tipo, { email: 'rotina diária' })).emitida) emitidas++; } catch (e) { this.log.warn(`${tipo} de ${empresaId}: ${(e as Error).message}`); }
      }
    }
    return { emitidas };
  }

  /** Emite pela fonte automática do tipo: federal pela API Consulta CND; CNDT e CRF pela Infosimples. */
  async emitir(empresaId: string, tipo: string, usuario: Usuario) {
    if (tipo === 'FEDERAL') return this.emitirFederal(empresaId, usuario);
    if (tipo !== 'TRABALHISTA' && tipo !== 'FGTS') throw new BadRequestException('Sem emissão automática: anexe o PDF do portal.');
    const e = await this.empresa(empresaId);
    const cnpj = so(e.cnpj_cpf);
    if (cnpj.length !== 14) throw new BadRequestException('O cliente não tem CNPJ válido no cadastro.');
    const r: ResultadoCertidao | null = tipo === 'TRABALHISTA' ? await this.infosimples.cndt(cnpj) : await this.infosimples.crf(cnpj);
    if (r) await registrarUso(this.prisma, tipo === 'TRABALHISTA' ? 'INFOSIMPLES_CNDT' : 'INFOSIMPLES_CRF', usuario?.email ?? null, empresaId, cnpj);
    if (!r) throw new BadRequestException('Infosimples não configurada: anexe o PDF do portal.');
    if (r.status === 'INDISPONIVEL' || !r.comprovante) return { emitida: false, resumo: r.resumo, status: r.status, detalhes: r.detalhes };
    const def = DEF.get(tipo)!;
    await this.guardar(empresaId, tipo, r.comprovante.buffer, `${def.rotulo} ${new Date().toISOString().slice(0, 10)}.${r.comprovante.extensao}`, { emissao: r.emissao, validade: r.validade, numero: r.numero, situacao: `${r.situacao} (Infosimples)` }, usuario, r.comprovante.tipo);
    return { emitida: true, resumo: r.resumo, status: r.status, detalhes: r.detalhes };
  }

  /** Emite a CND federal pela API Consulta CND (só em produção, com as chaves do produto) e guarda o PDF. */
  async emitirFederal(empresaId: string, usuario: Usuario) {
    const e = await this.empresa(empresaId);
    const cnpj = so(e.cnpj_cpf);
    if (cnpj.length !== 14) throw new BadRequestException('O cliente não tem CNPJ válido no cadastro.');
    const modo = await this.monitoramento.modo();
    if (modo !== 'PRODUCAO') throw new BadRequestException('A emissão automática da CND federal só funciona em produção (no modo demonstração o Serpro devolve uma certidão fictícia).');
    const r = await this.serpro.certidaoFederal(cnpj, modo);
    if (r && !r.demonstracao) await registrarUso(this.prisma, 'SERPRO_CND', usuario?.email ?? null, empresaId, cnpj);
    if (!r) throw new BadRequestException('API Consulta CND não configurada: anexe o PDF do portal.');
    if (r.status !== 'CONCLUIDO' || !r.pdf) return { emitida: false, resumo: r.resumo, status: r.status, detalhes: r.detalhes };
    const det = (rot: string) => r.detalhes.find((d) => d.rotulo === rot)?.valor ?? null;
    await this.guardar(empresaId, 'FEDERAL', r.pdf, `CND federal ${new Date().toISOString().slice(0, 10)}.pdf`, { emissao: det('Emissão'), validade: det('Validade'), numero: det('Código de controle'), situacao: `${det('Situação') ?? 'emitida'} (API Consulta CND)` }, usuario);
    return { emitida: true, resumo: r.resumo, status: r.status, detalhes: r.detalhes };
  }
}
