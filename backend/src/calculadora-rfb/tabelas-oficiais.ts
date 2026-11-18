/**
 * Leitura das tabelas oficiais do banco SQLite da calculadora da Receita (publicado pelo serviço calculadora-rfb na pasta
 * compartilhada). Lógica pura: recebe o caminho, devolve as linhas prontas para gravar no Postgres.
 */
type Linha = Record<string, unknown>;
type BancoSqlite = { prepare(sql: string): { all(...p: unknown[]): Linha[] }; close(): void };

const abrir = (arquivo: string): BancoSqlite => {
  // node:sqlite (Node 22+): leitura direta, sem dependência nova.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string, o?: { readOnly?: boolean }) => BancoSqlite };
  return new DatabaseSync(arquivo, { readOnly: true });
};

export type ClassTribOficial = {
  c_class_trib: string; cst: string; descricao: string; tipo_aliquota: string | null; nomenclatura: string | null; anexo: string | null;
  pct_reducao_cbs: number | null; pct_reducao_ibs: number | null; credito_adquirente: boolean; cred_pres_fornecedor: boolean; cred_pres_adquirente: boolean;
  documentos: string[]; fundamento_curto: string | null; fundamento_texto: string | null; inicio_vigencia: string; fim_vigencia: string | null;
};
export type VinculoOficial = {
  tipo: 'NCM' | 'NBS'; codigo: string; c_class_trib: string; anexo: string | null; item: string | null; excecoes: string[]; inicio_vigencia: string; fim_vigencia: string | null;
};
export type TabelasOficiais = { versao_db: string; data_db: string | null; classes: ClassTribOficial[]; vinculos: VinculoOficial[] };

const s = (v: unknown) => (v == null ? null : String(v));

export function lerTabelasOficiais(arquivo: string): TabelasOficiais {
  const db = abrir(arquivo);
  try {
    const versao = db.prepare('select VRBD_VERSAO_BASE_DADO v, VRBD_DATA d from VERSAO_BASE_DADO order by VRBD_ID desc limit 1').all()[0] ?? {};
    const reducao = new Map<string, number>();
    for (const r of db.prepare('select PERE_CLTR_ID id, PERE_TBTO_ID tb, PERE_VALOR v, PERE_FIM_VIGENCIA fim from PERCENTUAL_REDUCAO').all()) {
      if (r.fim == null) reducao.set(`${r.id}|${r.tb}`, Number(r.v));
    }
    const docs = new Map<number, string[]>();
    for (const r of db.prepare('select t.TDCL_CLTR_ID id, d.TPDF_SIGLA sigla from TIPO_DFE_CLASSIFICACAO t join TIPO_DFE d on d.TPDF_ID=t.TDCL_TPDF_ID where t.TDCL_FIM_VIGENCIA is null').all()) {
      docs.set(Number(r.id), [...(docs.get(Number(r.id)) ?? []), String(r.sigla)].sort());
    }
    const fund = new Map<number, { curto: string | null; texto: string | null }>();
    for (const r of db.prepare('select f.FDCL_CLTR_ID id, l.FDLG_TEXTO_CURTO curto, l.FDLG_TEXTO texto from FUNDAMENTACAO_CLASSIFICACAO f join FUNDAMENTACAO_LEGAL l on l.FDLG_ID=f.FDCL_FDLG_ID').all()) {
      fund.set(Number(r.id), { curto: s(r.curto), texto: s(r.texto) });
    }
    const classesSql = db.prepare(`select c.*, s.SITR_CD cst from CLASSIFICACAO_TRIBUTARIA c join SITUACAO_TRIBUTARIA s on s.SITR_ID=c.CLTR_SITR_ID`).all();
    const cdPorId = new Map(classesSql.map((c) => [Number(c.CLTR_ID), String(c.CLTR_CD)]));
    const classes: ClassTribOficial[] = classesSql.map((c) => {
      const id = Number(c.CLTR_ID);
      const red = (tb: number) => (reducao.has(`${id}|${tb}`) ? reducao.get(`${id}|${tb}`)! : null);
      return {
        c_class_trib: String(c.CLTR_CD), cst: String(c.cst), descricao: String(c.CLTR_DESCRICAO ?? ''), tipo_aliquota: s(c.CLTR_TIPO_ALIQUOTA),
        nomenclatura: s(c.CLTR_NOMENCLATURA), anexo: s(c.CLTR_ANEXO), pct_reducao_cbs: red(2), pct_reducao_ibs: red(3),
        credito_adquirente: Number(c.CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_CBS) === 1 || Number(c.CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_IBS) === 1,
        cred_pres_fornecedor: Number(c.CLTR_IN_CREDITO_PRESUMIDO_FORNECEDOR) === 1, cred_pres_adquirente: Number(c.CLTR_IN_CREDITO_PRESUMIDO_ADQUIRENTE) === 1,
        documentos: docs.get(id) ?? [], fundamento_curto: fund.get(id)?.curto ?? null, fundamento_texto: fund.get(id)?.texto ?? null,
        inicio_vigencia: String(c.CLTR_INICIO_VIGENCIA), fim_vigencia: s(c.CLTR_FIM_VIGENCIA),
      };
    });
    const anexos = new Map(db.prepare('select ANXO_ID id, ANXO_NUMERO n, ANXO_NUMERO_ITEM i from ANEXO').all().map((a) => [Number(a.id), { n: s(a.n), i: s(a.i) }]));
    const excNcm = new Map<number, string[]>();
    for (const e of db.prepare('select ENCM_NCMA_ID id, ENCM_NCM_CD cd from EXCECAO_NCM_APLICAVEL where ENCM_FIM_VIGENCIA is null').all()) {
      excNcm.set(Number(e.id), [...(excNcm.get(Number(e.id)) ?? []), String(e.cd)]);
    }
    const excNbs = new Map<number, string[]>();
    for (const e of db.prepare('select ENBS_NBSA_ID id, ENBS_NBS_CD cd from EXCECAO_NBS_APLICAVEL where ENBS_FIM_VIGENCIA is null').all()) {
      excNbs.set(Number(e.id), [...(excNbs.get(Number(e.id)) ?? []), String(e.cd)]);
    }
    const vinculos: VinculoOficial[] = [];
    for (const n of db.prepare('select * from NCM_APLICAVEL').all()) {
      const a = anexos.get(Number(n.NCMA_ANXO_ID));
      vinculos.push({ tipo: 'NCM', codigo: String(n.NCMA_NCM_CD), c_class_trib: cdPorId.get(Number(n.NCMA_CLTR_ID)) ?? '', anexo: a?.n ?? null, item: a?.i ?? null,
        excecoes: excNcm.get(Number(n.NCMA_ID)) ?? [], inicio_vigencia: String(n.NCMA_INICIO_VIGENCIA), fim_vigencia: s(n.NCMA_FIM_VIGENCIA) });
    }
    for (const n of db.prepare('select * from NBS_APLICAVEL').all()) {
      const a = anexos.get(Number(n.NBSA_ANXO_ID));
      vinculos.push({ tipo: 'NBS', codigo: String(n.NBSA_NBS_CD), c_class_trib: cdPorId.get(Number(n.NBSA_CLTR_ID)) ?? '', anexo: a?.n ?? null, item: a?.i ?? null,
        excecoes: excNbs.get(Number(n.NBSA_ID)) ?? [], inicio_vigencia: String(n.NBSA_INICIO_VIGENCIA), fim_vigencia: s(n.NBSA_FIM_VIGENCIA) });
    }
    return { versao_db: String(versao.v ?? ''), data_db: s(versao.d), classes, vinculos: vinculos.filter((v) => v.c_class_trib) };
  } finally {
    db.close();
  }
}
