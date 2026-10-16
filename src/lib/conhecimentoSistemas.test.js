import { describe,it,expect } from 'vitest';
import { CONHECIMENTO_SISTEMAS, conhecimentoDaEmpresa, ERPS, ADDONS } from './conhecimentoSistemas';
describe('base de conhecimento dos sistemas',()=>{
 it('separa ERPs e add-ons',()=>{expect(ERPS).toContain('Protheus');expect(ERPS).toContain('Siagri');expect(ERPS).not.toContain('PIMS');expect(ADDONS.map(a=>a.id)).toEqual(['pims','farmbox']);});
 it('não aplica referências de outro ambiente',()=>{const r=conhecimentoDaEmpresa({erp:'Protheus',addons:['pims'],addons_versoes:{pims:{linha:'Multicultivos'}}});expect(r).toHaveLength(3);expect(r.every(x=>x.addon==='pims'&&x.linha==='Multicultivos')).toBe(true);});
 it('distingue PIMS CS de Multicultivos',()=>{const r=conhecimentoDaEmpresa({erp:'Protheus',addons:['pims'],addons_versoes:{pims:{linha:'CS / Bioenergia'}}});expect(r.map(x=>x.id)).toEqual(['pims-operacoes-insumo']);});
 it('mantém conhecimento documental separado de regra automática',()=>{expect(CONHECIMENTO_SISTEMAS.every(r=>r.fonte.startsWith('https://')&&r.versaoFonte&&r.conferidoEm&&r.automatica===false)).toBe(true);expect(conhecimentoDaEmpresa({erp:'Protheus',addons:[]})).toEqual([]);});
});
