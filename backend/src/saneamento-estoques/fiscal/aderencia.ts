/**
 * Alerta atividade (CNAE) × CFOP: o cliente emite CFOPs típicos de uma atividade que ele não confirmou?
 * Só famílias que se justificam pela estrutura do CFOP (1º dígito: 3 = entrada do exterior, 7 = saída para o exterior) ou pela
 * descrição da tabela de CFOP do próprio repositório (backend/src/cfop/cfop.regras.ts). Nada além disso: é ALERTA, nunca bloqueio.
 * ESTADO: a função está pronta, mas NÃO está ligada: o sistema ainda não tem origem de dados para os CFOPs mais usados do cliente
 * (viria dos XML/EFD do Repositório). Depende dessa fonte; o relatório final do projeto deve listá-la como lacuna.
 * Limite conhecido: não há CFOP exclusivo de venda de sucata/resíduos na tabela; esse alerta não é feito.
 */
import type { Atividade } from './atividades';
import { descricaoCfop, somenteDigitos } from '../../cfop/cfop.regras';

export type FamiliaCfop = { id: string; rotulo: string; esperadas: Atividade[]; justificativa: string; casa: (cfop4: string) => boolean };

const sufixo = (c: string) => c.slice(1);
const SUF_PRODUCAO = new Set(['101', '103', '105', '107', '109', '111', '113', '118', '122']);
const SUF_TERCEIROS = new Set(['102', '104', '106', '108', '110', '112', '114', '115', '119', '120', '123']);
const SUF_TRANSPORTE = new Set(['351', '352', '353', '354', '355', '356', '357', '932']);
const saida = (c: string) => ['5', '6'].includes(c[0]);

export const FAMILIAS_CFOP: FamiliaCfop[] = [
  { id: 'EXPORTACAO', rotulo: 'Saída para o exterior', esperadas: ['EXPORTACAO'], justificativa: 'CFOP iniciado em 7 = saída para o exterior (estrutura do CFOP)', casa: (c) => c[0] === '7' },
  { id: 'IMPORTACAO', rotulo: 'Entrada do exterior', esperadas: ['IMPORTACAO'], justificativa: 'CFOP iniciado em 3 = entrada do exterior (estrutura do CFOP)', casa: (c) => c[0] === '3' },
  { id: 'VENDA_PRODUCAO_PROPRIA', rotulo: 'Venda de produção do estabelecimento', esperadas: ['PRODUCAO_AGRICOLA', 'PECUARIA', 'PRODUCAO_FLORESTAL', 'INDUSTRIALIZACAO'], justificativa: 'Descrição da tabela de CFOP: "venda de produção do estabelecimento"', casa: (c) => saida(c) && SUF_PRODUCAO.has(sufixo(c)) },
  { id: 'VENDA_MERCADORIA_TERCEIROS', rotulo: 'Venda de mercadoria adquirida de terceiros', esperadas: ['REVENDA_INSUMOS', 'COMERCIO_ATACADISTA', 'COMERCIO_VAREJISTA'], justificativa: 'Descrição da tabela de CFOP: "venda de mercadoria adquirida ou recebida de terceiros"', casa: (c) => saida(c) && SUF_TERCEIROS.has(sufixo(c)) },
  { id: 'TRANSPORTE', rotulo: 'Prestação de serviço de transporte', esperadas: ['TRANSPORTE'], justificativa: 'Descrição da tabela de CFOP: "prestação de serviço de transporte"', casa: (c) => saida(c) && SUF_TRANSPORTE.has(sufixo(c)) },
];

export type CfopUsado = { cfop: string; quantidade?: number; valor?: number };
export type Divergencia = {
  cfop: string; descricaoCfop: string | null; familia: string; rotuloFamilia: string; atividadesEsperadas: Atividade[];
  quantidade: number | null; valor: number | null; motivo: string; justificativa: string;
};

export function compararAtividadeComCfop(atividades: string[], cfopsMaisUsados: (CfopUsado | string)[]): Divergencia[] {
  const out: Divergencia[] = [];
  const vistos = new Set<string>();
  for (const bruto of cfopsMaisUsados) {
    const u: CfopUsado = typeof bruto === 'string' ? { cfop: bruto } : bruto;
    const c = somenteDigitos(u.cfop);
    if (c.length !== 4 || vistos.has(c)) continue;
    vistos.add(c);
    for (const f of FAMILIAS_CFOP) {
      if (!f.casa(c) || f.esperadas.some((a) => atividades.includes(a))) continue;
      out.push({
        cfop: c, descricaoCfop: descricaoCfop(c), familia: f.id, rotuloFamilia: f.rotulo, atividadesEsperadas: f.esperadas,
        quantidade: u.quantidade ?? null, valor: u.valor ?? null,
        motivo: `O CFOP ${c} (${f.rotulo.toLowerCase()}) aparece, mas nenhuma atividade confirmada o explica (esperadas: ${f.esperadas.join(', ')})`, justificativa: f.justificativa,
      });
    }
  }
  return out.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0) || (b.quantidade ?? 0) - (a.quantidade ?? 0) || a.cfop.localeCompare(b.cfop));
}
