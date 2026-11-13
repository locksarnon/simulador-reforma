import ExcelJS from 'exceljs';

/** Página oficial da documentação técnica da NFS-e (Reforma Tributária), onde a Receita publica as versões do Anexo VIII. */
export const PAGINA_RTC = 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc';

export type LinhaAnexoVIII = {
  item_lc116: string | null; descricao_item: string | null; nbs: string | null; descricao_nbs: string | null;
  ps_onerosa: string | null; adq_exterior: string | null; cod_ativ_sn: string | null; descricao_ativ_sn: string | null;
  ind_op: string | null; local_incidencia_ibs: string | null; c_class_trib: string | null; nome_class_trib: string | null; fonte: string;
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Cabeçalhos aceitos de cada campo (as versões 1.00, 1.01 e 1.02 mudaram nomes e colunas). */
const COLUNAS: Record<Exclude<keyof LinhaAnexoVIII, 'fonte'>, string[]> = {
  item_lc116: ['itemlc116', 'itemlistaservico', 'itemsubitem', 'itemlc1162003'],
  descricao_item: ['descricaoitem', 'descricaolc116', 'descricaodoservico', 'descricaoservico'],
  nbs: ['nbs', 'codigonbs'],
  descricao_nbs: ['descricaonbs'],
  ps_onerosa: ['psonerosa', 'psonerosasn', 'prestacaoonerosa'],
  adq_exterior: ['adqexterior', 'adqexteriorsn', 'adquirenteexterior'],
  cod_ativ_sn: ['codativsn'],
  descricao_ativ_sn: ['descricaoativsn'],
  ind_op: ['indop', 'cindop', 'indicadordaoperacao'],
  local_incidencia_ibs: ['localincidenciaibs', 'localdeincidenciaibs'],
  c_class_trib: ['cclasstrib', 'classtrib'],
  nome_class_trib: ['nomecclasstrib', 'nomeclasstrib', 'descricaocclasstrib', 'descricaoclasstrib'],
};

function texto(cell: ExcelJS.Cell): string {
  const v = (cell.isMerged ? cell.master.value : cell.value) as unknown;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join('').trim();
    return String(o.result ?? o.text ?? '').trim();
  }
  return String(v).trim();
}

/**
 * Lê a planilha oficial do Anexo VIII (aba com Item LC 116, NBS e cClassTrib). Recusa layout não reconhecido: nunca preenche
 * lacunas por inferência.
 */
export async function lerAnexoVIII(buffer: Buffer, fonte: string): Promise<LinhaAnexoVIII[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
      const cols: Partial<Record<keyof typeof COLUNAS, number>> = {};
      ws.getRow(r).eachCell((cell, c) => {
        const s = norm(texto(cell));
        for (const [k, nomes] of Object.entries(COLUNAS)) if (nomes.includes(s) && !cols[k as keyof typeof COLUNAS]) cols[k as keyof typeof COLUNAS] = c;
      });
      if (!cols.item_lc116 || !cols.nbs || !cols.c_class_trib) continue;
      if (!cols.descricao_nbs || !cols.ind_op) throw new Error('Layout do Anexo VIII não reconhecido: faltam a descrição da NBS ou o indicador de operação.');
      const linhas: LinhaAnexoVIII[] = [];
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const l = { fonte } as LinhaAnexoVIII;
        for (const k of Object.keys(COLUNAS) as (keyof typeof COLUNAS)[]) l[k] = cols[k] ? texto(ws.getCell(i, cols[k]!)) || null : null;
        if (!l.item_lc116 || !l.nbs || !/\d/.test(l.nbs)) continue;
        linhas.push(l);
      }
      const unicas = [...new Map(linhas.map((l) => [JSON.stringify(l), l])).values()];
      if (unicas.length < 100) throw new Error(`O Anexo VIII veio com só ${unicas.length} linhas: nada foi alterado.`);
      return unicas;
    }
  }
  throw new Error('Layout do Anexo VIII não reconhecido: nenhuma aba com Item LC 116, NBS e cClassTrib.');
}

/** Número de versão comparável (1.02.00 → 10200). */
const numero = (v: string) => v.split('.').reduce((s, p) => s * 100 + Number(p), 0);

/**
 * A versão mais nova do Anexo VIII entre os links da página oficial. Os nomes mudam de uma versão para outra
 * (ex.: "anexoviii-correlacao…_v1-01-00.xlsx" e "anexo_viii-tabela-correlacao-v01-02-00-20261026.xlsx").
 */
export function ultimaVersaoNaPagina(html: string, base = PAGINA_RTC): { url: string; versao: string } | null {
  const achadas: { url: string; versao: string }[] = [];
  for (const m of html.matchAll(/href="([^"]+\.xlsx)"/gi)) {
    const url = new URL(m[1], base).toString();
    const nome = url.split('/').pop()!.toLowerCase();
    if (!/anexo_?viii/.test(nome)) continue;
    const v = nome.match(/v0?(\d+)-(\d{2})-(\d{2})/);
    if (v) achadas.push({ url, versao: `${Number(v[1])}.${v[2]}.${v[3]}` });
  }
  achadas.sort((a, b) => numero(b.versao) - numero(a.versao));
  return achadas[0] ?? null;
}
