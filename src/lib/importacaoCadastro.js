/**
 * Importação do cadastro de empresas por planilha: lê o cabeçalho pelo nome (sem ligar para acento e maiúscula), casa cada linha
 * com a empresa que já existe pelo CNPJ/CPF (ou pelo ID da empresa) e separa o que é novo, o que muda e o que tem erro.
 * Célula vazia não apaga dado que já existe.
 */
export const CAMPOS = [
  { campo: "razao_social", rotulo: "Razão social", nomes: ["razao social", "razao", "nome", "empresa"] },
  { campo: "cnpj_cpf", rotulo: "CNPJ/CPF", nomes: ["cnpj/cpf", "cnpj", "cpf", "cnpj cpf", "documento"] },
  { campo: "id_empresa", rotulo: "ID empresa", nomes: ["id empresa", "id", "codigo", "código"] },
  { campo: "grupo", rotulo: "Grupo", nomes: ["grupo", "numero do grupo", "grupo economico"] },
  { campo: "regime_atual", rotulo: "Regime", nomes: ["regime", "regime atual", "regime tributario"] },
  { campo: "uf", rotulo: "UF", nomes: ["uf", "estado"] },
  { campo: "municipio", rotulo: "Município", nomes: ["municipio", "cidade"] },
  { campo: "setor", rotulo: "Setor", nomes: ["setor", "segmento"] },
  { campo: "inscricao_estadual", rotulo: "Inscrição estadual", nomes: ["inscricao estadual", "ie"] },
  { campo: "produtor_rural", rotulo: "Produtor rural", nomes: ["produtor rural"] },
  { campo: "responsavel_fiscal", rotulo: "Responsável fiscal", nomes: ["responsavel fiscal", "responsavel"] },
  { campo: "email_contato", rotulo: "E-mail de contato", nomes: ["e-mail de contato", "email de contato", "e-mail", "email"] },
  { campo: "whatsapp_contato", rotulo: "WhatsApp de contato", nomes: ["whatsapp de contato", "whatsapp", "telefone", "celular"] },
  { campo: "observacao", rotulo: "Observação", nomes: ["observacao", "obs"] },
  // Dados públicos do CNPJ (Receita Federal): vêm sozinhos pelo CNPJ, mas também podem ir e voltar pela planilha.
  { campo: "nome_fantasia", rotulo: "Nome fantasia", nomes: ["nome fantasia", "fantasia"] },
  { campo: "situacao_cadastral", rotulo: "Situação cadastral", nomes: ["situacao cadastral", "situacao"] },
  { campo: "data_abertura", rotulo: "Data de abertura", nomes: ["data de abertura", "abertura", "inicio de atividade"], tipo: "data" },
  { campo: "matriz_filial", rotulo: "Matriz ou filial", nomes: ["matriz ou filial", "matriz/filial"] },
  { campo: "natureza_juridica", rotulo: "Natureza jurídica", nomes: ["natureza juridica"] },
  { campo: "porte", rotulo: "Porte", nomes: ["porte"] },
  { campo: "capital_social", rotulo: "Capital social", nomes: ["capital social", "capital"], tipo: "numero" },
  { campo: "opcao_simples", rotulo: "Optante do Simples", nomes: ["optante do simples", "simples"], tipo: "booleano" },
  { campo: "opcao_mei", rotulo: "MEI", nomes: ["mei", "optante do mei"], tipo: "booleano" },
  { campo: "cnae_principal", rotulo: "CNAE principal", nomes: ["cnae principal", "cnae"] },
  { campo: "cnae_descricao", rotulo: "Descrição do CNAE", nomes: ["descricao do cnae", "atividade principal"] },
  { campo: "cnaes_secundarios", rotulo: "CNAEs secundários", nomes: ["cnaes secundarios", "atividades secundarias"], tipo: "cnaes" },
  { campo: "logradouro", rotulo: "Logradouro", nomes: ["logradouro", "endereco", "rua"] },
  { campo: "numero", rotulo: "Número", nomes: ["numero", "nº"] },
  { campo: "complemento", rotulo: "Complemento", nomes: ["complemento"] },
  { campo: "bairro", rotulo: "Bairro", nomes: ["bairro"] },
  { campo: "cep", rotulo: "CEP", nomes: ["cep"] },
  { campo: "codigo_municipio_ibge", rotulo: "Código IBGE do município", nomes: ["codigo ibge do municipio", "codigo ibge", "ibge"] },
  { campo: "telefone_receita", rotulo: "Telefone (Receita)", nomes: ["telefone (receita)", "telefone receita"] },
  { campo: "email_receita", rotulo: "E-mail (Receita)", nomes: ["e-mail (receita)", "email (receita)", "email receita"] },
  { campo: "socios", rotulo: "Sócios", nomes: ["socios", "quadro societario", "qsa"], tipo: "socios" },
];

/** Exemplo do modelo: uma linha com o formato esperado de cada coluna. */
export const EXEMPLO_MODELO = {
  razao_social: "EXEMPLO AGRO LTDA", cnpj_cpf: "00.000.000/0001-00", id_empresa: "00000000", grupo: "001", regime_atual: "Lucro Presumido", uf: "MT", municipio: "Sorriso",
  setor: "Agronegócio", inscricao_estadual: "131234567", produtor_rural: "Não", responsavel_fiscal: "Nome do responsável", email_contato: "fiscal@exemplo.com.br",
  whatsapp_contato: "(66) 99999-0000", observacao: "", nome_fantasia: "EXEMPLO AGRO", situacao_cadastral: "ATIVA", data_abertura: "2010-03-01", matriz_filial: "MATRIZ",
  natureza_juridica: "Sociedade Empresária Limitada", porte: "DEMAIS", capital_social: "100000.00", opcao_simples: "Não", opcao_mei: "Não", cnae_principal: "4623108",
  cnae_descricao: "Comércio atacadista de matérias-primas agrícolas", cnaes_secundarios: "0115600 - Cultivo de soja | 0111302 - Cultivo de milho", logradouro: "AVENIDA DAS ÁRVORES",
  numero: "100", complemento: "SALA 1", bairro: "CENTRO", cep: "78890-000", codigo_municipio_ibge: "5107925", telefone_receita: "6635440000", email_receita: "contato@exemplo.com.br",
  socios: "FULANO DE TAL (Sócio-Administrador) | BELTRANA (Sócio)",
};

/** Valor do cadastro → texto da planilha (listas e sim/não legíveis). */
export function valorParaPlanilha(campo, v) {
  const c = CAMPOS.find((x) => x.campo === campo);
  if (v === null || v === undefined) return "";
  if (c?.tipo === "booleano") return v === true ? "Sim" : v === false ? "Não" : String(v);
  if (c?.tipo === "cnaes" && Array.isArray(v)) return v.map((x) => `${x.codigo} - ${x.descricao}`).join(" | ");
  if (c?.tipo === "socios" && Array.isArray(v)) return v.map((x) => `${x.nome}${x.qualificacao ? ` (${x.qualificacao})` : ""}`).join(" | ");
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** Texto da planilha → valor do cadastro (com o motivo, quando não dá para ler). */
export function valorDaPlanilha(campo, x) {
  const c = CAMPOS.find((y) => y.campo === campo);
  if (c?.tipo === "booleano") { const n = norm(x); if (["sim", "s", "true", "1", "x"].includes(n)) return { valor: true }; if (["nao", "n", "false", "0"].includes(n)) return { valor: false }; return { erro: `${c.rotulo}: use Sim ou Não (veio "${x}")` }; }
  if (c?.tipo === "numero") { const t = String(x).replace(/[R$\s]/g, ""); const num = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")); return Number.isFinite(num) ? { valor: num } : { erro: `${c.rotulo}: número inválido (${x})` }; }
  if (c?.tipo === "data") { const m = String(x).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : String(x).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? { valor: iso } : { erro: `${c.rotulo}: use AAAA-MM-DD ou DD/MM/AAAA (${x})` }; }
  if (c?.tipo === "cnaes") return { valor: String(x).split("|").map((p) => p.trim()).filter(Boolean).map((p) => { const m = p.match(/^([\d./-]+)\s*-?\s*(.*)$/); return { codigo: (m?.[1] ?? p).replace(/\D/g, ""), descricao: (m?.[2] ?? "").trim() }; }) };
  if (c?.tipo === "socios") return { valor: String(x).split("|").map((p) => p.trim()).filter(Boolean).map((p) => { const m = p.match(/^(.*?)\s*\(([^)]*)\)\s*$/); return { nome: (m?.[1] ?? p).trim(), qualificacao: (m?.[2] ?? "").trim() }; }) };
  return { valor: x };
}
export const REGIMES_VALIDOS = ["Lucro Real", "Lucro Presumido", "Simples Nacional", "MEI", "Produtor rural PF"];
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const digitos = (s) => String(s ?? "").replace(/\D/g, "");

/** Qual coluna da planilha é qual campo (pelo nome do cabeçalho). */
export function mapearCabecalho(cabecalho) {
  const mapa = {};
  cabecalho.forEach((h, i) => {
    const n = norm(h);
    const c = CAMPOS.find((x) => x.nomes.includes(n) || norm(x.rotulo) === n);
    if (c && mapa[c.campo] === undefined) mapa[c.campo] = i;
  });
  return mapa;
}

/** Lê CSV com ";" ou "," (o que aparecer no cabeçalho) e aspas. */
export function lerCsv(texto) {
  const t = String(texto).replace(/^﻿/, "");
  const sep = (t.split(/\r?\n/)[0].match(/;/g) || []).length >= (t.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
  const linhas = [];
  let atual = [""];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { atual[atual.length - 1] += '"'; i++; } else if (ch === '"') aspas = false; else atual[atual.length - 1] += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) atual.push("");
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; linhas.push(atual); atual = [""]; }
    else atual[atual.length - 1] += ch;
  }
  if (atual.length > 1 || atual[0] !== "") linhas.push(atual);
  return linhas.filter((l) => l.some((c) => String(c).trim()));
}

/** Compara a planilha com o cadastro: novas, a atualizar (só o que muda) e erros, com o motivo. */
export function analisarImportacao(linhas, empresas, grupos, arquivadas = []) {
  if (!linhas.length) return { novas: [], atualizar: [], erros: [{ linha: 1, motivo: "Planilha vazia." }], sem_mudanca: 0 };
  const mapa = mapearCabecalho(linhas[0]);
  if (mapa.razao_social === undefined && mapa.cnpj_cpf === undefined) return { novas: [], atualizar: [], erros: [{ linha: 1, motivo: 'O cabeçalho precisa ter "Razão social" ou "CNPJ/CPF".' }], sem_mudanca: 0 };
  const porDoc = new Map(empresas.filter((e) => digitos(e.cnpj_cpf)).map((e) => [digitos(e.cnpj_cpf), e]));
  const porId = new Map(empresas.filter((e) => e.id_empresa).map((e) => [norm(e.id_empresa), e]));
  const numerosDeGrupo = new Set(grupos.map((g) => String(g.numero)));
  const arquivadaPorDoc = new Map(arquivadas.filter((e) => digitos(e.cnpj_cpf)).map((e) => [digitos(e.cnpj_cpf), e]));
  const novas = []; const atualizar = []; const erros = []; let semMudanca = 0;
  linhas.slice(1).forEach((l, k) => {
    const n = k + 2;
    const v = {};
    for (const [campo, i] of Object.entries(mapa)) { const x = String(l[i] ?? "").trim(); if (x) v[campo] = x; }
    if (v.uf) v.uf = v.uf.toUpperCase();
    if (v.uf && !UFS.includes(v.uf)) return erros.push({ linha: n, motivo: `UF inválida: ${v.uf}` });
    if (v.regime_atual) { const r = REGIMES_VALIDOS.find((x) => norm(x) === norm(v.regime_atual)); if (!r) return erros.push({ linha: n, motivo: `Regime não reconhecido: ${v.regime_atual} (use ${REGIMES_VALIDOS.join(", ")})` }); v.regime_atual = r; }
    if (v.email_contato && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email_contato)) return erros.push({ linha: n, motivo: `E-mail inválido: ${v.email_contato}` });
    if (v.cnpj_cpf && ![11, 14].includes(digitos(v.cnpj_cpf).length)) return erros.push({ linha: n, motivo: `CNPJ/CPF com número de dígitos errado: ${v.cnpj_cpf}` });
    if (v.grupo && !numerosDeGrupo.has(v.grupo)) return erros.push({ linha: n, motivo: `Grupo ${v.grupo} não existe. Crie o grupo antes em Clientes > Grupos econômicos.` });
    for (const [campo, x] of Object.entries(v)) {
      const r = valorDaPlanilha(campo, x);
      if (r.erro) return erros.push({ linha: n, motivo: r.erro });
      v[campo] = r.valor;
    }
    const existente = (v.cnpj_cpf && porDoc.get(digitos(v.cnpj_cpf))) || (v.id_empresa && porId.get(norm(v.id_empresa)));
    const arquivada = !existente && v.cnpj_cpf && arquivadaPorDoc.get(digitos(v.cnpj_cpf));
    if (arquivada) return erros.push({ linha: n, motivo: `${arquivada.razao_social} está arquivado: desarquive em Clientes (filtro Arquivados) para atualizar.` });
    if (existente) {
      const mudancas = Object.fromEntries(Object.entries(v).filter(([c, x]) => c !== "cnpj_cpf" && valorParaPlanilha(c, existente[c]) !== valorParaPlanilha(c, x)));
      if (Object.keys(mudancas).length) atualizar.push({ linha: n, id: existente.id, razao_social: existente.razao_social, mudancas });
      else semMudanca++;
      return undefined;
    }
    if (!v.razao_social) return erros.push({ linha: n, motivo: "Empresa nova sem razão social." });
    novas.push({ linha: n, dados: { status: "Ativa", id_empresa: v.id_empresa || (digitos(v.cnpj_cpf) || v.razao_social).slice(0, 20), ...v } });
    return undefined;
  });
  return { novas, atualizar, erros, sem_mudanca: semMudanca };
}

/** Vínculos colaborador ↔ empresa por planilha (colunas CNPJ/CPF e e-mail do colaborador): agrupa por colaborador. */
export function analisarVinculos(linhas, empresas, colaboradores) {
  const cab = (linhas[0] || []).map(norm);
  const iDoc = cab.findIndex((h) => ["cnpj/cpf", "cnpj", "cpf", "documento"].includes(h));
  const iMail = cab.findIndex((h) => ["e-mail do colaborador", "email do colaborador", "colaborador", "e-mail", "email"].includes(h));
  if (iDoc < 0 || iMail < 0) return { porColaborador: [], erros: [{ linha: 1, motivo: 'O cabeçalho precisa ter "CNPJ/CPF" e "E-mail do colaborador".' }] };
  const porDoc = new Map(empresas.filter((e) => digitos(e.cnpj_cpf)).map((e) => [digitos(e.cnpj_cpf), e]));
  const porEmail = new Map(colaboradores.map((c) => [c.email.toLowerCase(), c]));
  const grupos = new Map();
  const erros = [];
  linhas.slice(1).forEach((l, k) => {
    const e = porDoc.get(digitos(l[iDoc]));
    const c = porEmail.get(String(l[iMail] ?? "").trim().toLowerCase());
    if (!e) return erros.push({ linha: k + 2, motivo: `Empresa não encontrada pelo CNPJ/CPF ${l[iDoc] ?? ""}` });
    if (!c) return erros.push({ linha: k + 2, motivo: `Colaborador não encontrado (ou desativado): ${l[iMail] ?? ""}` });
    const g = grupos.get(c.id) ?? { user_id: c.id, nome: c.name || c.email, empresa_ids: [] };
    if (!g.empresa_ids.includes(e.id)) g.empresa_ids.push(e.id);
    grupos.set(c.id, g);
    return undefined;
  });
  return { porColaborador: [...grupos.values()], erros };
}

/** Lê um arquivo .xlsx (primeira aba) ou .csv em linhas de texto. */
export async function lerPlanilha(arquivo) {
  if (/\.csv$/i.test(arquivo.name)) return lerCsv(await arquivo.text());
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.worksheets[0];
  const linhas = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const valores = [];
    for (let i = 1; i <= ws.columnCount; i++) { const c = row.getCell(i).value; valores.push(c === null || c === undefined ? "" : typeof c === "object" ? (c.text ?? c.result ?? String(c)) : String(c)); }
    linhas.push(valores);
  });
  return linhas;
}
