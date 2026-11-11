import { describe, expect, it } from 'vitest';
import { ErroLeituraDocumento } from './erros';
import { ErroLeituraNfce, LIMITE_ITENS_NFCE, lerNfce } from './nfce-leitor';
import { nfeExemplo } from './__fixtures__/nfe-exemplo';
import { CHAVE_NFCE_EXEMPLO, chaveNfceExemplo, nfceExemplo } from './__fixtures__/nfce-exemplo';

describe('lerNfce', () => {
  it('lê identificação, emitente, consumidor, itens, totais, pagamentos, troco, QR Code, consulta e protocolo', () => {
    const n = lerNfce(nfceExemplo());
    expect(n).toMatchObject({ chave: CHAVE_NFCE_EXEMPLO, versao: '4.00', modelo: '65', serie: '1', numero: '123', tipoEmissao: '1', contingencia: false, homologacao: false });
    expect(n.dataEmissao).toBe('2026-11-05T10:15:00-04:00');

    expect(n.emitente).toMatchObject({ tipoDocumento: 'CNPJ', documento: '12345678000195', ie: '131234567' });
    expect(n.emitente.nome).toBe('AGRO SERRA DOURADA COMERCIO DE INSUMOS AGROPECUARIOS LTDA');
    expect(n.emitente.endereco).toMatchObject({ logradouro: 'RODOVIA MT 242', numero: 'KM 3', bairro: 'ZONA RURAL', municipio: 'SORRISO', uf: 'MT', cep: '78890000', fone: '6535441100' });
    expect(n.consumidor).toMatchObject({ tipoDocumento: 'CPF', documento: '12345678909', nome: '' });

    expect(n.totalItens).toBe(3);
    expect(n.itens).toHaveLength(3);
    expect(n.itens[0]).toEqual({ numero: '1', codigo: '0001', descricao: 'SAL MINERAL BOVINO 25 KG', unidade: 'SC', quantidade: '6.0000', valorUnitario: '189.9000000000', valorTotal: '1139.40', desconto: '34.18' });
    expect(n.itens[2]).toMatchObject({ codigo: '0310', unidade: 'L', quantidade: '45.3200', valorTotal: '280.53' });
    const soma = n.itens.reduce((acc, i) => acc + Number(i.valorTotal), 0);
    expect(Number(n.totais.valorProdutos)).toBeCloseTo(soma, 2);
    expect(n.totais).toEqual({ valorProdutos: '1493.43', valorServicos: '', desconto: '44.81', frete: '0.00', seguro: '0.00', outras: '0.00', valorNota: '1448.62', tributosAproximados: '276.28' });

    expect(n.pagamentos).toEqual([{ forma: '04', descricao: '', valor: '724.31' }, { forma: '01', descricao: '', valor: '730.00' }]);
    expect(n.troco).toBe('5.69');
    // o que foi pago menos o troco é o valor da nota
    const pago = n.pagamentos.reduce((acc, p) => acc + Number(p.valor), 0);
    expect(pago - Number(n.troco)).toBeCloseTo(Number(n.totais.valorNota), 2);

    expect(n.urlChave).toBe('http://www.sefaz.mt.gov.br/nfce/consultanfce');
    expect(n.qrCode).toMatch(new RegExp(`^http://www\\.sefaz\\.mt\\.gov\\.br/nfce/consultanfce\\?p=${CHAVE_NFCE_EXEMPLO}\\|2\\|1\\|1\\|[0-9A-F]{40}$`));
    expect(n.protocolo).toEqual({ numero: '351260000000001', dataHora: '2026-11-05T10:16:30-04:00', status: '100', motivo: 'Autorizado o uso da NF-e' });
    expect(n.informacoesComplementares).toContain('Vendedor: Joao');
    expect(n.informacoesFisco).toBe('');
  });

  it('a chave de exemplo tem 44 dígitos, modelo 65 nas posições 21 e 22 e o dígito verificador certo', () => {
    expect(CHAVE_NFCE_EXEMPLO).toHaveLength(44);
    expect(CHAVE_NFCE_EXEMPLO.slice(20, 22)).toBe('65');
    expect(chaveNfceExemplo(9).slice(34, 35)).toBe('9'); // forma de emissão
    expect(chaveNfceExemplo(9)).not.toBe(CHAVE_NFCE_EXEMPLO);
  });

  it('consumidor: CNPJ com nome, identificação de estrangeiro, não identificado (sem grupo dest) e entrega em domicílio com endereço', () => {
    const cnpj = lerNfce(nfceExemplo({ consumidor: 'cnpj' })).consumidor;
    expect(cnpj).toMatchObject({ tipoDocumento: 'CNPJ', documento: '98765432000110', nome: 'FAZENDA BOA ESPERANCA AGROPECUARIA LTDA' });
    expect(lerNfce(nfceExemplo({ consumidor: 'estrangeiro' })).consumidor).toMatchObject({ tipoDocumento: 'ESTRANGEIRO', documento: 'X1234567', nome: 'JOHN SMITH' });
    expect(lerNfce(nfceExemplo({ consumidor: 'nenhum' })).consumidor).toBeNull();

    const entrega = lerNfce(nfceExemplo({ entregaEmDomicilio: true }));
    expect(entrega.consumidor).toMatchObject({ tipoDocumento: 'CPF', documento: '12345678909', nome: 'MARIA APARECIDA DA SILVA' });
    expect(entrega.consumidor?.endereco).toMatchObject({ logradouro: 'RUA DAS ACACIAS', numero: '120', bairro: 'JARDIM PRIMAVERA', municipio: 'SORRISO', uf: 'MT', cep: '78890100' });
    expect(entrega.totais.frete).toBe('15.00');
  });

  it('o endereço de entrega pode vir no grupo entrega quando o consumidor não traz enderDest', () => {
    const xml = nfceExemplo().replace('<dest><CPF>12345678909</CPF><indIEDest>9</indIEDest></dest>', '<dest><CPF>12345678909</CPF><xNome>JOSE</xNome></dest><entrega><CPF>12345678909</CPF><xLgr>RUA DOIS</xLgr><nro>30</nro><xBairro>CENTRO</xBairro><cMun>5107925</cMun><xMun>SORRISO</xMun><UF>MT</UF></entrega>');
    expect(lerNfce(xml).consumidor?.endereco).toMatchObject({ logradouro: 'RUA DOIS', numero: '30', municipio: 'SORRISO' });
  });

  it('contingência (tpEmis 9) sai sem protocolo, mas uma nota de contingência já autorizada traz o protocolo', () => {
    const emissao = lerNfce(nfceExemplo({ contingencia: true }));
    expect(emissao).toMatchObject({ tipoEmissao: '9', contingencia: true, chave: chaveNfceExemplo(9), protocolo: null });
    expect(emissao.qrCode).toContain('|05|'); // dia da emissão no QR Code da contingência off-line

    const autorizada = lerNfce(nfceExemplo({ contingencia: true, semProtocolo: false }));
    expect(autorizada.contingencia).toBe(true);
    expect(autorizada.protocolo?.numero).toBe('351260000000001');
  });

  it('homologação vem do ambiente da identificação (ou do protocolo, quando a identificação não diz)', () => {
    expect(lerNfce(nfceExemplo({ homologacao: true })).homologacao).toBe(true);
    expect(lerNfce(nfceExemplo({ homologacao: true })).itens[0].descricao).toContain('HOMOLOGACAO');
    const semAmbiente = nfceExemplo({ homologacao: true }).replace('<tpAmb>2</tpAmb><finNFe>', '<finNFe>');
    expect(lerNfce(semAmbiente).homologacao).toBe(true); // o protocolo diz tpAmb 2
    expect(lerNfce(nfceExemplo()).homologacao).toBe(false);
  });

  it('aceita a NFe sem o protocolo (nota ainda não autorizada) e lê as informações do fisco', () => {
    const n = lerNfce(nfceExemplo({ semProtocolo: true, infAdFisco: 'Contribuinte substituto.' }));
    expect(n.protocolo).toBeNull();
    expect(n.informacoesFisco).toBe('Contribuinte substituto.');
    expect(n.chave).toBe(CHAVE_NFCE_EXEMPLO);
  });

  it('pagamentos: um só cartão, nenhum, e o leiaute 3.10 (um grupo pag por forma, com o xPag do tipo Outros)', () => {
    expect(lerNfce(nfceExemplo({ pagamento: 'cartao' })).pagamentos).toEqual([{ forma: '03', descricao: '', valor: '1448.62' }]);
    expect(lerNfce(nfceExemplo({ pagamento: 'cartao' })).troco).toBe('');
    expect(lerNfce(nfceExemplo({ pagamento: 'nenhum' })).pagamentos).toEqual([]);
    const antigo = nfceExemplo().replace(/<pag>[\s\S]*<\/pag>/, '<pag><tPag>01</tPag><vPag>1000.00</vPag></pag><pag><tPag>99</tPag><xPag>CONVENIO COM A COOPERATIVA</xPag><vPag>448.62</vPag><vTroco>0.00</vTroco></pag>');
    const n = lerNfce(antigo);
    expect(n.pagamentos).toEqual([{ forma: '01', descricao: '', valor: '1000.00' }, { forma: '99', descricao: 'CONVENIO COM A COOPERATIVA', valor: '448.62' }]);
    expect(n.troco).toBe('0.00');
  });

  it('o texto do QR Code vem intacto: o & do CDATA e o escapado (&amp;) viram o mesmo texto', () => {
    const url = 'http://exemplo.gov.br/nfce?chNFe=1&nVersao=100&tpAmb=1&cIdToken=000001&cHashQRCode=ABC';
    const comCdata = nfceExemplo().replace(/<qrCode>[\s\S]*?<\/qrCode>/, `<qrCode><![CDATA[${url}]]></qrCode>`);
    expect(lerNfce(comCdata).qrCode).toBe(url);
    const escapado = nfceExemplo().replace(/<qrCode>[\s\S]*?<\/qrCode>/, `<qrCode>${url.replace(/&/g, '&amp;')}</qrCode>`);
    expect(lerNfce(escapado).qrCode).toBe(url);
  });

  it('sem informações suplementares, sem consumidor e sem pagamento os campos ficam vazios, sem quebrar a leitura', () => {
    const xml = nfceExemplo({ consumidor: 'nenhum', pagamento: 'nenhum' }).replace(/<infNFeSupl>[\s\S]*?<\/infNFeSupl>/, '').replace(/<infAdic>[\s\S]*?<\/infAdic>/, '');
    const n = lerNfce(xml);
    expect(n).toMatchObject({ qrCode: '', urlChave: '', informacoesComplementares: '', informacoesFisco: '', troco: '', pagamentos: [], consumidor: null });
  });

  it('o leiaute antigo (dEmi) e a chave só no protocolo; o modelo sai da chave quando a identificação não o traz', () => {
    const antigo = nfceExemplo().replace('<dhEmi>2026-11-05T10:15:00-04:00</dhEmi>', '<dEmi>2026-11-05</dEmi>');
    expect(lerNfce(antigo).dataEmissao).toBe('2026-11-05');
    const semId = nfceExemplo().replace(/ Id="NFe\d{44}"/, '').replace('<mod>65</mod>', '');
    const n = lerNfce(semId);
    expect(n.chave).toBe(CHAVE_NFCE_EXEMPLO);
    expect(n.modelo).toBe('65');
  });

  it('aceita XML com BOM ou espaço antes da declaração e com prefixo de namespace nas tags', () => {
    expect(lerNfce(`${String.fromCharCode(0xfeff)}${nfceExemplo()}`).chave).toBe(CHAVE_NFCE_EXEMPLO);
    expect(lerNfce(`\n  ${nfceExemplo()}`).numero).toBe('123');
    const prefixado = nfceExemplo().replace(/<(\/?)(?!\?|!)/g, '<$1n:').replace(' xmlns="http://www.portalfiscal.inf.br/nfe"', '').replace('<n:nfeProc', '<n:nfeProc xmlns:n="http://www.portalfiscal.inf.br/nfe"');
    expect(lerNfce(prefixado).itens).toHaveLength(3);
  });

  it('CNPJ alfanumérico (desde julho de 2026): a chave de 44 posições tem letras no trecho do CNPJ e o emitente vem com elas', () => {
    const chave = '51261112AB34CD560001650010000001231000000015';
    expect(chave).toHaveLength(44);
    const xml = nfceExemplo().split(CHAVE_NFCE_EXEMPLO).join(chave).replace('<CNPJ>12345678000195</CNPJ>', '<CNPJ>12AB34CD560001</CNPJ>');
    const n = lerNfce(xml);
    expect(n.chave).toBe(chave);
    expect(n.modelo).toBe('65');
    expect(n.emitente).toMatchObject({ tipoDocumento: 'CNPJ', documento: '12AB34CD560001' });
    // letras fora do trecho do CNPJ não formam uma chave
    expect(() => lerNfce(nfceExemplo().split(CHAVE_NFCE_EXEMPLO).join('51261112345678000195AB5001000000123100000001'))).toThrow(/chave de acesso/);
  });

  it('mais de 1.000 itens: lê os primeiros e conta todos', () => {
    const n = lerNfce(nfceExemplo({ itens: LIMITE_ITENS_NFCE + 5 }));
    expect(n.itens).toHaveLength(LIMITE_ITENS_NFCE);
    expect(n.totalItens).toBe(LIMITE_ITENS_NFCE + 5);
  });

  it('recusa NF-e (com o aviso de usar o DANFE), outros modelos, XML que não é NF-e, vazio, sem chave e grande demais', () => {
    expect(() => lerNfce(nfeExemplo())).toThrow(/NF-e \(modelo 55\).*use o DANFE/);
    expect(() => lerNfce(nfceExemplo().replace('<mod>65</mod>', '<mod>57</mod>'))).toThrow(/modelo 65 \(este documento é modelo 57\)/);
    expect(() => lerNfce(nfceExemplo().replace('<mod>65</mod>', '').replace(/ Id="NFe\d{44}"/, '').replace(/<protNFe[\s\S]*<\/protNFe>/, ''))).toThrow(/modelo desconhecido/);
    expect(() => lerNfce(nfceExemplo().replace(/ Id="NFe\d{44}"/, '').replace(/<protNFe[\s\S]*<\/protNFe>/, ''))).toThrow(/chave de acesso de 44 dígitos/);
    expect(() => lerNfce('<catalogo><item>nada fiscal</item></catalogo>')).toThrow(/não é uma NFC-e/);
    expect(() => lerNfce('')).toThrow(ErroLeituraNfce);
    expect(() => lerNfce(`<a>${'x'.repeat(2 * 1024 * 1024 + 1)}</a>`)).toThrow(ErroLeituraNfce);
    try {
      lerNfce(nfeExemplo());
    } catch (e) {
      expect(e).toBeInstanceOf(ErroLeituraDocumento); // é o erro que o resto do sistema mostra na tela
    }
  });
});
