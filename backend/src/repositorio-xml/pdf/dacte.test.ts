import { afterEach, describe, expect, it, vi } from 'vitest';
import { gerarDacte } from './dacte';
import { ErroLeituraCte } from './cte-leitor';
import { ErroLeituraDocumento } from './erros';
import { fmtChave } from './formatos-danfe';
import { Pintor } from './pintor';
import { matrizQr } from './qr';
import { CHAVE_CTE_EXEMPLO, CHAVE_CTE_REFERENCIADO, URL_QR_CTE_EXEMPLO, OpcoesCteExemplo, chaveNfeExemplo, cteExemplo } from './__fixtures__/cte-exemplo';
import { paginas, textoDoPdf } from './__fixtures__/pdf-teste';

const gerar = (xml: string, opcoes = {}) => gerarDacte(xml, { semCompressao: true, ...opcoes });
/** Texto do PDF numa linha só: nomes e endereços longos quebram em várias linhas do desenho. */
const corrido = (pdf: Buffer) => textoDoPdf(pdf).replace(/\s+/g, ' ');
const ocorrencias = (texto: string, trecho: string) => texto.split(trecho).length - 1;
const cte = (o: OpcoesCteExemplo = {}) => cteExemplo(o);

afterEach(() => vi.restoreAllMocks());

describe('gerarDacte', () => {
  it('um CT-e rodoviário típico vira um PDF de uma folha com os blocos do MOC e os dados do XML', async () => {
    const pdf = await gerar(cte());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
    const t = textoDoPdf(pdf);
    const c = corrido(pdf);
    for (const bloco of [
      'DACTE', 'MODAL', 'RODOVIÁRIO', 'IDENTIFICAÇÃO DO EMITENTE', 'MODELO', 'SÉRIE', 'NÚMERO',
      'DATA E HORA DE EMISSÃO', 'INSC. SUFRAMA DESTINATÁRIO', 'CHAVE DE ACESSO', 'PROTOCOLO DE AUTORIZAÇÃO DE USO', 'TIPO DO CT-E', 'TIPO DO SERVIÇO',
      'INDICADOR DO CT-E GLOBALIZADO', 'INF. DO CT-E GLOBALIZADO', 'CÓD. FISCAL DE OPERAÇÕES E PRESTAÇÕES - NAT. DA OPERAÇÃO', 'INÍCIO DA PRESTAÇÃO', 'TÉRMINO DA PRESTAÇÃO',
      'REMETENTE:', 'DESTINATÁRIO:', 'EXPEDIDOR:', 'RECEBEDOR:', 'TOMADOR DO SERVIÇO:', 'PRODUTO PREDOMINANTE', 'OUTRAS CARACTERÍSTICAS DA CARGA', 'VALOR TOTAL DA CARGA',
      'PESO BRUTO (KG)', 'PESO BASE CÁLCULO (KG)', 'PESO AFERIDO (KG)', 'CUBAGEM (M³)', 'QUANTIDADE DE VOLUMES (UND)', 'COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO',
      'VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO', 'VALOR A RECEBER', 'INFORMAÇÕES RELATIVAS AO IMPOSTO', 'CLASSIFICAÇÃO TRIBUTÁRIA DO SERVIÇO', 'ALÍQUOTA DO ICMS', '% RED. BC. CALC.',
      'DOCUMENTOS ORIGINÁRIOS', 'TP DOC.', 'CNPJ/CPF EMITENTE', 'SÉRIE/Nº DOCUMENTO', 'PREVISÃO DO FLUXO DA CARGA', 'OBSERVAÇÕES GERAIS',
      'INFORMAÇÕES ESPECÍFICAS DO MODAL RODOVIÁRIO', 'RNTRC DA EMPRESA', 'USO EXCLUSIVO DO EMISSOR DO CT-E', 'RESERVADO AO FISCO', 'FOLHA 1/1',
      'Consulta em http://www.cte.fazenda.gov.br/portal',
    ]) {
      expect(t, bloco).toContain(bloco);
    }
    expect(c).toContain('Documento Auxiliar do Conhecimento de Transporte Eletrônico'); // em duas linhas, como no modelo
    expect(t).toContain(fmtChave(CHAVE_CTE_EXEMPLO)); // chave em onze grupos de quatro dígitos
    expect(t).toContain('5126 1111 2223 3300 0181 5700 1000 0001 2310 0000 1235');
    expect(t).toContain('351260000000321 05/11/2026 10:16:30'); // protocolo: nProt + data e hora
    expect(t).toContain('05/11/2026 10:15:00');
    expect(c).toContain('TRANSPORTADORA GRAOS DO CERRADO LTDA');
    expect(t).toContain('CNPJ: 11.222.333/0001-81   IE: 131234567');
    expect(t).toContain('RODOVIA BR 163, KM 801 - GALPAO 2');
    expect(t).toContain('DISTRITO INDUSTRIAL - SORRISO - MT');
    expect(t).toContain('CEP: 78890-000   Fone: (66) 3544-1000');
    expect(c).toContain('5353 - PRESTACAO DE SERVICO DE TRANSPORTE A ESTABELECIMENTO COMERCIAL');
    expect(t).toContain('Normal'); // tipo do CT-e e do serviço
    expect(t).toContain('MT - SORRISO');
    expect(t).toContain('MT - RONDONOPOLIS');
    expect(t).toContain('FAZENDA SÃO JOÃO AGROPECUÁRIA LTDA'); // acentos preservados
    expect(t).toContain('12.345.678/0001-95');
    expect(t).toContain('ESTRADA VICINAL LINHA 12 KM 8, S/N - ZONA RURAL');
    expect(t).toContain('78890-000');
    expect(t).toContain('(66) 3544-2000');
    expect(t).toContain('98.765.432/0001-10');
    expect(t).toContain('AVENIDA DAS PALMEIRAS, 1500 - SALA 801 - CENTRO');
    expect(t).toContain('ARMAZENS GERAIS VALE VERDE LTDA');
    expect(t).toContain('TERMINAL INTERMODAL DO CENTRO-OESTE S/A');
    expect(t).toContain('SOJA EM GRAOS');
    expect(t).toContain('GRANEL');
    expect(t).toContain('182.500,00'); // valor da carga em pt-BR
    expect(t).toContain('37.450,00'); // peso bruto e base de cálculo
    expect(t).toContain('37.420,00'); // peso aferido: 37,42 toneladas viram quilos
    expect(t).toContain('3.688,83'); // componente
    expect(t).toContain('FRETE PESO');
    expect(t).toContain('3.763,33'); // total da prestação e valor a receber
    expect(t).toContain('00 - Tributação normal ICMS');
    expect(t).toContain('451,60');
    expect(t).toContain('12,00');
    expect(t).toContain(chaveNfeExemplo(1)); // documentos originários: a chave da NF-e sem espaços, para a busca do leitor de PDF
    expect(t).toContain(chaveNfeExemplo(3));
    expect(t).toContain('123.456.789-09'); // NF-e de produtor rural: CPF tirado da chave
    expect(c).toContain('ROMANEIO 4587');
    expect(t).toContain('NOVA MUTUM'); // fluxo
    expect(t).toContain('12345678'); // RNTRC
    expect(t).toContain('DACTE gerado pelo InTAX a partir do XML do CT-e. O documento fiscal é o arquivo XML');
    expect(t).not.toContain('CANCELADA');
    expect(t).not.toContain('DENEGADA');
    expect(t).not.toContain('SEM VALOR FISCAL');
  });

  it('o código de barras e o QR Code seguem o MOC: Code 128C da chave, barra de no mínimo 1,5 cm, módulo de no máximo 0,03 cm, QR de no mínimo 22 mm com margem de silêncio', async () => {
    const barras = vi.spyOn(Pintor.prototype, 'codigoDeBarras');
    const qr = vi.spyOn(Pintor.prototype, 'qrCode');
    await gerar(cte());
    expect(barras).toHaveBeenCalledTimes(1);
    const [xb, , larguraBarras, alturaBarras, digitos] = barras.mock.calls[0];
    expect(digitos).toBe(CHAVE_CTE_EXEMPLO);
    expect(alturaBarras).toBeGreaterThanOrEqual(1.5 * 28.3465); // 1,5 cm em pontos
    expect(alturaBarras).toBeLessThanOrEqual(2.5 * 28.3465);
    expect(larguraBarras / 277 / 28.3465).toBeLessThanOrEqual(0.03); // 277 módulos: início, 22 símbolos, dígito verificador e parada
    // margem clara de no mínimo 10 módulos de cada lado, dentro da caixa do código de barras (x de 190 a 472)
    const modulo = larguraBarras / 277;
    expect(xb - 190).toBeGreaterThanOrEqual(10 * modulo);
    expect(472 - (xb + larguraBarras)).toBeGreaterThanOrEqual(10 * modulo);

    expect(qr).toHaveBeenCalledTimes(1);
    const [xq, , tamanho, texto] = qr.mock.calls[0];
    expect(texto).toBe(URL_QR_CTE_EXEMPLO);
    expect(tamanho).toBeGreaterThanOrEqual(22 * 2.83465); // 22 mm de conteúdo
    const silencio = 4 * (tamanho / matrizQr(URL_QR_CTE_EXEMPLO).length); // quatro módulos
    expect(xq - 472).toBeGreaterThanOrEqual(silencio); // até a coluna do meio
    expect(14 + 567.28 - (xq + tamanho)).toBeGreaterThanOrEqual(silencio); // até a margem da página
  });

  it('o QR Code vem do XML: sem o campo ele não é desenhado, e texto que o QR Code não comporta não derruba o PDF', async () => {
    const qr = vi.spyOn(Pintor.prototype, 'qrCode');
    expect(paginas(await gerar(cte({ semQrCode: true })))).toBe(1);
    expect(qr).not.toHaveBeenCalled();
    const grande = cte().replace(/<qrCodCTe>[^<]*<\/qrCodCTe>/, `<qrCodCTe>${'A'.repeat(5000)}</qrCodCTe>`);
    const pdf = await gerar(grande);
    expect(paginas(pdf)).toBe(1);
    expect(textoDoPdf(pdf)).toContain(fmtChave(CHAVE_CTE_EXEMPLO));
  });

  it('muitos documentos originários viram várias folhas, cada uma com o cabeçalho completo, a chave, o código de barras, o QR Code e FOLHA n/N', async () => {
    const barras = vi.spyOn(Pintor.prototype, 'codigoDeBarras');
    const qr = vi.spyOn(Pintor.prototype, 'qrCode');
    const pdf = await gerar(cte({ documentos: 300 }));
    const n = paginas(pdf);
    expect(n).toBeGreaterThanOrEqual(3);
    const t = textoDoPdf(pdf);
    for (let i = 1; i <= n; i += 1) expect(t, `folha ${i}`).toContain(`FOLHA ${i}/${n}`);
    for (let i = 1; i <= 300; i += 1) expect(t, `NF-e ${i}`).toContain(chaveNfeExemplo(i));
    // o cabeçalho (emitente, título, número e série, código de barras, chave, protocolo, natureza da operação) repete em toda folha
    expect(ocorrencias(t, fmtChave(CHAVE_CTE_EXEMPLO))).toBe(n);
    expect(ocorrencias(t, 'IDENTIFICAÇÃO DO EMITENTE')).toBe(n);
    expect(ocorrencias(t, 'DACTE\n')).toBeGreaterThanOrEqual(n);
    expect(ocorrencias(t, '351260000000321 05/11/2026 10:16:30')).toBe(n);
    expect(barras).toHaveBeenCalledTimes(n);
    expect(qr).toHaveBeenCalledTimes(n);
    expect(ocorrencias(t, 'DOCUMENTOS ORIGINÁRIOS (continuação)')).toBe(n - 1);
    // os quadros que seguem os documentos aparecem uma vez só, na primeira folha
    for (const bloco of ['PREVISÃO DO FLUXO DA CARGA', 'OBSERVAÇÕES GERAIS', 'INFORMAÇÕES ESPECÍFICAS DO MODAL RODOVIÁRIO', 'USO EXCLUSIVO DO EMISSOR DO CT-E', 'RESERVADO AO FISCO', 'COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO']) {
      expect(ocorrencias(t, bloco), bloco).toBe(1);
    }
    // a primeira folha leva todos os quadros; as folhas adicionais só continuam a lista de documentos (itens 2.12 e 5 do MOC)
    expect(t.indexOf('USO EXCLUSIVO DO EMISSOR DO CT-E')).toBeLessThan(t.indexOf('DOCUMENTOS ORIGINÁRIOS (continuação)'));
  });

  it('lista enorme de documentos é cortada em 2.000, com aviso dos demais que ficam só no XML', async () => {
    const pdf = await gerar(cte({ documentos: 2600 }));
    const t = textoDoPdf(pdf);
    expect(t).toContain('(600 demais documentos no XML)');
    expect(t).toContain(chaveNfeExemplo(2000));
    expect(t).not.toContain(chaveNfeExemplo(2001));
    expect(paginas(pdf)).toBeLessThanOrEqual(20);
    expect(textoDoPdf(await gerar(cte({ documentos: 2000 })))).not.toContain('demais documentos no XML');
  }, 60000);

  it('sem expedidor e recebedor os quadros somem e o tomador ocupa a linha; com um só deles, o tomador fica no lugar do que sumiu', async () => {
    const completo = textoDoPdf(await gerar(cte()));
    expect(ocorrencias(completo, 'ENDEREÇO:')).toBe(5);
    const nenhum = textoDoPdf(await gerar(cte({ semExpedidor: true, semRecebedor: true })));
    expect(nenhum).not.toContain('EXPEDIDOR:');
    expect(nenhum).not.toContain('RECEBEDOR:');
    expect(nenhum).not.toContain('ARMAZENS GERAIS VALE VERDE LTDA');
    expect(nenhum).toContain('TOMADOR DO SERVIÇO:');
    expect(ocorrencias(nenhum, 'ENDEREÇO:')).toBe(3);
    const soExpedidor = textoDoPdf(await gerar(cte({ semRecebedor: true })));
    expect(soExpedidor).toContain('EXPEDIDOR:');
    expect(soExpedidor).not.toContain('RECEBEDOR:');
    expect(soExpedidor).toContain('TOMADOR DO SERVIÇO:');
    expect(ocorrencias(soExpedidor, 'ENDEREÇO:')).toBe(4);
    const soRecebedor = textoDoPdf(await gerar(cte({ semExpedidor: true })));
    expect(soRecebedor).not.toContain('EXPEDIDOR:');
    expect(soRecebedor).toContain('RECEBEDOR:');
    expect(soRecebedor).toContain('TOMADOR DO SERVIÇO:');
    expect(ocorrencias(soRecebedor, 'ENDEREÇO:')).toBe(4);
  });

  it('o tomador "outros" mostra os dados do grupo toma4; os demais repetem os da parte indicada', async () => {
    const outros = textoDoPdf(await gerar(cte({ tomador: 'outros' })));
    expect(outros).toContain('COOPERATIVA AGROINDUSTRIAL DO MEDIO NORTE');
    expect(outros).toContain('44.555.666/0001-54');
    expect(outros).toContain('RUA DOS COOPERADOS, 900 - CENTRO');
    expect(outros).toContain('78890-100');
    const destinatario = textoDoPdf(await gerar(cte({ tomador: 'destinatario' })));
    expect(ocorrencias(destinatario, 'TRADING COMMODITIES BRASIL S/A')).toBe(2); // destinatário e tomador
    expect(destinatario).not.toContain('COOPERATIVA AGROINDUSTRIAL');
  });

  it('CT-e cancelado, denegado e em homologação ganham marca d\'água em todas as folhas; o de homologação traz o texto do MOC no campo de conteúdo variável', async () => {
    const cancelada = await gerar(cte({ documentos: 200 }), { cancelada: true });
    expect(ocorrencias(textoDoPdf(cancelada), 'CANCELADA')).toBe(paginas(cancelada));
    expect(paginas(cancelada)).toBeGreaterThanOrEqual(2);
    expect(textoDoPdf(await gerar(cte(), { denegada: true }))).toContain('DENEGADA');
    const homologacao = textoDoPdf(await gerar(cte({ homologacao: true })));
    expect(homologacao).toContain('SEM VALOR FISCAL');
    expect(homologacao).toMatch(/EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO . SEM VALOR FISCAL/); // o travessão do MOC
    expect(homologacao).not.toContain('Consulta em http://www.cte.fazenda.gov.br/portal');
    expect(ocorrencias(homologacao, 'SEM VALOR FISCAL')).toBe(2); // o texto e a marca d'água
  });

  it('campos ausentes ficam em branco: sem protocolo, sem QR Code, sem observações, sem componentes, XML mínimo', async () => {
    const qr = vi.spyOn(Pintor.prototype, 'qrCode');
    const pdf = await gerar(cte({ enxuto: true, semProtocolo: true, semQrCode: true }));
    const t = textoDoPdf(pdf);
    expect(paginas(pdf)).toBe(1);
    expect(qr).not.toHaveBeenCalled();
    expect(t).toContain('PROTOCOLO DE AUTORIZAÇÃO DE USO');
    expect(t).not.toContain('351260000000321');
    expect(t).toContain('OBSERVAÇÕES GERAIS');
    expect(t).toContain('FOLHA 1/1');
    const minimo = await gerar(`<CTe><infCte Id="CTe${CHAVE_CTE_EXEMPLO}"><ide><mod>57</mod></ide></infCte></CTe>`);
    expect(minimo.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(minimo)).toBe(1);
    expect(textoDoPdf(minimo)).toContain(fmtChave(CHAVE_CTE_EXEMPLO));
  });

  it('CT-e complementar, substituto e de anulação (leiaute 3.00) mostram a chave do CT-e de referência', async () => {
    const chaveReferencia = fmtChave(CHAVE_CTE_REFERENCIADO);
    const normal = textoDoPdf(await gerar(cte()));
    expect(normal).not.toContain('CT-E DE REFERÊNCIA');
    expect(normal).not.toContain(chaveReferencia);
    const complemento = textoDoPdf(await gerar(cte({ tipo: 'complemento' })));
    expect(complemento).toContain('Complemento de Valores');
    expect(complemento).toContain('CT-E COMPLEMENTADO');
    expect(complemento).toContain(chaveReferencia);
    const substituto = textoDoPdf(await gerar(cte({ tipo: 'substituto' })));
    expect(substituto).toContain('Substituição');
    expect(substituto).toContain('CT-E SUBSTITUÍDO');
    expect(substituto).toContain(chaveReferencia);
    expect(substituto).toContain(chaveNfeExemplo(1)); // o substituto ainda leva os documentos
    const anulacao = textoDoPdf(await gerar(cte({ tipo: 'anulacao' })));
    expect(anulacao).toContain('Anulação');
    expect(anulacao).toContain('CT-E ANULADO');
    expect(anulacao).toContain(chaveReferencia);
  });

  it('cada grupo de ICMS mostra situação tributária, base, alíquota, valor e redução; no ICMS60, a substituição tributária retida', async () => {
    const reduzido = textoDoPdf(await gerar(cte({ icms: 'ICMS20' })));
    expect(reduzido).toContain('20 - Tributação com BC reduzida do ICMS');
    expect(reduzido).toContain('40,00'); // % de redução da base
    expect(reduzido).toContain('2.258,00');
    expect(reduzido).toContain('270,96');
    const st = textoDoPdf(await gerar(cte({ icms: 'ICMS60' })));
    expect(st).toContain('60 - ICMS cobrado por substituição tributária');
    expect(st).toContain('VALOR DO ICMS ST RETIDO');
    expect(st).toContain('639,77');
    expect(st).toContain('17,00');
    expect(st).toContain('CRÉDITO OUTORGADO/PRESUMIDO');
    expect(st).toContain('127,95');
    expect(textoDoPdf(await gerar(cte({ icms: 'ICMS45' })))).toContain('40 - ICMS isenção');
    expect(textoDoPdf(await gerar(cte({ icms: 'ICMS90' })))).toContain('90 - ICMS outros');
    expect(textoDoPdf(await gerar(cte({ icms: 'ICMSSN' })))).toContain('01 - Simples Nacional');
    const outraUf = textoDoPdf(await gerar(cte({ icms: 'ICMSOutraUF' })));
    expect(outraUf).toContain('ICMS devido à UF de origem da prestação (outra UF)');
    expect(outraUf).toContain('451,60');
    const normal = textoDoPdf(await gerar(cte()));
    expect(normal).not.toContain('CRÉDITO OUTORGADO/PRESUMIDO');
    expect(normal).not.toContain('ICMS ST RETIDO');
  });

  it('IBS e CBS (NT 2025.001) aparecem num quadro próprio quando o XML traz o grupo', async () => {
    const com = textoDoPdf(await gerar(cte({ ibsCbs: true })));
    expect(com).toContain('INFORMAÇÕES RELATIVAS AO IBS E À CBS');
    for (const rotulo of ['CST IBS/CBS', 'CLASS. TRIBUTÁRIA', 'VALOR DO IBS', 'VALOR DA CBS', 'VALOR TOTAL DO DF-E']) expect(com, rotulo).toContain(rotulo);
    expect(com).toContain('000001');
    expect(com).toContain('0,10');
    expect(com).toContain('0,90');
    expect(com).toContain('33,87');
    expect(com).toContain('3.800,96');
    expect(textoDoPdf(await gerar(cte()))).not.toContain('IBS');
  });

  it('documentos de transporte anterior (redespacho) ganham a própria tabela', async () => {
    const t = textoDoPdf(await gerar(cte({ documentosAnteriores: true })));
    expect(t).toContain('DOCUMENTOS DE TRANSPORTE ANTERIOR');
    expect(t).toContain(CHAVE_CTE_REFERENCIADO);
    expect(t).toContain('DTA');
    expect(t).toContain('1-2/4455');
    expect(t).toContain('44.555.666/0001-54');
    expect(textoDoPdf(await gerar(cte()))).not.toContain('DOCUMENTOS DE TRANSPORTE ANTERIOR');
  });

  it('veículos novos transportados ganham a tabela do MOC, que continua nas folhas adicionais quando é longa', async () => {
    const poucos = corrido(await gerar(cte({ veiculosNovos: 2 })));
    expect(poucos).toContain('INFORMAÇÕES SOBRE OS VEÍCULOS NOVOS TRANSPORTADOS');
    for (const rotulo of ['CHASSI', 'COR', 'MARCA/MODELO', 'VR. UNIT. DO VEÍCULO', 'FRETE UNITÁRIO']) expect(poucos, rotulo).toContain(rotulo);
    expect(poucos).toContain('9BWZZZ377VT004201');
    expect(poucos).toContain('12 - PRATA METALICO');
    expect(poucos).toContain('86.000,00');
    expect(poucos).toContain('1.202,00');
    expect(textoDoPdf(await gerar(cte()))).not.toContain('VEÍCULOS NOVOS');
    const muitos = await gerar(cte({ veiculosNovos: 150 }));
    const t = textoDoPdf(muitos);
    expect(paginas(muitos)).toBeGreaterThanOrEqual(2);
    for (let i = 1; i <= 150; i += 1) expect(t, `veículo ${i}`).toContain(`9BWZZZ377VT00${4200 + i}`);
    expect(t).toContain('INFORMAÇÕES SOBRE OS VEÍCULOS NOVOS TRANSPORTADOS (continuação)');
  });

  it('uso exclusivo do emissor, reservado ao Fisco e informações adicionais do Fisco entram nos quadros certos', async () => {
    const t = corrido(await gerar(cte({ obsCont: 2, obsFisco: 2, infAdFisco: 'CONVENIO ICMS 106/96' })));
    expect(t).toContain('CAMPO1: CONTEUDO LIVRE DO EMISSOR NUMERO 1');
    expect(t).toContain('CAMPO2: CONTEUDO LIVRE DO EMISSOR NUMERO 2');
    expect(t).toContain('FISCO1: NORMA REFERENCIADA 1');
    expect(t).toContain('FISCO2: NORMA REFERENCIADA 2');
    expect(t).toContain('Informações adicionais de interesse do Fisco: CONVENIO ICMS 106/96');
  });

  it('observações longas continuam em folha adicional sem perder palavra, e texto livre enorme é cortado com aviso', async () => {
    const pdf = await gerar(cte({ observacao: 'PALAVRA '.repeat(1500) }));
    const t = textoDoPdf(pdf);
    expect(paginas(pdf)).toBe(2);
    expect(t.match(/PALAVRA/g)).toHaveLength(1500);
    expect(t).toContain('CONTINUA NA FOLHA SEGUINTE');
    expect(t).toContain('OBSERVAÇÕES GERAIS (continuação)');
    expect(t).toContain('FOLHA 2/2');
    const enorme = await gerar(cte({ observacao: 'PALAVRA '.repeat(6000) }));
    expect(paginas(enorme)).toBeLessThan(8);
    expect(textoDoPdf(enorme)).toContain('texto completo no XML');
  });

  it('o recebedor que retira a carga e o CT-e globalizado ganham aviso nas observações e no cabeçalho', async () => {
    const retira = corrido(await gerar(cte().replace('<retira>1</retira>', '<retira>0</retira><xDetRetira>RETIRA NO PATIO DO TERMINAL</xDetRetira>')));
    expect(retira).toContain('O recebedor retira a carga no destino: RETIRA NO PATIO DO TERMINAL');
    const globalizado = corrido(await gerar(cte({ globalizado: true })));
    expect(globalizado).toContain('INF. DO CT-E GLOBALIZADO');
    expect(globalizado).toContain('CT-e globalizado: CTE GLOBALIZADO CONFORME REGIME ESPECIAL AUTORIZADO PELA SEFAZ');
  });

  it('modais que não são o rodoviário mostram os campos do grupo do XML; o rodoviário mostra o RNTRC e as ordens de coleta', async () => {
    const ferroviario = textoDoPdf(await gerar(cte({ modal: '04' })));
    expect(ferroviario).toContain('FERROVIÁRIO');
    expect(ferroviario).toContain('INFORMAÇÕES ESPECÍFICAS DO MODAL FERROVIÁRIO');
    expect(ferroviario).toContain('Tipo de tráfego: 1');
    expect(ferroviario).toContain('Fluxo ferroviário: 1234567890');
    expect(ferroviario).not.toContain('RNTRC DA EMPRESA');
    expect(textoDoPdf(await gerar(cte({ modal: '02' })))).toContain('Nº da minuta: 123456789');
    expect(textoDoPdf(await gerar(cte({ modal: '06' })))).toContain('Nº do certificado do operador de transporte multimodal: COTM-2026-0042');
    const rodoviario = corrido(await gerar(cte({ ordensColeta: 2 })));
    expect(rodoviario).toContain('ORDENS DE COLETA ASSOCIADAS');
    expect(rodoviario).toContain('1/17 de 02/11/2026 - 11.222.333/0001-81 IE 131234567 MT');
    expect(rodoviario).toContain('1/34 de 03/11/2026');
  });

  it('as medidas da carga vão para o campo certo: tonelada vira quilo, cubagem em m³, e o que não tem campo vai em outras quantidades', async () => {
    const infQ = '<infQ><cUnid>02</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>37.4500</qCarga></infQ><infQ><cUnid>00</cUnid><tpMed>CUBAGEM</tpMed><qCarga>12.5000</qCarga></infQ><infQ><cUnid>04</cUnid><tpMed>LITRAGEM</tpMed><qCarga>1000.0000</qCarga></infQ><infQ><cUnid>03</cUnid><tpMed>CAIXAS</tpMed><qCarga>25.0000</qCarga></infQ>';
    const xml = cte().replace(/<infQ>[\s\S]*<\/infQ>/, infQ);
    const t = textoDoPdf(await gerar(xml));
    expect(t).toContain('37.450,00'); // 37,45 toneladas
    expect(t).toContain('12,50'); // cubagem
    expect(t).toContain('25'); // volumes
    expect(t).toContain('OUTRAS QUANTIDADES DA CARGA');
    expect(t).toContain('LITRAGEM: 1.000,00 LITROS');
    expect(textoDoPdf(await gerar(cte()))).not.toContain('OUTRAS QUANTIDADES DA CARGA');
    // o tipo da medida é texto livre: com ou sem acento, em maiúsculas ou não
    const acentuado = cte().replace(/<infQ>.*<\/infQ>/, '<infQ><cUnid>01</cUnid><tpMed>Peso Base de Cálculo</tpMed><qCarga>1234.5000</qCarga></infQ><infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>x</qCarga></infQ>');
    const ta = textoDoPdf(await gerar(acentuado));
    expect(ta).toContain('1.234,50');
    expect(ta).not.toContain('OUTRAS QUANTIDADES DA CARGA'); // a quantidade inválida é ignorada, não vira lixo
  });

  it('textos longos são cortados ou quebrados dentro dos quadros, sem aumentar o PDF nem sair do lugar', async () => {
    const xml = cte({ observacao: 'OBSERVACAO CURTA' })
      .replace('TRANSPORTADORA GRAOS DO CERRADO LTDA', 'TRANSPORTADORA '.concat('GRAOS '.repeat(20)).trim())
      .replace('ESTRADA VICINAL LINHA 12 KM 8', 'RUA '.concat('A'.repeat(250)))
      .replace('FAZENDA SÃO JOÃO AGROPECUÁRIA LTDA', 'W'.repeat(60))
      .replace('<proPred>SOJA EM GRAOS</proPred>', `<proPred>${'PRODUTO '.repeat(30)}</proPred>`);
    const pdf = await gerar(xml);
    expect(paginas(pdf)).toBe(1);
    const t = textoDoPdf(pdf);
    expect(t).toContain('FOLHA 1/1');
    expect(t).toContain(fmtChave(CHAVE_CTE_EXEMPLO));
  });

  it('XML fora do leiaute não estoura a folha: componentes além de 60 e ocorrências além de 10 ficam só no XML', async () => {
    const componentes = textoDoPdf(await gerar(cte({ componentes: 100 })));
    expect(componentes).toContain('(40 demais componentes no XML)');
    expect(componentes).toContain('COMP 60');
    expect(componentes).not.toContain('COMP 61');
    const livres = textoDoPdf(await gerar(cte({ obsCont: 30, obsFisco: 30 })));
    expect(livres).toContain('CAMPO10: CONTEUDO LIVRE DO EMISSOR NUMERO 10');
    expect(livres).not.toContain('CAMPO11:');
    expect(livres).not.toContain('FISCO11:');
    const referencia = '<infCteComp><chCTe>'.concat(CHAVE_CTE_REFERENCIADO, '</chCTe></infCteComp>');
    const muitas = textoDoPdf(await gerar(cte({ tipo: 'complemento' }).replace(/<infCteComp>.*?<\/infCteComp>/, referencia.repeat(30))));
    expect(ocorrencias(muitas, fmtChave(CHAVE_CTE_REFERENCIADO))).toBe(10);
    const coletas = textoDoPdf(await gerar(cte({ ordensColeta: 25 })));
    expect(coletas).toContain('1/170 de');
    expect(coletas).not.toContain('1/187 de');
  });

  it('caractere fora do alfabeto do PDF vira ponto de interrogação em vez de quebrar o arquivo', async () => {
    const xml = cte().replace('FAZENDA SÃO JOÃO AGROPECUÁRIA LTDA', 'FAZENDA EXEMPLO ŐŰ LTDA');
    expect(textoDoPdf(await gerar(xml))).toContain('FAZENDA EXEMPLO ?? LTDA');
  });

  it('com a compressão normal (a de produção) o arquivo é válido e menor', async () => {
    const comprimido = await gerarDacte(cte());
    const puro = await gerar(cte());
    expect(comprimido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(comprimido.subarray(-6).toString()).toContain('%%EOF');
    expect(comprimido.length).toBeLessThan(puro.length);
  });

  it('recusa o que não é CT-e modelo 57, com mensagem em português', async () => {
    await expect(gerarDacte(cte().replace('<mod>57</mod>', '<mod>67</mod>'))).rejects.toThrow(/CT-e OS \(modelo 67\)/);
    await expect(gerarDacte(cte().replace('<mod>57</mod>', '<mod>64</mod>'))).rejects.toThrow(/modelo 57/);
    await expect(gerarDacte('<cteOSProc><CTeOS><infCte/></CTeOS></cteOSProc>')).rejects.toThrow(/DACTE OS/);
    await expect(gerarDacte('<catalogo/>')).rejects.toBeInstanceOf(ErroLeituraCte);
    await expect(gerarDacte('<catalogo/>')).rejects.toBeInstanceOf(ErroLeituraDocumento);
    await expect(gerarDacte('')).rejects.toBeInstanceOf(ErroLeituraDocumento);
    await expect(gerarDacte(cte().replace(/ Id="CTe\d{44}"/, '').replace(/<protCTe[\s\S]*<\/protCTe>/, ''))).rejects.toThrow(/chave de acesso/);
  });
});
