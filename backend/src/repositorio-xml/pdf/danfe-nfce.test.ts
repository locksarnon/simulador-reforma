import { describe, expect, it } from 'vitest';
import { gerarDanfeNfce } from './danfe-nfce';
import { ErroLeituraDocumento } from './erros';
import { ErroLeituraNfce, lerNfce } from './nfce-leitor';
import { matrizQr } from './qr';
import { CHAVE_NFCE_EXEMPLO, chaveNfceExemplo, nfceExemplo } from './__fixtures__/nfce-exemplo';
import { nfeExemplo } from './__fixtures__/nfe-exemplo';
import { paginas, retangulos, textoDoPdf } from './__fixtures__/pdf-teste';

const gerar = (xml: string, opcoes = {}) => gerarDanfeNfce(xml, { semCompressao: true, ...opcoes });

/**
 * Texto do PDF em uma linha corrida: as quebras entre linhas viram espaço (o rótulo em negrito e o valor de uma mesma linha
 * são dois trechos de texto) e o travessão e as reticências do WinAnsi (bytes 0x96 e 0x85, lidos como latin1) voltam a ser o que são.
 */
const plano = (pdf: Buffer) => textoDoPdf(pdf).replace(/\s*\n\s*/g, ' ').replace(/\u0096/g, '–').replace(/\u0085/g, '…');
const textoDe = async (xml: string, opcoes = {}) => plano(await gerar(xml, opcoes));

/** Largura e altura de cada página, como estão no MediaBox. */
const tamanhos = (pdf: Buffer) => [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/g)].map((m) => ({ largura: Number(m[1]), altura: Number(m[2]) }));

/** Retângulos desenhados (x, y, largura, altura): são os módulos do QR Code. */
const modulos = (pdf: Buffer) => [...pdf.toString('latin1').matchAll(/(-?[0-9.]+) (-?[0-9.]+) (-?[0-9.]+) (-?[0-9.]+) re\n/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }));

const MM = 72 / 25.4;
const ocorrencias = (texto: string, trecho: string) => texto.split(trecho).length - 1;

describe('gerarDanfeNfce', () => {
  it('uma NFC-e normal vira um cupom de 80 mm numa página só, com as divisões do manual e os dados do XML', async () => {
    const pdf = await gerar(nfceExemplo());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
    const [pagina] = tamanhos(pdf);
    expect(pagina.largura).toBeCloseTo(80 * MM, 1);
    expect(pagina.altura).toBeGreaterThan(300);
    expect(pagina.altura).toBeLessThan(700);

    const t = plano(pdf);
    // I. cabeçalho
    for (const s of ['CNPJ: 12.345.678/0001-95', 'AGRO SERRA DOURADA COMERCIO DE INSUMOS AGROPECUARIOS LTDA', 'RODOVIA MT 242, KM 3, ZONA RURAL', 'SORRISO - MT - CEP: 78890-000', 'Fone: (65) 3544-1100', 'Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica']) {
      expect(t, s).toContain(s);
    }
    // II. itens: colunas do manual e valores com vírgula decimal e ponto de milhar
    for (const s of ['Código', 'Descrição', 'Qtde', 'UN', 'Vl Unit', 'Vl Total', '0001', 'SAL MINERAL BOVINO 25 KG', '189,90', '1.139,40', 'VERMIFUGO IVERMECTINA 1% FRASCO 50 ML', 'OLEO DIESEL S10', '45,32', '280,53']) {
      expect(t, s).toContain(s);
    }
    // III. totais, formas de pagamento e troco
    for (const s of ['Qtde. total de itens 3', 'Valor total R$ 1.493,43', 'Desconto R$ 44,81', 'Valor a Pagar R$ 1.448,62', 'FORMA PAGAMENTO VALOR PAGO R$', 'Cartão de Débito 724,31', 'Dinheiro 730,00', 'Troco R$ 5,69']) {
      expect(t, s).toContain(s);
    }
    // IV. consulta pela chave: endereço e a chave em 11 blocos de quatro dígitos
    expect(t).toContain('Consulte pela Chave de Acesso em http://www.sefaz.mt.gov.br/nfce/consultanfce 5126 1112 3456 7800 0195 6500 1000 0001 2310 0000 0014');
    expect(CHAVE_NFCE_EXEMPLO.match(/\d{4}/g)).toHaveLength(11);
    // VI e VII. consumidor, identificação e protocolo
    expect(t).toContain('CONSUMIDOR CPF: 123.456.789-09');
    expect(t).toContain('NFC-e nº 000000123 Série 001 05/11/2026 10:15:00');
    expect(t).toContain('Protocolo de autorização: 351260000000001');
    expect(t).toContain('Data de autorização 05/11/2026 10:16:30');
    // IX. tributos (Lei 12.741) e informações complementares
    expect(t).toContain('Tributos Totais Incidentes (Lei Federal 12.741/2012): R$276,28');
    expect(t).toContain('Vendedor: Joao. Mercadoria destinada a produtor rural.');

    for (const ausente of ['CANCELADA', 'DENEGADA', 'SEM VALOR FISCAL', 'CONTINGÊNCIA', 'NÃO IDENTIFICADO', 'Protocolo de denegação']) expect(t, ausente).not.toContain(ausente);
    expect(pdf.toString('latin1')).not.toMatch(/\/ca 0\.14/); // sem marca d'água
  });

  it('CNPJ alfanumérico: o CNPJ do emitente e a chave de acesso (11 blocos de 4) saem inteiros, com as letras', async () => {
    const chave = '51261112AB34CD560001650010000001231000000015';
    const xml = nfceExemplo().split(CHAVE_NFCE_EXEMPLO).join(chave).replace('<CNPJ>12345678000195</CNPJ>', '<CNPJ>12AB34CD560001</CNPJ>');
    const t = await textoDe(xml);
    expect(t).toContain('CNPJ: 12.AB3.4CD/5600-01');
    expect(t).toContain('5126 1112 AB34 CD56 0001 6500 1000 0001 2310 0000 0015');
  });

  it('não leva rodapé do InTAX: o manual proíbe texto que não esteja no XML, e a origem do PDF fica nos metadados', async () => {
    const pdf = await gerar(nfceExemplo());
    expect(plano(pdf)).not.toMatch(/InTAX/i);
    const bruto = pdf.toString('latin1');
    const autor = /\/Author (\d+) 0 R/.exec(bruto); // o autor é um objeto à parte: "15 0 obj (InTAX)"
    expect(autor).not.toBeNull();
    expect(bruto).toContain(`${autor![1]} 0 obj\n(InTAX)`);
  });

  it('o QR Code é o texto do XML, em retângulos centralizados, com pelo menos 25 mm contando a margem de silêncio', async () => {
    const xml = nfceExemplo();
    const matriz = matrizQr(lerNfce(xml).qrCode);
    let trechos = 0;
    for (const linha of matriz) {
      let anterior = false;
      for (const escuro of linha) { if (escuro && !anterior) trechos += 1; anterior = escuro; }
    }
    const pdf = await gerar(xml);
    expect(retangulos(pdf)).toBe(trechos); // nada mais no cupom é desenhado com retângulo

    const r = modulos(pdf);
    const esquerda = Math.min(...r.map((m) => m.x));
    const direita = Math.max(...r.map((m) => m.x + m.w));
    const conteudo = direita - esquerda;
    const modulo = conteudo / matriz.length;
    // a margem de silêncio é 10% do lado do bloco em cada lado: o conteúdo ocupa 80% dele
    const lado = conteudo / 0.8;
    const margem = (lado - conteudo) / 2;
    expect(conteudo).toBeGreaterThanOrEqual(22 * MM); // 22 mm de conteúdo
    expect(lado).toBeGreaterThanOrEqual(25 * MM); // 25 mm contando a margem
    expect(margem).toBeGreaterThanOrEqual(4 * modulo); // e mais do que os 4 módulos do padrão ISO 18004
    const [{ largura }] = tamanhos(pdf);
    expect((esquerda + direita) / 2).toBeCloseTo(largura / 2, 0); // centralizado
    expect(esquerda - margem).toBeGreaterThanOrEqual(2 * MM); // a margem de silêncio cabe na margem lateral de 2 mm do manual
  });

  it('a margem lateral é de pelo menos 2 mm', async () => {
    const pdf = await gerar(nfceExemplo({ itens: 5 }));
    const xs = [...pdf.toString('latin1').matchAll(/1 0 0 1 (-?[0-9.]+) (-?[0-9.]+) Tm/g)].map((m) => Number(m[1]));
    expect(xs.length).toBeGreaterThan(50);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(2 * MM);
  });

  it('descrição longa quebra em várias linhas sem ser cortada, e código longo e palavra sem espaços também', async () => {
    const pdf = await gerar(nfceExemplo({ itens: 5 }).replace('LUVA NITRILICA TAM G', `LUVA ${'A'.repeat(120)}`));
    const t = plano(pdf);
    expect(t).toContain('HERBICIDA GLIFOSATO 480 G/L CONCENTRADO SOLUVEL GALAO COM 20 LITROS LOTE 2026/11-A VALIDADE 11/2028 USO RESTRITO A PRODUTORES');
    expect(textoDoPdf(pdf).split('\n').filter((l) => /^(HERBICIDA|CONCENTRADO|LITROS|USO RESTRITO)/.test(l)).length).toBeGreaterThanOrEqual(3);
    expect(textoDoPdf(pdf).replace(/\s/g, '')).toContain('A'.repeat(120)); // a palavra gigante foi quebrada por caractere, sem perder nenhum
    expect(textoDoPdf(pdf)).toContain('7891234567895'); // código de barras (13 dígitos) cabe inteiro na coluna do código
    expect(t).not.toContain('…');
  });

  it('muitos itens: o cupom fica mais comprido, com todos os itens, e continua numa página só', async () => {
    const pdf = await gerar(nfceExemplo({ itens: 70 }));
    expect(paginas(pdf)).toBe(1);
    expect(tamanhos(pdf)[0].altura).toBeGreaterThan(1500);
    const t = plano(pdf);
    expect(t).toContain('Qtde. total de itens 70');
    for (const codigo of ['0001', '0023', '0310', '7891234567895', '0777', '00016', '000111', '077715', '031068', '077770']) expect(t, codigo).toContain(codigo);
  });

  it('cupom grande demais para uma página é continuado em outra, da mesma largura, sem perder item nem totais', async () => {
    const pdf = await gerar(nfceExemplo({ itens: 1000 }));
    const caixas = tamanhos(pdf);
    expect(caixas.length).toBeGreaterThanOrEqual(2);
    for (const c of caixas) {
      expect(c.largura).toBeCloseTo(80 * MM, 1);
      expect(c.altura).toBeLessThanOrEqual(14400); // limite de página dos leitores de PDF
    }
    const t = plano(pdf);
    expect(t).toContain('07771000'); // último item
    expect(t).toContain('Qtde. total de itens 1.000');
    expect(t).toContain('Protocolo de autorização: 351260000000001');
    expect(t).not.toContain('no XML)');
    expect(retangulos(pdf)).toBeGreaterThan(0); // o QR Code está na última página
    // o cabeçalho das colunas repete no alto de cada página
    expect(textoDoPdf(pdf).split('\n').filter((l) => l === 'Vl Total')).toHaveLength(caixas.length);
    expect(paginas(pdf)).toBe(caixas.length);
  }, 60000);

  it('campo gigante no XML (adulterado) não estica o cupom e QR Code grande demais é deixado de fora', async () => {
    const xml = nfceExemplo({ itens: 2 })
      .replace('SAL MINERAL BOVINO 25 KG', 'ABC '.repeat(40000))
      .replace('AGRO SERRA DOURADA COMERCIO DE INSUMOS AGROPECUARIOS LTDA', 'RAZAO '.repeat(20000))
      .replace(/<qrCode>[\s\S]*?<\/qrCode>/, `<qrCode>${'x'.repeat(4000)}</qrCode>`);
    const pdf = await gerar(xml);
    expect(paginas(pdf)).toBe(1);
    expect(tamanhos(pdf)[0].altura).toBeLessThan(900);
    expect(retangulos(pdf)).toBe(0);
    expect(plano(pdf)).toContain('…');
  }, 30_000); // desenha centenas de itens: vários segundos, e a máquina pode estar ocupada

  it('a data da autorização é levada para o horário local do emitente (o fuso da emissão), inclusive quando muda o dia', async () => {
    // emitente em Mato Grosso (-04:00) e protocolo carimbado no horário de Brasília (-03:00)
    const brasilia = nfceExemplo().replace('<dhRecbto>2026-11-05T10:16:30-04:00</dhRecbto>', '<dhRecbto>2026-11-05T11:16:30-03:00</dhRecbto>');
    expect(await textoDe(brasilia)).toContain('Data de autorização 05/11/2026 10:16:30');
    const viradaDoDia = nfceExemplo().replace('<dhEmi>2026-11-05T10:15:00-04:00</dhEmi>', '<dhEmi>2026-11-05T23:50:00-04:00</dhEmi>').replace('<dhRecbto>2026-11-05T10:16:30-04:00</dhRecbto>', '<dhRecbto>2026-11-06T00:51:10-03:00</dhRecbto>');
    const t = await textoDe(viradaDoDia);
    expect(t).toContain('NFC-e nº 000000123 Série 001 05/11/2026 23:50:00');
    expect(t).toContain('Data de autorização 05/11/2026 23:51:10');
    // em UTC (Z), para o mesmo emitente
    expect(await textoDe(nfceExemplo().replace('<dhRecbto>2026-11-05T10:16:30-04:00</dhRecbto>', '<dhRecbto>2026-11-05T14:16:30Z</dhRecbto>'))).toContain('Data de autorização 05/11/2026 10:16:30');
    // sem fuso em um dos textos, a data é a do XML
    expect(await textoDe(nfceExemplo().replace('<dhRecbto>2026-11-05T10:16:30-04:00</dhRecbto>', '<dhRecbto>2026-11-05T10:16:30</dhRecbto>'))).toContain('Data de autorização 05/11/2026 10:16:30');
  });

  it('mais de 1.000 itens: desenha os primeiros 1.000, avisa quantos ficaram de fora e conta todos nos totais', async () => {
    const t = await textoDe(nfceExemplo({ itens: 1005 }));
    expect(t).toContain('(mais 5 itens no XML)');
    expect(t).toContain('Qtde. total de itens 1.005');
    expect(t).toContain('07771000');
    expect(t).not.toContain('07771001');
  }, 60000);

  it('consumidor: CNPJ com nome, identificação de estrangeiro sem máscara, entrega em domicílio com nome e endereço, e não identificado', async () => {
    const cnpj = await textoDe(nfceExemplo({ consumidor: 'cnpj' }));
    expect(cnpj).toContain('CONSUMIDOR CNPJ: 98.765.432/0001-10 FAZENDA BOA ESPERANCA AGROPECUARIA LTDA');

    const estrangeiro = await textoDe(nfceExemplo({ consumidor: 'estrangeiro' }));
    expect(estrangeiro).toContain('CONSUMIDOR Id. Estrangeiro: X1234567 JOHN SMITH');
    // passaporte com 14 caracteres não pode ganhar a máscara de CNPJ
    const passaporte = await textoDe(nfceExemplo({ consumidor: 'estrangeiro' }).replace('X1234567', 'AB1234567890CD'));
    expect(passaporte).toContain('AB1234567890CD');
    expect(passaporte).not.toContain('AB.123.456/7890-CD');

    const entrega = await textoDe(nfceExemplo({ entregaEmDomicilio: true }));
    expect(entrega).toContain('CONSUMIDOR CPF: 123.456.789-09 MARIA APARECIDA DA SILVA RUA DAS ACACIAS, 120, JARDIM PRIMAVERA SORRISO - MT - CEP: 78890-100');
    expect(entrega).toContain('Frete R$ 15,00');
    expect(entrega).toContain('Valor a Pagar R$ 1.463,62');

    const anonimo = await textoDe(nfceExemplo({ consumidor: 'nenhum' }));
    expect(anonimo).toContain('CONSUMIDOR NÃO IDENTIFICADO');
    expect(anonimo).not.toMatch(/CONSUMIDOR (CPF|CNPJ|Id)/);
  }, 30_000);

  it('contingência: "EMITIDA EM CONTINGÊNCIA / Pendente de autorização" abaixo do cabeçalho e abaixo da identificação, sem protocolo, com o QR Code', async () => {
    const xml = nfceExemplo({ contingencia: true });
    const pdf = await gerar(xml);
    const t = plano(pdf);
    expect(ocorrencias(t, 'EMITIDA EM CONTINGÊNCIA')).toBe(2);
    expect(ocorrencias(t, 'Pendente de autorização')).toBe(2);
    // a primeira fica entre o cabeçalho e os itens; a segunda, depois da identificação
    const linhas = textoDoPdf(pdf).split('\n');
    const primeira = linhas.indexOf('EMITIDA EM CONTINGÊNCIA');
    const segunda = linhas.lastIndexOf('EMITIDA EM CONTINGÊNCIA');
    expect(linhas.findIndex((l) => l.startsWith('Documento Auxiliar'))).toBeLessThan(primeira);
    expect(primeira).toBeLessThan(linhas.indexOf('Código'));
    expect(linhas.findIndex((l) => l.startsWith('NFC-e nº'))).toBeLessThan(segunda);
    expect(t).not.toContain('Protocolo de autorização');
    expect(t).not.toContain('Data de autorização');
    expect(retangulos(pdf)).toBeGreaterThan(100);
    expect(t).toContain(chaveNfceExemplo(9).replace(/(\d{4})(?=\d)/g, '$1 ')); // a chave da contingência tem outra forma de emissão
  });

  it('nota de contingência que já foi autorizada mostra o protocolo, sem dizer que está pendente', async () => {
    const t = await textoDe(nfceExemplo({ contingencia: true, semProtocolo: false }));
    expect(t).toContain('Protocolo de autorização: 351260000000001');
    expect(t).not.toContain('EMITIDA EM CONTINGÊNCIA');
    expect(t).not.toContain('Pendente de autorização');
  });

  it('homologação: o texto do manual em caixa alta, centralizado, e marca d\'água', async () => {
    const pdf = await gerar(nfceExemplo({ homologacao: true, infAdFisco: 'Documento emitido por ME ou EPP optante pelo Simples Nacional.' }));
    const t = plano(pdf);
    expect(t).toContain('EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL');
    expect(t).toContain('Documento emitido por ME ou EPP optante pelo Simples Nacional.'); // VIII: infAdFisco
    expect(t).toContain('http://homologacao.sefaz.mt.gov.br/nfce/consultanfce');
    expect(pdf.toString('latin1')).toMatch(/\/ca 0\.14/);
    expect(textoDoPdf(pdf).split('\n')).toContain('SEM VALOR FISCAL');
  });

  it('cancelada e denegada ganham marca d\'água; a denegada troca "autorização" por "denegação" no protocolo e na data', async () => {
    const cancelada = await gerar(nfceExemplo(), { cancelada: true });
    expect(textoDoPdf(cancelada).split('\n')).toContain('CANCELADA');
    expect(cancelada.toString('latin1')).toMatch(/\/ca 0\.14/);
    expect(plano(cancelada)).toContain('Protocolo de autorização: 351260000000001'); // o cancelamento é um evento: o protocolo da nota continua

    const denegada = await gerar(nfceExemplo(), { denegada: true });
    const t = plano(denegada);
    expect(textoDoPdf(denegada).split('\n')).toContain('DENEGADA');
    expect(t).toContain('Protocolo de denegação: 351260000000001');
    expect(t).toContain('Data de denegação 05/11/2026 10:16:30');
    expect(t).not.toContain('Protocolo de autorização');

    // o XML de uma nota denegada já traz o protocolo da denegação (cStat 110)
    const doXml = await gerar(nfceExemplo().replace('<cStat>100</cStat>', '<cStat>110</cStat>'));
    expect(plano(doXml)).toContain('Protocolo de denegação:');
    expect(textoDoPdf(doXml).split('\n')).toContain('DENEGADA');

    // a nota cancelada de homologação leva a marca de cancelada
    const ambas = await gerar(nfceExemplo({ homologacao: true }), { cancelada: true });
    expect(textoDoPdf(ambas).split('\n')).toContain('CANCELADA');
    expect(plano(ambas)).toContain('EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO');
  });

  it('valor a pagar, desconto e acréscimos só aparecem quando existem', async () => {
    const semDesconto = await textoDe(nfceExemplo({ semDesconto: true }));
    expect(semDesconto).toContain('Valor total R$ 1.493,43');
    for (const s of ['Valor a Pagar', 'Desconto R$', 'Frete R$', 'Seguro R$', 'Outras despesas R$']) expect(semDesconto, s).not.toContain(s);

    const completo = await textoDe(nfceExemplo().replace('<vSeg>0.00</vSeg>', '<vSeg>3.50</vSeg>').replace('<vOutro>0.00</vOutro>', '<vOutro>2.00</vOutro>').replace(/<vNF>[\d.]+<\/vNF>/, '<vNF>1454.12</vNF>'));
    expect(completo).toContain('Seguro R$ 3,50');
    expect(completo).toContain('Outras despesas R$ 2,00');
    expect(completo).toContain('Valor a Pagar R$ 1.454,12');
  });

  it('os serviços do ISSQN entram no valor total', async () => {
    const xml = nfceExemplo().replace('</ICMSTot>', '</ICMSTot><ISSQNtot><vServ>100.00</vServ></ISSQNtot>');
    const t = await textoDe(xml);
    expect(t).toContain('Valor total R$ 1.593,43');
  });

  it('formas de pagamento: nome da tabela, xPag no tipo Outros e "Meio de pagamento NN" para código que a tabela não tem', async () => {
    const base = nfceExemplo({ pagamento: 'cartao' });
    expect(await textoDe(base.replace('<tPag>03</tPag>', '<tPag>17</tPag>'))).toContain('Pagamento Instantâneo (PIX) 1.448,62');
    expect(await textoDe(base.replace('<tPag>03</tPag>', '<tPag>10</tPag>'))).toContain('Vale Alimentação 1.448,62');
    expect(await textoDe(base.replace('<tPag>03</tPag>', '<tPag>99</tPag><xPag>CONVENIO COM A COOPERATIVA</xPag>'))).toContain('CONVENIO COM A COOPERATIVA 1.448,62');
    expect(await textoDe(base.replace('<tPag>03</tPag>', '<tPag>99</tPag>'))).toContain('Outros 1.448,62');
    expect(await textoDe(base.replace('<tPag>03</tPag>', '<tPag>77</tPag>'))).toContain('Meio de pagamento 77 1.448,62');
    expect(await textoDe(base)).not.toContain('Troco'); // só um cartão, sem troco
    // leiaute 3.10: um grupo pag por forma
    const antigo = await textoDe(nfceExemplo().replace(/<pag>[\s\S]*<\/pag>/, '<pag><tPag>01</tPag><vPag>1000.00</vPag></pag><pag><tPag>02</tPag><vPag>448.62</vPag></pag>'));
    expect(antigo).toContain('Dinheiro 1.000,00 Cheque 448,62');
  });

  it('tributos da Lei 12.741: o valor do XML aparece uma vez, não se repete se as informações complementares já o trazem e some se o XML não o traz', async () => {
    expect(ocorrencias(await textoDe(nfceExemplo()), '12.741')).toBe(1);
    const repetido = await textoDe(nfceExemplo({ infCpl: 'Trib aprox R$ 276,28 Fed/Est/Mun conf. Lei 12.741/2012. Obrigado!' }));
    expect(ocorrencias(repetido, '12.741')).toBe(1);
    expect(repetido).not.toContain('Tributos Totais Incidentes');
    expect(repetido).toContain('Trib aprox R$ 276,28');
    expect(await textoDe(nfceExemplo({ semTributos: true }))).not.toContain('Tributos Totais Incidentes');
  });

  it('informações complementares longas quebram em linhas sem perder palavra; as fiscais vêm antes do QR Code', async () => {
    const pdf = await gerar(nfceExemplo({ itens: 2, infCpl: 'PALAVRA '.repeat(600), infAdFisco: 'FISCAL '.repeat(20) }));
    const t = textoDoPdf(pdf);
    expect(t.match(/PALAVRA/g)).toHaveLength(600);
    expect(t.match(/FISCAL/g)).toHaveLength(20);
    expect(paginas(pdf)).toBe(1);
  });

  it('texto livre enorme é cortado com aviso, em vez de crescer sem limite', async () => {
    const t = await textoDe(nfceExemplo({ itens: 1, infCpl: 'PALAVRA '.repeat(3000) }));
    expect(t).toContain('texto completo no XML');
    expect(ocorrencias(t, 'PALAVRA')).toBeLessThan(700);
  });

  it('campos ausentes não quebram o desenho: sem QR Code, sem endereço de consulta, sem pagamento, sem informações e sem protocolo', async () => {
    const xml = nfceExemplo({ consumidor: 'nenhum', pagamento: 'nenhum', semProtocolo: true })
      .replace(/<infNFeSupl>[\s\S]*?<\/infNFeSupl>/, '')
      .replace(/<infAdic>[\s\S]*?<\/infAdic>/, '')
      .replace(/<enderEmit>[\s\S]*?<\/enderEmit>/, '');
    const pdf = await gerar(xml);
    const t = plano(pdf);
    expect(paginas(pdf)).toBe(1);
    expect(retangulos(pdf)).toBe(0);
    expect(t).toContain('Chave de Acesso 5126 1112');
    expect(t).not.toContain('Consulte pela Chave de Acesso em');
    expect(t).not.toContain('FORMA PAGAMENTO');
    expect(t).not.toContain('Protocolo de');
    expect(t).toContain('CONSUMIDOR NÃO IDENTIFICADO');
    expect(t).toContain('NFC-e nº 000000123 Série 001 05/11/2026 10:15:00');

    // um XML quase vazio também sai
    const minimo = '<NFe><infNFe Id="NFe51261112345678000195650010000001231000000010" versao="4.00"><ide><mod>65</mod><serie>1</serie><nNF>123</nNF></ide><emit><xNome>LOJA</xNome></emit><det nItem="1"><prod><xProd>COISA</xProd></prod></det></infNFe></NFe>';
    const pequeno = await gerar(minimo);
    expect(paginas(pequeno)).toBe(1);
    const tp = plano(pequeno);
    for (const s of ['LOJA', 'COISA', 'Qtde. total de itens 1', 'Valor total R$ 0,00', 'NFC-e nº 000000123 Série 001']) expect(tp, s).toContain(s);
  });

  it('caractere fora do alfabeto do PDF vira ponto de interrogação em vez de quebrar o arquivo', async () => {
    const t = await textoDe(nfceExemplo().replace('SAL MINERAL BOVINO 25 KG', 'SAL MINERAL ŐŰ 25 KG').replace('Vendedor: Joao.', 'Vendedor: Joőo.'));
    expect(t).toContain('SAL MINERAL ?? 25 KG');
    expect(t).toContain('Vendedor: Jo?o.');
  });

  it('o texto do QR Code não passa pela troca de caracteres: o que o XML traz é o que o QR Code codifica', async () => {
    const url = 'http://exemplo.gov.br/nfce?chNFe=1&nVersao=100&tpAmb=1&cIdToken=000001&cHashQRCode=ABCŐŰ';
    const pdf = await gerar(nfceExemplo().replace(/<qrCode>[\s\S]*?<\/qrCode>/, `<qrCode><![CDATA[${url}]]></qrCode>`));
    expect(retangulos(pdf)).toBe(
      matrizQr(url).reduce((total, linha) => total + linha.filter((escuro, i) => escuro && !linha[i - 1]).length, 0),
    );
  });

  it('com a compressão normal (a de produção) o arquivo é válido e menor', async () => {
    const comprimido = await gerarDanfeNfce(nfceExemplo());
    const puro = await gerar(nfceExemplo());
    expect(comprimido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(comprimido.length).toBeLessThan(puro.length);
  });

  it('recusa o que não é NFC-e modelo 65: a NF-e manda usar o DANFE', async () => {
    await expect(gerarDanfeNfce(nfeExemplo())).rejects.toThrow(/NF-e \(modelo 55\).*use o DANFE/);
    await expect(gerarDanfeNfce(nfceExemplo().replace('<mod>65</mod>', '<mod>57</mod>'))).rejects.toThrow(/modelo 65/);
    await expect(gerarDanfeNfce('<catalogo/>')).rejects.toBeInstanceOf(ErroLeituraNfce);
    await expect(gerarDanfeNfce('')).rejects.toBeInstanceOf(ErroLeituraDocumento);
  });
});
