import { describe, it, expect } from 'vitest';
import { buscarServicos } from './buscaServicos';
const rows = [
 {id:'1', item_lc116:'01.01', nbs:'1.1502.10.00', descricao_nbs:'Análise e desenvolvimento de sistemas', c_class_trib:'000001'},
 {id:'2', item_lc116:'17.01', descricao_nbs:'Consultoria agronômica', c_class_trib:'200001'},
 {id:'3', item_lc116:'17.01', descricao_nbs:'Consultoria financeira'},
];
describe('busca de serviços', () => {
 it('exige todos os termos e ignora acentos', () => expect(buscarServicos(rows,'consultoria agronomica').map(r=>r.id)).toEqual(['2']));
 it('prioriza códigos exatos e ignora pontuação', () => expect(buscarServicos(rows,'115021000').map(r=>r.id)).toEqual(['1']));
 it('não retorna a base para termo genérico sem conteúdo', () => expect(buscarServicos(rows,'serviços de')).toEqual([]));
 it('respeita o campo selecionado', () => expect(buscarServicos(rows,'17.01','nbs')).toEqual([]));
 it('preserva múltiplos candidatos de um mesmo código', () => expect(buscarServicos(rows,'17.01').map(r=>r.id)).toEqual(['2','3']));
});
