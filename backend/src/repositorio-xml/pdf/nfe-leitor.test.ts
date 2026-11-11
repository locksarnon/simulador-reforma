import { describe, expect, it } from 'vitest';
import { ErroLeituraNfe, lerNfe } from './nfe-leitor';
import { CHAVE_EXEMPLO, nfeExemplo } from './__fixtures__/nfe-exemplo';

describe('lerNfe', () => {
  it('lê identificação, emitente, destinatário, itens, totais, transporte, cobrança e protocolo', () => {
    const n = lerNfe(nfeExemplo());
    expect(n).toMatchObject({ chave: CHAVE_EXEMPLO, versao: '4.00', modelo: '55', serie: '1', numero: '123', tipoOperacao: '1', homologacao: false });
    expect(n.dataEmissao).toBe('2026-11-05T10:15:00-03:00');
    expect(n.naturezaOperacao).toContain('VENDA DE MERCADORIA');

    expect(n.emitente).toMatchObject({ documento: '12345678000195', ie: '131234567', im: '4455' });
    expect(n.emitente.nome).toContain('FORNECEDOR AGRO');
    expect(n.emitente.endereco).toMatchObject({ logradouro: 'RODOVIA BR 163', numero: 'KM 12', bairro: 'DISTRITO INDUSTRIAL', municipio: 'CUIABA', uf: 'MT', cep: '78000000', fone: '6532224444' });
    expect(n.destinatario).toMatchObject({ documento: '98765432000110', ie: '131999888' });
    expect(n.destinatario?.endereco.municipio).toBe('RONDONOPOLIS');

    expect(n.itens).toHaveLength(3);
    expect(n.itens[0]).toMatchObject({ numero: '1', codigo: 'P0001', ncm: '12019000', cfop: '5102', unidade: 'SC', origemCst: '000', aliquotaIcms: '12.0000', aliquotaIpi: '5.0000' });
    expect(n.itens[1].infAdicional).toBe('Lote 2026/11-A');
    const soma = n.itens.reduce((acc, i) => acc + Number(i.valorTotal), 0);
    expect(Number(n.totais.valorProdutos)).toBeCloseTo(soma, 2);
    expect(Number(n.totais.valorNota)).toBeCloseTo(soma + 120.5, 2);
    expect(n.totais.frete).toBe('120.50');

    expect(n.transporte.modalidadeFrete).toBe('0');
    expect(n.transporte.transportadora).toMatchObject({ documento: '11222333000181', ie: '131000111' });
    expect(n.transporte.transportadora?.endereco).toMatchObject({ logradouro: 'RUA DAS FLORES, 100', municipio: 'CUIABA', uf: 'MT' });
    expect(n.transporte).toMatchObject({ placa: 'ABC1D23', ufPlaca: 'MT', rntc: '12345678' });
    expect(n.transporte.volumes).toEqual([{ quantidade: '10', especie: 'SACOS', marca: 'FORNECEDOR', numeracao: '1-10', pesoLiquido: '500.000', pesoBruto: '520.000' }]);

    expect(n.duplicatas.map((d) => [d.numero, d.vencimento])).toEqual([['001', '2026-12-06'], ['002', '2026-12-07']]);
    expect(n.protocolo).toEqual({ numero: '351260000000001', dataHora: '2026-11-05T10:16:30-03:00', status: '100', motivo: 'Autorizado o uso da NF-e' });
    expect(n.informacoesComplementares).toContain('Pedido 4567');
    expect(n.issqn).toBeNull();
  });

  it('homologação, sem destinatário e sem protocolo (XML só com a NFe)', () => {
    const n = lerNfe(nfeExemplo({ homologacao: true, semDestinatario: true, semProtocolo: true, duplicatas: 0 }));
    expect(n.homologacao).toBe(true);
    expect(n.destinatario).toBeNull();
    expect(n.protocolo).toBeNull();
    expect(n.duplicatas).toEqual([]);
  });

  it('item do Simples Nacional: origem e CSOSN formam o código mostrado na coluna O/CST; ISSQN é lido quando existe', () => {
    const xml = nfeExemplo({ servicos: true }).replace(/<ICMS00>[\s\S]*?<\/ICMS00>/g, '<ICMSSN102><orig>2</orig><CSOSN>102</CSOSN></ICMSSN102>');
    const n = lerNfe(xml);
    expect(n.itens[0]).toMatchObject({ origemCst: '2102', baseIcms: '', valorIcms: '' });
    expect(n.issqn).toEqual({ valorServicos: '1000.00', baseCalculo: '1000.00', valorIss: '50.00' });
  });

  it('aceita a chave só no protocolo e recusa o que não é NF-e, XML sem chave e XML grande demais', () => {
    const semId = nfeExemplo().replace(/ Id="NFe\d{44}"/, '');
    expect(lerNfe(semId).chave).toBe(CHAVE_EXEMPLO);
    expect(() => lerNfe(semId.replace(/<protNFe[\s\S]*<\/protNFe>/, ''))).toThrow(ErroLeituraNfe);
    expect(() => lerNfe('<catalogo><item>nada fiscal</item></catalogo>')).toThrow(/não é uma NF-e/);
    expect(() => lerNfe('')).toThrow(ErroLeituraNfe);
    expect(() => lerNfe(`<a>${'x'.repeat(2 * 1024 * 1024 + 1)}</a>`)).toThrow(ErroLeituraNfe);
  });
});
