// Conhecimento versionado dos ADD-ONS (PIMS, FARMBOX). Referências documentais não habilitam correções automáticas.
// O conhecimento de ERP mora só no Cadastro de ERPs (Administração > Configuração e ERPs): as orientações do PIMS integrado a um ERP
// (ex.: PIMS Multicultivos + TOTVS Protheus) são itens do perfil daquele ERP, com a chave "PIMS <linha> · <título>", e chegam aqui pelo perfil.
export const ADDONS = [{ id:'pims', nome:'PIMS' },{ id:'farmbox', nome:'FARMBOX' }];
export const LINHAS_PIMS = ['Não informado','Multicultivos','CS / Bioenergia','Outro / legado'];
export const CONHECIMENTO_SISTEMAS = [
 { id:'pims-operacoes-insumo', addon:'pims', linha:'CS / Bioenergia', titulo:'Operações permitidas por insumo', orientacao:'Inclua os vínculos entre insumos e operações na revisão cadastral quando a instalação usar esse controle.', evidencia:'O artigo descreve uma configuração que valida as operações associadas aos insumos no apontamento.', campos:['FG_INSU_OPER'], fonte:'https://centraldeatendimento.totvs.com/hc/pt-br/articles/12890836452503-Agro-PIMS-CS-APT-ATRC-Apontamento-de-Insumo-Agr%C3%ADcola', versaoFonte:'PIMS CS, APT_ATRC, versão 12; artigo de 05/06/2026', conferidoEm:'2026-10-16', situacao:'documentado', automatica:false },
 { id:'farmbox-unidade-dose', addon:'farmbox', titulo:'Compatibilidade da unidade de dosagem', orientacao:'Reconheça as duas grafias documentadas do campo de unidade e confirme sua equivalência no layout exportado.', evidencia:'O histórico da API registra a correção de dosage_unit e a compatibilidade com o nome legado dosage_unity.', campos:['dosage_unit','dosage_unity'], fonte:'https://farmbox.cc/api-docs/changelog', versaoFonte:'API v1; alteração de 18/05/2026', conferidoEm:'2026-10-16', situacao:'documentado', automatica:false },
 { id:'farmbox-dependencias', addon:'farmbox', titulo:'Dependências dos cadastros', orientacao:'Verifique referências a outros registros antes de sugerir remoção de um item.', evidencia:'O contrato da API documenta falhas de exclusão quando o registro possui dependências.', campos:[], fonte:'https://farmbox.cc/api-docs/changelog', versaoFonte:'API v1; histórico de alterações', conferidoEm:'2026-10-16', situacao:'documentado', automatica:false },
];
const LINHA_GENERICA = (linha) => !linha || linha === 'Não informado' || linha === 'Outro / legado';
const casaLinha = (r, linha) => !r.linha || LINHA_GENERICA(linha) || r.linha === linha;

/**
 * Orientações de add-on guardadas no perfil do ERP (Cadastro de ERPs): itens ativos cuja chave é "<ADD-ON> <linha> · <título>" e cujo texto
 * traz "Evidência: ...", "Revisão da fonte: ..." e "Conferido em dd/mm/aaaa.". Devolve no formato das orientações dos add-ons.
 */
export function orientacoesDoPerfil(perfil) {
 if (!perfil || perfil.ativo === false) return [];
 const out = [];
 for (const i of perfil.itens || []) {
  if (i.ativo === false) continue;
  const m = /^(\S+)\s+(.+?)\s+·\s+(.+)$/.exec(String(i.chave || ''));
  const addon = m && ADDONS.find((a) => a.nome.toLowerCase() === m[1].toLowerCase());
  if (!addon) continue;
  const t = String(i.texto || '');
  const conf = /\s*Conferido em (\d{2})\/(\d{2})\/(\d{4})\.?\s*$/.exec(t);
  const semConf = conf ? t.slice(0, conf.index) : t;
  const [antesRev, versaoFonte = ''] = semConf.split(/\s*Revisão da fonte:\s*/);
  const [orientacao, evidencia = ''] = antesRev.split(/\s*Evidência:\s*/);
  out.push({
   id: i.id, addon: addon.id, erp: perfil.nome, linha: m[2], titulo: m[3], orientacao: orientacao.trim(), evidencia: evidencia.trim(),
   campos: String(i.campo_erp || '').split(',').map((c) => c.trim()).filter(Boolean), fonte: i.fonte_url || '',
   versaoFonte: versaoFonte.replace(/\.$/, '').trim(), conferidoEm: conf ? `${conf[3]}-${conf[2]}-${conf[1]}` : '', situacao: 'documentado', grau: i.grau,
   automatica: false, origem: 'Cadastro de ERPs',
  });
 }
 return out;
}

/**
 * Orientações para a empresa: as dos add-ons sem ERP (acima) e as do perfil do ERP da empresa (Cadastro de ERPs, pelo erp_id).
 * Só entram os add-ons vinculados e a linha do PIMS informada (linha não informada ou legado mostra todas).
 */
export function conhecimentoDaEmpresa(empresa, perfil = null) {
 const addons = Array.isArray(empresa?.addons) ? empresa.addons : [];
 const linha = empresa?.addons_versoes?.pims?.linha;
 return [...CONHECIMENTO_SISTEMAS, ...orientacoesDoPerfil(perfil)].filter((r) => addons.includes(r.addon) && casaLinha(r, linha));
}
