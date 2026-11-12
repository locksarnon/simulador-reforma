import { describe, expect, it } from 'vitest';
import { envelope, lerPesquisa, lerResposta } from './receitanetbx.cliente';

describe('cliente do ReceitanetBX-Serviço (SOAP)', () => {
  it('monta o envelope com a entrada escapada e o namespace do Axis2', () => {
    const e = envelope('PesquisarArquivos', '<pesquisa><campo nome="a" valor="1&2"/></pesquisa>');
    expect(e).toContain('<ns:PesquisarArquivos><ns:entrada>&lt;pesquisa&gt;&lt;campo nome=&quot;a&quot; valor=&quot;1&amp;2&quot;/&gt;&lt;/pesquisa&gt;</ns:entrada></ns:PesquisarArquivos>');
    expect(e).toContain('xmlns:ns="http://ws.apache.org/axis2"');
  });

  it('lê retorno e saída (escapada ou em CDATA) e transforma falha SOAP em erro', () => {
    expect(lerResposta('<soapenv:Envelope><soapenv:Body><ns:ConsultarPedidosResponse><ns:retorno>1</ns:retorno><ns:saida>&lt;retornoconsulta/&gt;</ns:saida></ns:ConsultarPedidosResponse></soapenv:Body></soapenv:Envelope>')).toEqual({ retorno: 1, saida: '<retornoconsulta/>' });
    expect(lerResposta('<r><retorno>0</retorno><saida><![CDATA[<x a="1"/>]]></saida></r>').saida).toBe('<x a="1"/>');
    expect(() => lerResposta('<Fault><faultstring>host n&#227;o autorizado</faultstring></Fault>')).toThrow(/host não autorizado/);
  });

  it('lê os arquivos de uma pesquisa com os atributos', () => {
    const r = lerPesquisa('<retornopesquisa><arquivos><arquivo id="A1"><atributo nome="periodo" valor="01/10/2026 a 31/10/2026" tipo="texto"/><atributo nome="recibo" valor="12.34.56" tipo="texto"/></arquivo></arquivos><mensagemusuario nivelmsg="info">ok</mensagemusuario></retornopesquisa>');
    expect(r).toEqual({ arquivos: [{ id: 'A1', atributos: { periodo: '01/10/2026 a 31/10/2026', recibo: '12.34.56' } }], mensagem: 'ok' });
  });
});
