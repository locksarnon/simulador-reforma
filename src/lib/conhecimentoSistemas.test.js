import { describe, it, expect } from 'vitest';
import { CONHECIMENTO_SISTEMAS, conhecimentoDaEmpresa, orientacoesDoPerfil, ADDONS } from './conhecimentoSistemas';
import { CARGA_ERPS, idDoItemDaCarga } from '../../backend/src/erps/carga';

// Perfil do TOTVS Protheus como o servidor devolve (/erps/:id/perfil), montado da carga do Cadastro de ERPs.
const cargaProtheus = CARGA_ERPS.find((e) => e.id === 'erp-totvs-protheus');
const PERFIL_PROTHEUS = {
  id: cargaProtheus.id, nome: cargaProtheus.nome, situacao: cargaProtheus.situacao, ativo: true,
  itens: cargaProtheus.itens.map((i, ordem) => ({ id: idDoItemDaCarga(cargaProtheus.id, i.k), tipo: i.tipo, tipo_ajuste: i.tipo_ajuste ?? null, chave: i.chave, texto: i.texto, campo_erp: i.campo_erp ?? null, fonte_url: i.fonte_url, grau: i.grau, ordem, ativo: true })),
};
const PERFIL_SAP = { id: 'erp-sap-b1', nome: 'SAP Business One', situacao: 'COMPLETO', ativo: true, itens: [] };
const pims = (linha) => ({ erp_id: 'erp-totvs-protheus', erp: 'Protheus', addons: ['pims'], addons_versoes: { pims: { linha } } });

describe('base de conhecimento dos sistemas', () => {
  it('add-ons à parte (a lista de ERPs é o Cadastro de ERPs)', () => { expect(ADDONS.map((a) => a.id)).toEqual(['pims', 'farmbox']); });
  it('nenhum conhecimento de ERP fica fora do Cadastro de ERPs (só add-ons sem ERP aqui)', () => {
    expect(CONHECIMENTO_SISTEMAS.every((r) => !r.erp)).toBe(true);
    expect(CONHECIMENTO_SISTEMAS.map((r) => r.id)).not.toContain('pims-codigo-erp');
  });
  it('as orientações PIMS + Protheus vêm do perfil do ERP, sem perder fonte, revisão da fonte, data de conferência e situação', () => {
    const r = orientacoesDoPerfil(PERFIL_PROTHEUS);
    expect(r.map((x) => x.id)).toEqual(['pims-codigo-erp', 'pims-campos-item', 'pims-vinculos'].map((k) => idDoItemDaCarga('erp-totvs-protheus', k)));
    const [a, b] = r;
    expect(a).toMatchObject({ addon: 'pims', linha: 'Multicultivos', erp: 'TOTVS Protheus', titulo: 'Código interno e código do ERP', campos: ['B1_COD', 'CD_INT_ERP'],
      fonte: 'https://tdn.totvs.com/pages/viewpage.action?pageId=351372629', versaoFonte: 'Documento legado, atualizado em 18/04/2018', conferidoEm: '2026-10-16',
      situacao: 'documentado', grau: 'CONFIRMADO', automatica: false, origem: 'Cadastro de ERPs' });
    expect(a.orientacao).toBe('Compare o vínculo de integração antes de classificar códigos diferentes como produtos duplicados.');
    expect(a.evidencia).toMatch(/^A documentação distingue o código interno do PIMS/i);
    expect(b.campos).toEqual(['B1_COD', 'B1_DESC', 'B1_UM', 'B1_TIPO', 'B1_GRUPO']);
    // Item desativado no cadastro some das telas.
    expect(orientacoesDoPerfil({ ...PERFIL_PROTHEUS, itens: PERFIL_PROTHEUS.itens.map((i) => ({ ...i, ativo: !i.chave.startsWith('PIMS') })) })).toEqual([]);
  });
  it('empresa com Protheus (erp_id) e PIMS Multicultivos recebe as 3 orientações do cadastro; com SAP, nenhuma', () => {
    const r = conhecimentoDaEmpresa(pims('Multicultivos'), PERFIL_PROTHEUS);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.addon === 'pims' && x.linha === 'Multicultivos')).toBe(true);
    expect(conhecimentoDaEmpresa({ ...pims('Multicultivos'), erp_id: 'erp-sap-b1' }, PERFIL_SAP)).toHaveLength(0);
    expect(conhecimentoDaEmpresa(pims('Multicultivos'), null)).toHaveLength(0);
  });
  it('distingue PIMS CS de Multicultivos', () => {
    expect(conhecimentoDaEmpresa(pims('CS / Bioenergia'), PERFIL_PROTHEUS).map((x) => x.id)).toEqual(['pims-operacoes-insumo']);
    expect(conhecimentoDaEmpresa(pims('Não informado'), PERFIL_PROTHEUS)).toHaveLength(4);
  });
  it('mantém conhecimento documental separado de regra automática', () => {
    const todos = [...CONHECIMENTO_SISTEMAS, ...orientacoesDoPerfil(PERFIL_PROTHEUS)];
    expect(todos.every((r) => r.fonte.startsWith('https://') && r.versaoFonte && r.conferidoEm && r.automatica === false)).toBe(true);
    expect(conhecimentoDaEmpresa({ erp: 'Protheus', addons: [] }, PERFIL_PROTHEUS)).toEqual([]);
  });
});
