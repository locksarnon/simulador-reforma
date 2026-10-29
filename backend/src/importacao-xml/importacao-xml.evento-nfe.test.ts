import { describe, it, expect } from 'vitest';
import { ImportacaoXmlService } from './importacao-xml.service';
import { parseXml } from './shared/xml-parser';

const CHAVE = '35260112345678000195550010000001231000001230';
const servico = () => new ImportacaoXmlService({} as any, {} as any, { ajustesDaEmpresa: async () => ({}) } as any);
const evento = (xml: string, tipo = 'EVENTO_CANCELAMENTO') => (servico() as any).prepararEvento({ id: 'arq-1' }, parseXml(xml), tipo, 'hash-1');

// Formato padrão baixado do portal: procEventoNFe com o pedido (evento) e o retorno da SEFAZ (retEvento).
const PROC_EVENTO = (cStat: string) => `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <evento versao="1.00"><infEvento Id="ID1101113513"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>12345678000195</CNPJ><chNFe>${CHAVE}</chNFe><tpEvento>110111</tpEvento></infEvento></evento>
  <retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>${cStat}</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${CHAVE}</chNFe></infEvento></retEvento>
</procEventoNFe>`;

describe('evento de NF-e (cancelamento) no formato procEventoNFe', () => {
  it('lê a chave do pedido e o cStat do retorno: o cancelamento passa a casar com a nota', () => {
    const r = evento(PROC_EVENTO('135'));
    expect(r.chNFe).toBe(CHAVE);
    expect(r.update).toMatchObject({ chave_nfe: CHAVE, cstat: '135', situacao_fiscal: 'EVENTO_PROCESSADO', tipo_xml: 'EVENTO_CANCELAMENTO' });
    expect(r.cte).toBeNull();
  });

  it('retorno que não registrou o evento (cStat diferente de 135 e 136) fica pendente, mas a chave continua lida', () => {
    const r = evento(PROC_EVENTO('573'));
    expect(r.chNFe).toBe(CHAVE);
    expect(r.update.situacao_fiscal).toBe('EVENTO_PENDENTE');
  });

  it('o cStat 136 (evento registrado, sem vincular a NF-e) e o 155 (cancelamento homologado fora do prazo) também valem', () => {
    expect(evento(PROC_EVENTO('136')).update.situacao_fiscal).toBe('EVENTO_PROCESSADO');
    expect(evento(PROC_EVENTO('155')).update.situacao_fiscal).toBe('EVENTO_PROCESSADO');
  });

  it('arquivo só com o pedido (raiz evento) ainda dá a chave, mas sem retorno fica pendente', () => {
    const r = evento(`<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="ID1"><chNFe>${CHAVE}</chNFe><tpEvento>110111</tpEvento></infEvento></evento>`);
    expect(r.chNFe).toBe(CHAVE);
    expect(r.update.situacao_fiscal).toBe('EVENTO_PENDENTE');
  });
});
