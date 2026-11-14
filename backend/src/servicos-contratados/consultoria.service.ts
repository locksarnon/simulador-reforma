import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { textoDoSped } from '../receitanetbx/sped-cabecalho';
import { lerEfd, lerMit } from './perfil-fiscal';

const r = 'Reforma Tributária';
const c = 'Créditos e Oportunidades Tributárias';
const p = 'Planejamento Tributário';
export const CATALOGO_CONSULTORIA = [
  { id: 'pf-ibs-cbs', publico: 'PF', area: r, nome: 'Enquadramento e opção de IBS/CBS do produtor rural' },
  { id: 'pf-homologacao', publico: 'PF', area: r, nome: 'Homologação fiscal do ERP para IBS/CBS do produtor rural' },
  { id: 'cruzamentos-pf', publico: 'PF', area: 'Outros Serviços Tributários', nome: 'Revisão de Cruzamentos Fiscais' },
  { id: 'lcdpr', publico: 'PF', area: c, nome: 'Revisão do livro-caixa rural (LCDPR)' },
  { id: 'simulador-reforma', publico: 'PJ', area: r, nome: 'Simulador da Reforma Tributária', projeto: true, acessos: [
    { nome: 'Painel Executivo', rota: '/cockpit' }, { nome: 'Comparação de regimes na transição', rota: '/reforma/regimes' },
    { nome: 'Cenários e alíquotas', rota: '/cenarios' }, { nome: 'Transição 2026–2033', rota: '/transicao' },
  ] },
  { id: 'pj-homologacao', publico: 'PJ', area: r, nome: 'Homologação fiscal do ERP para IBS/CBS' },
  { id: 'pis-cofins', publico: 'PJ', area: c, nome: 'Créditos de PIS e Cofins' },
  { id: 'credito-estoque', publico: 'PJ', area: c, nome: 'Crédito presumido de estoque', acessos: [{ nome: 'Abrir calculadora de estoque', rota: '/ferramentas/credito-estoque' }] },
  { id: 'tributos-pagos', publico: 'PJ', area: c, nome: 'Conciliação de tributos pagos' },
  { id: 'irpj-csll', publico: 'PJ', area: c, nome: 'Revisão de saldos de IRPJ e CSLL' },
  { id: 'regimes-exercicio', publico: 'PJ', area: p, nome: 'Escolha do regime tributário para o exercício' },
  { id: 'virada-exercicio', publico: 'PJ', area: p, nome: 'Análise de virada de exercício' },
  { id: 'conciliacao-escrituracoes', publico: 'PJ', area: 'Outros Serviços Tributários', nome: 'Revisão de Cruzamentos Fiscais' },
];

export function servicosConsultoria(valor: unknown, publico: 'PF' | 'PJ') {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.some((id) => !CATALOGO_CONSULTORIA.some((s) => s.id === id && s.publico === publico))) {
    throw new BadRequestException('Serviço de consultoria incompatível com o cadastro.');
  }
  return [...new Set<string>(valor)];
}

@Injectable()
export class ConsultoriaService {
  constructor(private readonly prisma: PrismaService, private readonly storage?: StorageService) {}

  async perfilFiscal(id: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id }, select: { cnpj_cpf: true } });
    const cnpj = (empresa?.cnpj_cpf ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (cnpj.length !== 14) throw new NotFoundException('Pessoa jurídica não encontrada.');
    const [consultas, escrituracoes] = await Promise.all([
      this.prisma.consultaFiscal.findMany({ where: { empresa_id: id, chave: 'mit-apuracao', sucesso: true, simulado: false },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 240, select: { id: true, dados: true, createdAt: true } }),
      this.prisma.spedDownload.findMany({ where: { empresa_id: id, escrituracao: 'EFD_CONTRIBUICOES', situacao: 'GUARDADO', arquivo_id: { not: null } },
        orderBy: [{ retificadora: 'desc' }, { createdAt: 'desc' }], take: 120 }),
    ]);
    const porMes = new Map<string, { mit: NonNullable<ReturnType<typeof lerMit>>; id: string; data: Date; conflito: boolean }>();
    for (const consulta of consultas) {
      const mit = lerMit(consulta.dados);
      if (!mit) continue;
      const atual = porMes.get(mit.competencia);
      if (!atual) porMes.set(mit.competencia, { mit, id: consulta.id, data: consulta.createdAt, conflito: false });
      else if (atual.mit.forma !== mit.forma || (atual.mit.metodo && mit.metodo && atual.mit.metodo !== mit.metodo)) atual.conflito = true;
    }
    const arquivos = await this.prisma.arquivoEmpresa.findMany({
      where: { empresa_id: id, id: { in: [...new Set(escrituracoes.map((x) => x.arquivo_id!))] } },
      select: { id: true, nome: true, tamanho: true, storage_key: true },
    });
    const mapaArquivos = new Map(arquivos.map((a) => [a.id, a]));
    const meses = [...new Set([...porMes.keys(), ...escrituracoes.map((e) => e.competencia)])].filter((s) => /^\d{4}-\d{2}$/.test(s)).sort().reverse();
    const historico = [];
    for (const competencia of meses) {
      const mit = porMes.get(competencia);
      const candidatos = escrituracoes.filter((e) => e.competencia === competencia);
      const preferidos = candidatos.filter((e) => e.retificadora === candidatos[0]?.retificadora);
      // Sem ordem oficial de transmissão, não escolher arbitrariamente entre arquivos distintos.
      const ids = [...new Set(preferidos.map((e) => e.arquivo_id!))];
      const arquivo = ids.length === 1 ? mapaArquivos.get(ids[0]) : undefined;
      let criterio: string | null = null;
      if (mit?.mit.forma === 'Lucro Presumido' && !mit.conflito && arquivo && arquivo.tamanho <= 20 * 1024 * 1024 && this.storage) {
        try {
          criterio = lerEfd(textoDoSped(await this.storage.getObjectBuffer(arquivo.storage_key)), cnpj, competencia);
        } catch { /* fonte indisponível: manter sem confirmação */ }
      }
      historico.push({
        competencia, forma: !mit?.conflito ? mit?.mit.forma ?? null : null,
        metodo: !mit?.conflito ? mit?.mit.metodo ?? null : null,
        pis_cofins: criterio, irpj_csll: criterio === 'Caixa' ? 'Caixa' : null,
        fonte_mit: mit ? { id: mit.id, data: mit.data } : null,
        fonte_efd: arquivo ? { id: arquivo.id, nome: arquivo.nome } : null,
        pendencia: mit?.conflito ? 'Apurações do MIT divergem nesta competência.'
          : !mit ? 'Aguardando importação do MIT.'
          : mit.mit.forma === 'Lucro Presumido' && !criterio ? (ids.length > 1 ? 'Há versões distintas da EFD-Contribuições sem ordem de transmissão confirmada.' : 'Aguardando EFD-Contribuições válida para a competência.')
          : criterio === 'Competência' ? 'IRPJ e CSLL: conferir a memória de apuração do trimestre.'
          : mit.mit.forma === 'Lucro Real Anual' && !mit.mit.metodo ? 'Método mensal não informado no MIT.' : null,
      });
    }
    return historico;
  }

  private async donoDocumentos(servico: string, id: string) {
    const item = CATALOGO_CONSULTORIA.find((s) => s.id === servico);
    if (!item) throw new NotFoundException('Serviço não encontrado.');
    const chave = { publico: item.publico, cliente_id: id, servico };
    const vinculo = await this.prisma.vinculoConsultoria.findUnique({ where: { publico_cliente_id_servico: chave } });
    if (!vinculo) throw new NotFoundException('Vincule o cliente ao serviço para controlar os documentos.');
    if (item.publico === 'PF') {
      const pessoa = await this.prisma.pessoaFisica.findUnique({ where: { id }, select: { id: true } });
      if (!pessoa) throw new NotFoundException('Pessoa física não encontrada.');
      return { chave, dono: { pessoa_fisica_id: id, empresa_id: null } };
    }
    const empresa = await this.prisma.empresa.findFirst({ where: { id, arquivado_em: null }, select: { id: true } });
    if (!empresa) throw new NotFoundException('Empresa ativa não encontrada.');
    return { chave, dono: { empresa_id: id, pessoa_fisica_id: null } };
  }

  async documentos(servico: string, id: string, de: string, ate: string) {
    const data = (v: string) => {
      const d = new Date(v + 'T00:00:00.000Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(+d) || d.toISOString().slice(0, 10) !== v) {
        throw new BadRequestException('Informe datas válidas.');
      }
      return d;
    };
    const inicio = data(de), fim = data(ate);
    if (inicio > fim || fim.getUTCFullYear() - inicio.getUTCFullYear() > 20) throw new BadRequestException('Informe um período válido.');
    fim.setUTCDate(fim.getUTCDate() + 1);
    const { chave, dono } = await this.donoDocumentos(servico, id);
    const [arquivos, controles, sped, xml] = await Promise.all([
      this.prisma.arquivoEmpresa.findMany({ where: dono, select: { id: true, nome: true, pasta: true }, orderBy: { nome: 'asc' } }),
      this.prisma.controleDocumentoConsultoria.findMany({ where: chave }),
      dono.empresa_id ? this.prisma.spedDownload.findMany({ where: { empresa_id: id, situacao: 'GUARDADO' },
        select: { competencia: true, periodo_inicio: true, periodo_fim: true, escrituracao: true, arquivos: true, arquivo_id: true } }) : [],
      dono.empresa_id ? this.prisma.documentoXml.groupBy({ by: ['tipo'], where: {
        empresa_id: id, conteudo: 'COMPLETO', storage_key: { not: null }, evento_tipo: '',
        data_emissao: { gte: inicio, lt: fim },
      }, _count: { _all: true } }) : [],
    ]);
    return { arquivos, controles, sped, xml: xml.map((r) => ({ tipo: r.tipo, total: r._count._all })) };
  }

  async controlarDocumento(servico: string, id: string, entrada: Record<string, unknown>, email?: string) {
    const { chave, dono } = await this.donoDocumentos(servico, id);
    const { item, periodo, situacao, arquivo_id } = entrada;
    if (typeof item !== 'string' || !item || item.length > 500 || typeof periodo !== 'string' ||
      !/^\d{4}(?:-\d{2}(?:-\d{2}\/\d{4}-\d{2}-\d{2})?)?$/.test(periodo) ||
      typeof situacao !== 'string' || !['PENDENTE', 'RECEBIDO', 'VALIDADO', 'DIVERGENTE', 'NAO_APLICAVEL'].includes(situacao)) {
      throw new BadRequestException('Item, período ou situação inválidos.');
    }
    if (arquivo_id != null && (typeof arquivo_id !== 'string' ||
      !await this.prisma.arquivoEmpresa.findFirst({ where: { id: arquivo_id, ...dono }, select: { id: true } }))) {
      throw new BadRequestException('Escolha um arquivo deste contribuinte.');
    }
    if (['RECEBIDO', 'VALIDADO', 'DIVERGENTE'].includes(situacao) && !arquivo_id) {
      throw new BadRequestException('Vincule uma evidência do repositório.');
    }
    const dados = { situacao, arquivo_id: typeof arquivo_id === 'string' ? arquivo_id : null, atualizado_por: email };
    const identificador = { ...chave, item, periodo };
    return this.prisma.controleDocumentoConsultoria.upsert({
      where: { publico_cliente_id_servico_item_periodo: identificador },
      create: { ...identificador, ...dados }, update: dados,
    });
  }

  listar() {
    return this.prisma.vinculoConsultoria.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async vincular(entrada: { servico?: string; cliente_id?: string }, email?: string) {
    const servico = CATALOGO_CONSULTORIA.find((s) => s.id === entrada.servico);
    const id = entrada.cliente_id;
    if (!servico || typeof id !== 'string' || !id) throw new BadRequestException('Escolha o cliente e o serviço.');
    const cliente = servico.publico === 'PF'
      ? await this.prisma.pessoaFisica.findUnique({ where: { id }, select: { id: true } })
      : await this.prisma.empresa.findFirst({ where: { id, arquivado_em: null }, select: { cnpj_cpf: true } });
    if (!cliente || ('cnpj_cpf' in cliente && (cliente.cnpj_cpf ?? '').replace(/[^a-z0-9]/gi, '').length !== 14)) {
      throw new NotFoundException('Cliente ativo não encontrado para este serviço.');
    }
    const chave = { publico: servico.publico, cliente_id: id, servico: servico.id };
    const where = { publico_cliente_id_servico: chave };
    try {
      return await this.prisma.vinculoConsultoria.upsert({ where, create: { ...chave, criado_por: email }, update: {} });
    } catch (erro) {
      if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2002') throw erro;
      const existente = await this.prisma.vinculoConsultoria.findUnique({ where });
      if (!existente) throw erro;
      return existente;
    }
  }
}
