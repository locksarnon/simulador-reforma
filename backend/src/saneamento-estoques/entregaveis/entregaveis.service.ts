import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PdfService } from '../../pdf/pdf.service';
import { SanVersoesService } from '../dados/versoes.service';
import type { DadosEntrega, EntregaveisPort } from '../dados/portas';
import { gerarExcelDeDados } from './excel';
import { montarRelatorio } from './relatorio';

/** Nome de arquivo seguro (ASCII, sem espaços): o cliente vira "agropecuaria-crestani-ltda". */
export function fatiaDoNome(texto: string): string {
  const s = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'cliente';
}

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF = 'application/pdf';

export function nomeDoExcel(cliente: string, versao: { numero: number } | null, hoje = new Date()): string {
  const base = `saneamento-estoques_${fatiaDoNome(cliente)}`;
  return versao ? `${base}_entrega-v${versao.numero}.xlsx` : `${base}_revisao_${hoje.toISOString().slice(0, 10)}.xlsx`;
}
export const nomeDoRelatorio = (cliente: string, versao: { numero: number }) => `relatorio-fechamento_${fatiaDoNome(cliente)}_v${versao.numero}.pdf`;

/** Entregáveis do Saneamento de Estoques: Excel de 6 abas e relatório de fechamento em PDF. É o provider do token SAN_ENTREGAVEIS. */
@Injectable()
export class EntregaveisService implements EntregaveisPort {
  constructor(private readonly pdf: PdfService, private readonly versoes: SanVersoesService, private readonly prisma: PrismaService) {}

  gerarExcel(dados: DadosEntrega): Promise<Buffer> { return gerarExcelDeDados(dados); }

  async gerarRelatorioPdf(dados: DadosEntrega): Promise<Buffer> {
    if (!dados.liberada || !dados.versao) throw new BadRequestException('O relatório de fechamento é gerado a partir de uma versão liberada.');
    return this.pdf.gerar(montarRelatorio(dados));
  }

  /** Dados da versão (liberada) ou da base atual (revisão), com o nome do cliente e do projeto para o cabeçalho. */
  async dados(projetoId: string, versaoId?: string): Promise<DadosEntrega> {
    const d = versaoId ? await this.versoes.exportar(projetoId, versaoId) : await this.versoes.exportarAtual(projetoId);
    const { foto: _foto, ...dados } = d as DadosEntrega & { foto?: unknown };
    const projeto = dados.projeto;
    const empresa = projeto.empresa_id ? await this.prisma.empresa.findUnique({ where: { id: String(projeto.empresa_id) }, select: { razao_social: true, cnpj_cpf: true } }) : null;
    const diag = projeto.diagnostico_id ? await this.prisma.projetoDiagnostico.findUnique({ where: { id: String(projeto.diagnostico_id) }, select: { nome: true } }) : null;
    return { ...dados, projeto: { ...projeto, clienteNome: empresa?.razao_social ?? '', clienteDocumento: empresa?.cnpj_cpf ?? '', diagnosticoNome: diag?.nome ?? '' } };
  }

  async excel(projetoId: string, versaoId?: string): Promise<{ buffer: Buffer; nome: string }> {
    const dados = await this.dados(projetoId, versaoId);
    return { buffer: await this.gerarExcel(dados), nome: nomeDoExcel(String(dados.projeto.clienteNome ?? ''), dados.versao) };
  }

  /** Sem `versaoId`, usa a última versão liberada; sem nenhuma versão, recusa. */
  async relatorio(projetoId: string, versaoId?: string): Promise<{ buffer: Buffer; nome: string }> {
    let id = versaoId;
    if (!id) {
      const [ultima] = await this.versoes.listar(projetoId);
      if (!ultima) throw new BadRequestException('Libere uma versão do cadastro antes de gerar o relatório de fechamento.');
      id = ultima.id;
    }
    const dados = await this.dados(projetoId, id);
    return { buffer: await this.gerarRelatorioPdf(dados), nome: nomeDoRelatorio(String(dados.projeto.clienteNome ?? ''), dados.versao!) };
  }
}
