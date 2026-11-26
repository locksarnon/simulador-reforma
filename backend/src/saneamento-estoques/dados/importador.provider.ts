import { BadRequestException, Injectable } from '@nestjs/common';
import { analisarArquivo, importarArquivo, CAMPOS_BASE, type CampoBase, type Mapeamento } from '../importacao';
import type { EntradaImportacao, ImportadorPort, SaidaImportacao } from './portas';

const norm = (s: string) => s.trim().toLowerCase();

/** Código sem o prefixo "tamanho:estabelecimento|" da chave de reconciliação. */
const codigoDaChave = (chave: string | null) => (chave && chave.includes('|') ? chave.slice(chave.indexOf('|') + 1) : chave);

/**
 * ImportadorPort real: liga o importador do Agente 2 (`../importacao`) ao contrato do serviço.
 * Mapeamento do serviço = campo → NOME da coluna no arquivo; o do importador = campo → ÍNDICE. Sem mapeamento, vale a sugestão do arquivo.
 */
@Injectable()
export class ImportadorPlanilha implements ImportadorPort {
  async ler(e: EntradaImportacao): Promise<SaidaImportacao> {
    const arquivo = { buffer: e.arquivo, originalname: e.nomeArquivo };
    const { previa, sugestao } = await analisarArquivo(arquivo);
    let mapeamento: Mapeamento;
    if (e.mapeamento && Object.keys(e.mapeamento).length) {
      mapeamento = {};
      for (const [campo, coluna] of Object.entries(e.mapeamento)) {
        if (!(CAMPOS_BASE as readonly string[]).includes(campo)) throw new BadRequestException(`Campo desconhecido no mapeamento: ${campo}.`);
        const i = previa.cabecalho.findIndex((c) => norm(c) === norm(String(coluna)));
        if (i < 0) throw new BadRequestException(`A coluna "${coluna}" (campo ${campo}) não existe no arquivo.`);
        mapeamento[campo as CampoBase] = i;
      }
    } else mapeamento = sugestao.mapeamento;
    const unico = e.estabelecimentos.length === 1 ? e.estabelecimentos[0] : null;
    const r = await importarArquivo(arquivo, { mapeamento, colunasExtras: 'demais', estabelecimentoFixo: unico, separadorAnterior: e.separadorAnterior }, previa.cabecalho);
    const usado: Record<string, string> = {};
    for (const [campo, v] of Object.entries(r.relatorio.mapeamentoUsado)) if (v) usado[campo] = v.nome;
    const motivo = (l: { ocorrencias: string[] }) => l.ocorrencias.join('; ');
    return {
      itens: r.itens.map((it, i) => ({ ...it, linha: r.origem[i].linhaOrigem })),
      mapeamento: usado,
      previa: {
        colunas: previa.cabecalho.map((nome, indice) => ({ indice, nome })),
        sugestaoColunas: sugestao.colunas,
        amostra: r.amostra,
      },
      relatorio: {
        aceitas: r.relatorio.totais.aceitas, rejeitadas: r.relatorio.totais.rejeitadas, pendentes: r.relatorio.totais.pendentes,
        linhasRejeitadas: r.relatorio.linhasRejeitadas.map((l) => ({ linha: l.linha, codigo: codigoDaChave(l.chave), motivo: motivo(l) })),
        linhasPendentes: r.relatorio.linhasPendentes.map((l) => ({ linha: l.linha, codigo: codigoDaChave(l.chave), motivo: motivo(l) })),
        avisos: r.relatorio.avisos, separadores: r.relatorio.separadores, separadorMudou: r.relatorio.separadorMudou,
      },
    };
  }
}
