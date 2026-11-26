import { describe,it,expect } from 'vitest';
import { CONHECIMENTO_SISTEMAS, conhecimentoDaEmpresa, ADDONS } from './conhecimentoSistemas';
describe('base de conhecimento dos sistemas',()=>{
 it('add-ons à parte (a lista de ERPs é o Cadastro de ERPs)',()=>{expect(ADDONS.map(a=>a.id)).toEqual(['pims','farmbox']);});
 it('o ERP do Cadastro (TOTVS Protheus) casa com as orientações gravadas como Protheus',()=>{const r=conhecimentoDaEmpresa({erp:'TOTVS Protheus',addons:['pims'],addons_versoes:{pims:{linha:'Multicultivos'}}});expect(r).toHaveLength(3);expect(conhecimentoDaEmpresa({erp:'SAP Business One',addons:['pims'],addons_versoes:{pims:{linha:'Multicultivos'}}})).toHaveLength(0);});
 it('não aplica referências de outro ambiente',()=>{const r=conhecimentoDaEmpresa({erp:'Protheus',addons:['pims'],addons_versoes:{pims:{linha:'Multicultivos'}}});expect(r).toHaveLength(3);expect(r.every(x=>x.addon==='pims'&&x.linha==='Multicultivos')).toBe(true);});
 it('distingue PIMS CS de Multicultivos',()=>{const r=conhecimentoDaEmpresa({erp:'Protheus',addons:['pims'],addons_versoes:{pims:{linha:'CS / Bioenergia'}}});expect(r.map(x=>x.id)).toEqual(['pims-operacoes-insumo']);});
 it('mantém conhecimento documental separado de regra automática',()=>{expect(CONHECIMENTO_SISTEMAS.every(r=>r.fonte.startsWith('https://')&&r.versaoFonte&&r.conferidoEm&&r.automatica===false)).toBe(true);expect(conhecimentoDaEmpresa({erp:'Protheus',addons:[]})).toEqual([]);});
});
