import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { gerarDamdfe } from './damdfe';
import { ErroLeituraDocumento } from './erros';
import { CHAVE_MDFE_EXEMPLO, mdfeExemplo, mdfeMinimo } from './__fixtures__/mdfe-exemplo';
import { nfeExemplo } from './__fixtures__/nfe-exemplo';
import { paginas, retangulos, textoDoPdf } from './__fixtures__/pdf-teste';
import { A4 } from './pintor';
import { matrizQr } from './qr';

const gerar = (xml: string, opcoes = {}) => gerarDamdfe(xml, { semCompressao: true, ...opcoes });

/**
 * Textos do PDF (sem compressão) com a posição: o x, a linha de base com o eixo y para baixo (como no desenho) e o tamanho da
 * letra. Cada linha de texto do pdfkit é um bloco `1 0 0 1 x y Tm` + `/Fn tam Tf` + `[...] TJ`, e o y do Tm é o da folha de baixo para cima.
 */
function textosComPosicao(pdf: Buffer): { x: number; base: number; tam: number; texto: string }[] {
  const re = /1 0 0 1 ([0-9.-]+) ([0-9.-]+) Tm\n\/F\d+ ([0-9.]+) Tf\n\[((?:<[0-9a-fA-F]*>|\s|-?[0-9.]+)+)\] TJ/g;
  return [...pdf.toString('latin1').matchAll(re)].map((m) => ({
    x: Number(m[1]),
    base: A4.altura - Number(m[2]),
    tam: Number(m[3]),
    texto: [...m[4].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''),
  }));
}

/** Segmentos verticais traçados no PDF: `x y1 m`, `x y2 l`, `S` (as divisórias das colunas das tabelas e as bordas das caixas). */
function segmentosVerticais(pdf: Buffer): { x: number; yMin: number; yMax: number }[] {
  return [...pdf.toString('latin1').matchAll(/\n([0-9.]+) ([0-9.]+) m\n([0-9.]+) ([0-9.]+) l\nS\n/g)]
    .filter((m) => m[1] === m[3] && m[2] !== m[4])
    .map((m) => ({ x: Number(m[1]), yMin: Math.min(Number(m[2]), Number(m[4])), yMax: Math.max(Number(m[2]), Number(m[4])) }));
}

const CHAVE_AGRUPADA = '5126 1111 2223 3300 0181 5800 1000 0045 1214 8076 2065';
/** Chaves de CT-e e NF-e do XML, em ordem. */
const chavesDoXml = (xml: string): string[] => [...xml.matchAll(/<ch(?:CTe|NFe)>(\d{44})<\/ch(?:CTe|NFe)>/g)].map((m) => m[1]);
/** Chaves de 44 dígitos (em grupos de 4) que o texto do PDF traz, sem os espaços. */
const chavesNoTexto = (t: string): Set<string> => new Set([...t.matchAll(/\b\d{4}(?: \d{4}){10}\b/g)].map((m) => m[0].replace(/ /g, '')));
// O traço longo (–) sai do PDF no byte 0x96 do WinAnsi, que o leitor de texto dos testes devolve como U+0096.
const TRACO_LONGO = '\u0096';

describe('gerarDamdfe', () => {
  it('um MDF-e rodoviário típico vira um PDF de uma página com os blocos e os dados do XML', async () => {
    const xml = mdfeExemplo();
    const pdf = await gerar(xml);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
    const t = textoDoPdf(pdf);
    for (const bloco of [
      'DAMDFE - Documento Auxiliar de Manifesto Eletrônico de Documentos Fiscais', 'MODELO', 'SÉRIE', 'NÚMERO', 'DATA E HORA DE EMISSÃO', 'UF CARREG.', 'UF DESCARREG.',
      'INÍCIO DA VIAGEM', 'Modal Rodoviário de Carga', 'QTD. CT-e', 'QTD. NF-e', 'PESO TOTAL (KG)', 'VALOR TOTAL DA CARGA (R$)', 'PROTOCOLO DE AUTORIZAÇÃO DE USO',
      'CONTROLE DO FISCO', 'CHAVE DE ACESSO', 'VEÍCULO', 'CONDUTOR', 'VALE-PEDÁGIO', 'CIOT', 'CONTRATANTE DO SERVIÇO DE TRANSPORTE', 'PAGAMENTO DO FRETE',
      'SEGURO DA CARGA', 'PRODUTO PREDOMINANTE', 'PERCURSO (UF)', 'MUNICÍPIO(S) DE CARREGAMENTO', 'LACRES', 'AUTORIZADOS A BAIXAR O XML DO MDF-e',
      'DOCUMENTOS FISCAIS VINCULADOS AO MANIFESTO', 'OBSERVAÇÕES',
    ]) expect(t, bloco).toContain(bloco);

    // identificação
    expect(t).toContain('TRANSPORTADORA GRAOS DO NORTE LTDA');
    expect(t).toContain('RODOVIA BR 163 KM 782, S/N - GALPAO 2 - DISTRITO INDUSTRIAL');
    expect(t).toContain('SORRISO - MT CEP 78890-000 Fone: (66) 3544-1200');
    expect(t).toContain('CNPJ: 11.222.333/0001-81   IE: 131000111   RNTRC: 04512789');
    expect(t).toMatch(/MODELO\n58\nSÉRIE\n1\nNÚMERO\n4512\nFL\n/);
    expect(t).toContain('05/11/2026 08:42:10'); // emissão
    expect(t).toContain('05/11/2026 14:00:00'); // início da viagem
    expect(t).toMatch(/UF CARREG\.\nMT\nUF DESCARREG\.\nPR\n/);
    expect(t).toContain(CHAVE_AGRUPADA); // chave em grupos de 4
    expect(t).toContain('Consulte em https://dfe-portal.svrs.rs.gov.br/MDFe/consulta');
    expect(t).toContain('151260000012345 - 05/11/2026 às 09:42:58-03:00');

    // quantidades, peso e valor em pt-BR
    expect(t).toMatch(/QTD\. CT-e\n6\nQTD\. NF-e\n6\nPESO TOTAL \(KG\)\n38\.500,00\nVALOR TOTAL DA CARGA \(R\$\)\n148\.750,50\n/);

    // modal rodoviário
    expect(t).toMatch(/Tração\nQJK4B21\nMT\n04512789\n9\.500\n0\n0\n/);
    expect(t).toMatch(/Reboque\nABC1D23\nMT\n04999111\n7\.200\n20\.000\n45\n/); // RNTRC do proprietário
    expect(t).toMatch(/Reboque\nABC4E56\nMT\n04512789\n/); // sem proprietário: o RNTRC é o do emitente
    expect(t).toContain('Proprietário: TRANSPORTES PARCEIROS DO MEDIO NORTE LTDA - 45.678.901/0001-23 - RNTRC ');
    expect(t).toContain('04999111 - Outros');
    expect(t).toMatch(/529\.982\.247-25\nJOSE CARLOS DA SILVA\n111\.444\.777-35\nANTONIO FERREIRA LIMA\n/);
    expect(t).toMatch(/98\.765\.432\/0001-10\n12\.345\.678\/0001-95\n202611050001234\nTAG\n842,30\n/);
    expect(t).toMatch(/11\.222\.333\/0001-81\n12\.345\.678\/0001-95\n202611050001235\nCartão\n310,00\n/); // sem CNPJPg: o responsável é o emitente
    expect(t).toMatch(/123456789012\n12\.345\.678\/0001-95\n123456789013\n529\.982\.247-25\n/);
    expect(t).toMatch(/AGRO EXPORTADORA SOL NASCENTE S\/A\n98\.765\.432\/0001-10\n2026-0098\n48\.500,00\n/);
    expect(t).toContain('A prazo');
    expect(t).toContain('15.000,00');
    expect(t).toContain('Componentes do frete: Vale-pedágio R$ 842,30; Outros (ADICIONAL DE ESPERA NO PORTO) R$ 150,00.');
    expect(t).toContain('Parcelas: 001 - 05/12/2026 - R$ 33.500,00.');
    expect(t).toContain('Pagamento via chave PIX financeiro@transportadora-exemplo.com.br.');
    expect(t).toContain('Operação de transporte de alto desempenho.');

    // seguro, produto, percurso, lacres, autorizados
    expect(t).toContain('Emitente do MDF-e - 11.222.333/0001-81');
    expect(t).toMatch(/SEGURADORA EXEMPLO S\/A\n45\.678\.901\/0001-23\n1234567890123\n2026110000000123456789;/);
    expect(t).toContain('2026110000000987654321');
    expect(t).toMatch(/Granel sólido\nSOJA EM GRAOS\n1201\.90\.00\nSEM GTIN\n/);
    expect(t).toContain('MT > MS > PR');
    expect(t).toContain('SORRISO; LUCAS DO RIO VERDE');
    expect(t).toMatch(/Prestador de serviço de transporte\nTIPO DO TRANSPORTADOR\nETC\nFORMA DE EMISSÃO\nNormal\n/);
    expect(t).toContain('MD5001, MD5002, MD5003 | Do veículo: RD7001, RD7002, RD7003');
    expect(t).toContain('CNPJ 12.345.678/0001-95; CPF 529.982.247-25');

    // documentos por município: todas as 12 chaves, agrupadas por tipo
    expect(t).toContain('MUNICÍPIO DE DESCARGA: PARANAGUA   -   CT-e: 2   NF-e: 2');
    expect(t).toContain('MUNICÍPIO DE DESCARGA: PONTA GROSSA');
    expect(t).toContain('MUNICÍPIO DE DESCARGA: CASCAVEL');
    const noTexto = chavesNoTexto(t);
    const doXml = chavesDoXml(xml);
    expect(doXml).toHaveLength(12);
    doXml.forEach((chave) => expect(noTexto.has(chave), chave).toBe(true));

    // observações, folha e rodapé
    expect(t).toContain('Carga de soja em graos safra 2025/26.');
    expect(t).toContain('Transporte de carga de soja em graos amparado por contrato de transporte continuado.');
    expect(t).toMatch(/\n1\/1\n/);
    expect(t).toContain('DAMDFE gerado pelo InTAX a partir do XML do MDF-e. O documento fiscal é o arquivo XML');

    // sem marcas d'água, sem aviso de contingência e sem reticências no meio das células
    for (const ausente of ['CANCELADO', 'SEM VALOR FISCAL', 'EMISSÃO EM CONTINGÊNCIA', '\u0085']) expect(t, ausente).not.toContain(ausente);
    expect(t).not.toMatch(/undefined|NaN|null|\[object/);
  });

  it('o código de barras e o QR Code seguem o Anexo II: barras com 1,5 a 2,5 cm de altura e módulo de até 0,03 cm; QR com 22 mm ou mais de conteúdo', async () => {
    const xml = mdfeExemplo();
    const pdf = await gerar(xml);
    const texto = pdf.toString('latin1');
    // Cada barra do código e cada trecho do QR Code é um retângulo "x y largura altura re" (coordenadas já com o eixo y para baixo).
    const todos = [...texto.matchAll(/([0-9.]+) ([0-9.]+) ([0-9.]+) ([0-9.]+) re/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }));

    // as barras são os retângulos estreitos e altos (os trechos do QR têm cerca de 1,6 pt de altura)
    const barras = todos.filter((r) => r.w < 4 && r.h > 20);
    expect(barras).toHaveLength(76); // 3 do início, 22 símbolos x 3, 3 do dígito verificador e 4 da parada
    const alturaBarras = barras[0].h;
    expect(alturaBarras).toBeGreaterThanOrEqual((1.5 / 2.54) * 72); // 1,5 cm = 42,5 pt
    expect(alturaBarras).toBeLessThanOrEqual((2.5 / 2.54) * 72); // 2,5 cm = 70,9 pt
    barras.forEach((b) => expect(b.h).toBe(alturaBarras));
    const modulo = Math.min(...barras.map((b) => b.w));
    expect(modulo).toBeLessThanOrEqual((0.03 / 2.54) * 72 + 1e-6); // 0,03 cm = 0,85 pt
    const larguraTotal = Math.max(...barras.map((b) => b.x + b.w)) - Math.min(...barras.map((b) => b.x));
    expect(larguraTotal).toBeLessThanOrEqual((9 / 2.54) * 72); // cabe na área de 3 x 9 cm

    // QR Code: 68 pt (24 mm) de conteúdo; a menor altura de retângulo é a de um módulo
    const url = `https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${CHAVE_MDFE_EXEMPLO}&tpAmb=1`;
    const n = matrizQr(url).length;
    const moduloQr = 68 / n;
    const retQr = todos.filter((r) => Math.abs(r.h - moduloQr) < 0.001);
    expect(retQr.length).toBeGreaterThan(50);
    const larguraQr = Math.max(...retQr.map((r) => r.x + r.w)) - Math.min(...retQr.map((r) => r.x));
    expect(larguraQr).toBeCloseTo(68, 1);
    expect(larguraQr).toBeGreaterThanOrEqual((22 / 25.4) * 72); // 22 mm
    // margem de silêncio de pelo menos 3 mm entre o QR e a borda direita da folha
    const bordaDireita = 595.28;
    expect(bordaDireita - Math.max(...retQr.map((r) => r.x + r.w))).toBeGreaterThanOrEqual((3 / 25.4) * 72);

    // sem o grupo infMDFeSupl não há QR Code: os retângulos a menos são os trechos escuros dele
    const semQr = await gerar(mdfeExemplo({ semQrCode: true }));
    let trechos = 0;
    for (const linha of matrizQr(url)) {
      let anterior = false;
      for (const escuro of linha) { if (escuro && !anterior) trechos += 1; anterior = escuro; }
    }
    expect(retangulos(pdf) - retangulos(semQr)).toBe(trechos);
  });

  it('as divisórias das colunas terminam na base da linha de dados: o texto livre logo abaixo (proprietário do veículo, componentes do frete, carga lotação) ocupa a largura toda e nenhuma divisória o corta', async () => {
    const comLotacao = mdfeExemplo().replace('<NCM>12019000</NCM>', '<NCM>12019000</NCM><infLotacao><infLocalCarrega><CEP>78890000</CEP></infLocalCarrega><infLocalDescarrega><latitude>-25.516000</latitude><longitude>-48.509000</longitude></infLocalDescarrega></infLotacao>');
    const medidor = new PDFDocument(); // só para medir a largura do texto em Helvetica
    medidor.font('Helvetica').fontSize(6.1);

    for (const xml of [mdfeExemplo(), comLotacao]) {
      const pdf = await gerar(xml);
      const verticais = segmentosVerticais(pdf);
      // O texto de detalhe das tabelas é o único em corpo 6,1: proprietário do reboque (2 linhas), 4 linhas do pagamento do frete
      // e, no segundo XML, a carga lotação do produto predominante.
      const detalhes = textosComPosicao(pdf).filter((t) => t.tam === 6.1);
      expect(detalhes.length).toBeGreaterThanOrEqual(5);
      expect(detalhes.some((t) => t.texto.startsWith('Proprietário:'))).toBe(true);
      expect(detalhes.some((t) => t.texto.startsWith('Componentes do frete:'))).toBe(true);
      expect(detalhes.some((t) => t.texto.startsWith('Carga lotação:'))).toBe(xml === comLotacao);

      let divisoriasNaFaixa = 0;
      for (const t of detalhes) {
        const fim = t.x + medidor.widthOfString(t.texto);
        // Helvetica: as letras vão de 0,718 do corpo acima da linha de base a 0,207 abaixo dela.
        const topoDasLetras = t.base - 0.718 * t.tam;
        const fundoDasLetras = t.base + 0.207 * t.tam;
        const naFaixa = verticais.filter((v) => v.x > t.x && v.x < fim);
        divisoriasNaFaixa += naFaixa.length;
        expect(naFaixa.filter((v) => v.yMax > topoDasLetras + 0.25 && v.yMin < fundoDasLetras), t.texto).toEqual([]);
      }
      // O teste só vale se há divisórias de colunas na largura desse texto (as das linhas de dados de cima e de baixo).
      expect(divisoriasNaFaixa).toBeGreaterThan(0);
    }
    medidor.end();
  });

  it('muitos documentos viram várias páginas: todas as chaves aparecem e cada página tem o cabeçalho curto e a folha n/N', async () => {
    const xml = mdfeExemplo({ municipiosDescarga: 3, documentosPorMunicipio: 400 });
    const pdf = await gerar(xml);
    const n = paginas(pdf);
    expect(n).toBeGreaterThanOrEqual(5);
    const t = textoDoPdf(pdf);
    expect(t).toMatch(new RegExp(`\\n1/${n}\\n`)); // folha da primeira página, no campo FL
    for (let i = 2; i <= n; i += 1) expect(t, `folha ${i}`).toContain(`FOLHA ${i}/${n}`);
    expect(t.match(/DAMDFE - Documento Auxiliar de Manifesto Eletrônico de Documentos Fiscais \(continuação\)/g)).toHaveLength(n - 1);
    expect(t.match(/Chave de acesso: 5126 1111 2223 3300 0181 5800 1000 0045 1214 8076 2065/g)).toHaveLength(n - 1);
    expect(t.match(/MDF-e Nº 4512 {3}SÉRIE 1/g)).toHaveLength(n - 1);
    expect(t).toContain('DOCUMENTOS FISCAIS VINCULADOS AO MANIFESTO (continuação)');
    expect(t).toContain('MUNICÍPIO DE DESCARGA: PARANAGUA (continuação)');

    const doXml = chavesDoXml(xml);
    expect(doXml).toHaveLength(2400);
    const noTexto = chavesNoTexto(t);
    const faltando = doXml.filter((chave) => !noTexto.has(chave));
    expect(faltando).toEqual([]);
    // as observações vêm depois de todos os documentos, na última página
    expect(t.lastIndexOf('OBSERVAÇÕES')).toBeGreaterThan(t.lastIndexOf('MUNICÍPIO DE DESCARGA: CASCAVEL'));
  });

  it('lista com mais de 5.000 chaves é cortada com aviso, em vez de gerar dezenas de páginas', async () => {
    const xml = mdfeExemplo({ municipiosDescarga: 3, documentosPorMunicipio: 1000 });
    const doXml = chavesDoXml(xml);
    expect(doXml).toHaveLength(6000);
    const pdf = await gerar(xml);
    const t = textoDoPdf(pdf);
    expect(t).toContain('Lista limitada a 5.000 documentos: demais documentos no XML (1.000 não listados).');
    const noTexto = chavesNoTexto(t);
    expect(doXml.filter((chave) => noTexto.has(chave))).toHaveLength(5000);
    expect(paginas(pdf)).toBeLessThan(25);
  });

  it('nota cancelada ganha a marca d\'água CANCELADO; denegada não se aplica ao MDF-e; homologação ganha SEM VALOR FISCAL e o aviso do Anexo II no lugar do protocolo', async () => {
    const cancelado = textoDoPdf(await gerar(mdfeExemplo(), { cancelada: true }));
    expect(cancelado).toContain('CANCELADO');
    expect(cancelado).not.toContain('SEM VALOR FISCAL');
    const denegado = textoDoPdf(await gerar(mdfeExemplo(), { denegada: true }));
    expect(denegado).not.toMatch(/DENEGAD/);
    expect(denegado).not.toContain('CANCELADO');

    const homolog = textoDoPdf(await gerar(mdfeExemplo({ homologacao: true })));
    expect(homolog).toContain(`EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO ${TRACO_LONGO} SEM VALOR FISCAL`);
    expect(homolog.match(/SEM VALOR FISCAL/g)).toHaveLength(2); // o aviso e a marca d'água
    expect(homolog).toContain('151260000012345'); // o protocolo continua no XML e no PDF
    const multiplas = textoDoPdf(await gerar(mdfeExemplo({ homologacao: true }), { cancelada: true }));
    expect(multiplas).toContain('CANCELADO');
  });

  it('emissão em contingência mostra o aviso em destaque no lugar do protocolo (item 2.5 do Anexo II)', async () => {
    const semProtocolo = textoDoPdf(await gerar(mdfeExemplo({ contingencia: true, semProtocolo: true })));
    expect(semProtocolo).toContain('EMISSÃO EM CONTINGÊNCIA. Obrigatória a autorização em 168 horas após esta emissão');
    expect(semProtocolo).toContain('(05/11/2026 08:42)'); // data e hora da emissão (o texto quebra em duas linhas)
    expect(semProtocolo).toContain('Contingência off-line');
    expect(semProtocolo).not.toContain('151260000012345');
    // autorizado depois: o protocolo aparece sob o aviso
    const autorizado = textoDoPdf(await gerar(mdfeExemplo({ contingencia: true })));
    expect(autorizado).toContain('EMISSÃO EM CONTINGÊNCIA.');
    expect(autorizado).toContain('151260000012345');
    expect(autorizado).not.toContain('HOMOLOGAÇÃO');
    // contingência em ambiente de homologação: os dois avisos do Anexo II (itens 2.5 e 2.6) e o protocolo
    const osDois = textoDoPdf(await gerar(mdfeExemplo({ contingencia: true, homologacao: true })));
    expect(osDois).toContain('EMISSÃO EM CONTINGÊNCIA.');
    expect(osDois).toContain(`EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO ${TRACO_LONGO} SEM VALOR FISCAL`);
    expect(osDois).toContain('151260000012345');
  });

  it('campos ausentes ficam em branco, sem quebrar nem escrever undefined', async () => {
    const pdf = await gerar(mdfeMinimo());
    expect(paginas(pdf)).toBe(1);
    const t = textoDoPdf(pdf);
    expect(t).toContain('CNPJ: 11.222.333/0001-81');
    expect(t).toContain(CHAVE_AGRUPADA);
    expect(t).toContain('CONTROLE DO FISCO');
    expect(t).toMatch(/MODELO\n58\nSÉRIE\nNÚMERO\nFL\nDATA E HORA DE EMISSÃO\nUF CARREG\.\nUF DESCARREG\.\nINÍCIO DA VIAGEM\n/);
    expect(t).toMatch(/Modal de Carga\nQTD\. CT-e\nQTD\. NF-e\nPESO TOTAL\nVALOR TOTAL DA CARGA \(R\$\)\nPROTOCOLO DE AUTORIZAÇÃO DE USO\n/);
    for (const ausente of ['VEÍCULO', 'CONDUTOR', 'SEGURO DA CARGA', 'PRODUTO PREDOMINANTE', 'LACRES', 'DOCUMENTOS FISCAIS', 'MUNICÍPIO DE DESCARGA']) expect(t, ausente).not.toContain(ausente);
    expect(t).toContain('OBSERVAÇÕES');
    expect(t).not.toMatch(/undefined|NaN|null|\[object/);

    // o modal rodoviário sem veículo, condutor, vale-pedágio e documentos também sai
    const semGrupos = mdfeExemplo({ semProtocolo: true })
      .replace(/<veicTracao>[\s\S]*<\/veicReboque>/, '')
      .replace(/<valePed>[\s\S]*?<\/valePed>/, '')
      .replace(/<infDoc>[\s\S]*?<\/infDoc>/, '')
      .replace(/<tot>[\s\S]*?<\/tot>/, '');
    const t2 = textoDoPdf(await gerar(semGrupos));
    expect(t2).toContain('Modal Rodoviário de Carga');
    expect(t2).not.toContain('VEÍCULO');
    expect(t2).not.toContain('VALE-PEDÁGIO');
    expect(t2).toMatch(/QTD\. CT-e\nQTD\. NF-e\nPESO TOTAL\nVALOR TOTAL DA CARGA \(R\$\)\n/); // sem tot nem infDoc, nada a mostrar
    expect(t2).not.toContain('151260000012345'); // só MDFe, sem protocolo
  });

  it('sem o grupo tot as quantidades vêm da contagem dos documentos; o peso e o valor ficam em branco', async () => {
    const t = textoDoPdf(await gerar(mdfeExemplo().replace(/<tot>[\s\S]*?<\/tot>/, '')));
    expect(t).toMatch(/QTD\. CT-e\n6\nQTD\. NF-e\n6\nPESO TOTAL\nVALOR TOTAL DA CARGA \(R\$\)\nPROTOCOLO/);
  });

  it('códigos de domínio conhecidos viram a descrição do Anexo I; os desconhecidos saem como vieram', async () => {
    const t = textoDoPdf(await gerar(mdfeExemplo()
      .replace('<tpEmit>1</tpEmit>', '<tpEmit>2</tpEmit>')
      .replace('<tpTransp>1</tpTransp>', '<tpTransp>2</tpTransp>')
      .replace('<tpCarga>01</tpCarga>', '<tpCarga>99</tpCarga>')
      .replace('<respSeg>1</respSeg>', '<respSeg>2</respSeg>')
      .replace('<indPag>1</indPag>', '<indPag>0</indPag>')
      .replace('<tpValePed>03</tpValePed>', '<tpValePed>07</tpValePed>')));
    expect(t).toContain('Transportador de carga própria');
    expect(t).toMatch(/TIPO DO TRANSPORTADOR\nTAC\n/);
    expect(t).toMatch(/TIPO DE CARGA\nPRODUTO\nNCM\nGTIN\n99\nSOJA EM GRAOS\n/); // tpCarga fora da tabela
    expect(t).toMatch(/Contratante do serviço de transporte -\s+11\.222\.333\/0001-81/); // a célula quebra em duas linhas
    expect(t).toContain('À vista');
    expect(t).toMatch(/202611050001235\n07\n/); // tpValePed fora da tabela
  });

  it('listas longas de lacres não cabem numa linha: quebram em quantas linhas forem precisas, sem perder nenhum', async () => {
    const t = textoDoPdf(await gerar(mdfeExemplo({ lacres: 400 })));
    expect(t.match(/MD5\d{3}/g)).toHaveLength(400); // lacres do manifesto
    expect(t.match(/RD7\d{3}/g)).toHaveLength(400); // lacres do veículo
    expect(t).toContain('MD5400');
    expect(t).toContain('RD7400');
    expect(t).toContain('AUTORIZADOS A BAIXAR O XML DO MDF-e');
  });

  it('milhares de lacres são cortados com aviso, em vez de gerar dezenas de páginas', async () => {
    const pdf = await gerar(mdfeExemplo({ lacres: 3000 }));
    expect(textoDoPdf(pdf)).toContain('demais lacres no XML');
    expect(paginas(pdf)).toBeLessThan(6);
  });

  it('emitente pessoa física mostra o CPF', async () => {
    const t = textoDoPdf(await gerar(mdfeExemplo().replace('<emit><CNPJ>11222333000181</CNPJ>', '<emit><CPF>52998224725</CPF>')));
    expect(t).toContain('CPF: 529.982.247-25   IE: 131000111');
  });

  it('modal aéreo mostra aeronave, voo e aeródromos', async () => {
    const t = textoDoPdf(await gerar(mdfeExemplo({ modal: 'aereo', municipiosDescarga: 1, tipoDocumentos: 'nfe' })));
    expect(t).toContain('Modal Aéreo de Carga');
    expect(t).toContain('AERONAVE / VOO / AERÓDROMO');
    expect(t).toMatch(/MARCA DE NACIONALIDADE\nPT\nMARCA DE MATRÍCULA\nMDF\nNÚMERO DO VOO\nAB1234\nDATA DO VOO\n06\/11\/2026\nAERÓDROMO DE EMBARQUE\nCGB\nAERÓDROMO DE DESTINO\nCWB\n/);
    expect(t).not.toContain('VEÍCULO');
    expect(t).toMatch(/QTD\. CT-e\n0\nQTD\. NF-e\n2\n/);
    expect(t).toContain('PESO TOTAL (KG)');
  });

  it('modal aquaviário mostra embarcação, terminais, comboio e o MDF-e referenciado; o peso vem em toneladas', async () => {
    const t = textoDoPdf(await gerar(mdfeExemplo({ modal: 'aquaviario', municipiosDescarga: 2, documentosPorMunicipio: 1 })));
    expect(t).toContain('Modal Aquaviário de Carga');
    expect(t).toContain('QTD. MDF-e');
    expect(t).toMatch(/PESO TOTAL \(TON\)\n52\.000,00\n/);
    expect(t).toContain('NAVIO GRANELEIRO EXEMPLO');
    expect(t).toContain('Cabotagem');
    expect(t).toContain('BRSSZ');
    expect(t).toContain('12345678 - TERMINAL DE GRAOS DO PORTO DE SANTOS');
    expect(t).toContain('87654321 - TERMINAL DE CONTEINERES DE PARANAGUA');
    expect(t).toContain('BAL001 - BALSA GRANELEIRA 1; BAL002 - BALSA'); // o texto do comboio quebra em duas linhas
    expect(t).toContain('GRANELEIRA 2');
    expect(t).toContain('MSKU1234567 (Container)');
    expect(t).toContain('QJK4B21 (Rodoviário tração)');
    expect(t).toMatch(/MDF-e\n5126 1111 2223 3300 0181 5800 1000 0007 7711 8498 7411\n/);
  });

  it('modal ferroviário mostra a composição do trem e todos os vagões, em várias páginas', async () => {
    const pdf = await gerar(mdfeExemplo({ modal: 'ferroviario', vagoes: 60, municipiosDescarga: 1, tipoDocumentos: 'nfe' }));
    const t = textoDoPdf(pdf);
    expect(paginas(pdf)).toBe(2);
    expect(t).toContain('Modal Ferroviário de Carga');
    expect(t).toMatch(/PREFIXO DO TREM\nR123\nDATA E HORA DE LIBERAÇÃO\n06\/11\/2026 06:30:00\n/);
    expect(t).toContain('INFORMAÇÕES DOS VAGÕES (continuação)');
    expect(t).toMatch(/001\nHFS\n00100200\nGRANELEIRO\n98,500\n97,250\n96,800\n/);
    expect(t).toMatch(/060\nHFS\n00101203\nGRANELEIRO\n/); // o último vagão
    expect(t).toMatch(/PESO TOTAL \(TON\)\n5\.808,00\n/);
  });

  it('MDF-e com a carga incluída depois explica por que não há documentos', async () => {
    const t = textoDoPdf(await gerar(mdfeExemplo({ cargaPosterior: true })));
    expect(t).toContain('MDF-e com carga incluída depois da emissão, por evento de inclusão de DF-e');
    expect(t).toContain('Carga incluída depois, por evento');
    expect(t).not.toContain('MUNICÍPIO DE DESCARGA');
  });

  it('textos longos quebram em linhas sem perder palavra nem ganhar reticências; o texto livre continua na página seguinte', async () => {
    const xml = mdfeExemplo({ infCpl: 'PALAVRA '.repeat(800) })
      .replace('AGRO EXPORTADORA SOL NASCENTE S/A', 'AGRO EXPORTADORA SOL NASCENTE DO CENTRO-OESTE BRASILEIRO IMPORTACAO E EXPORTACAO DE GRAOS S/A')
      .replace('JOSE CARLOS DA SILVA', 'JOSE CARLOS DA SILVA PEREIRA DE ALBUQUERQUE CAVALCANTI NETO FILHO DE SOUZA');
    const pdf = await gerar(xml);
    const t = textoDoPdf(pdf);
    expect(t.match(/PALAVRA/g)).toHaveLength(800);
    expect(paginas(pdf)).toBe(2);
    expect(t).toContain('OBSERVAÇÕES (continuação)');
    expect(t).toContain('AGRO EXPORTADORA SOL NASCENTE DO CENTRO-OESTE BRASILEIRO');
    expect(t).toContain('IMPORTACAO E EXPORTACAO DE GRAOS S/A');
    expect(t).toContain('JOSE CARLOS DA SILVA PEREIRA DE ALBUQUERQUE');
    expect(t).toContain('CAVALCANTI NETO FILHO DE SOUZA');
    expect(t).not.toContain('\u0085'); // nenhuma reticência
  });

  it('nome do emitente muito comprido quebra no cabeçalho e é cortado com reticências nas páginas de continuação', async () => {
    const nome = 'TRANSPORTADORA GRAOS DO NORTE E CENTRO-OESTE COMERCIO E SERVICOS DE TRANSPORTE RODOVIARIO DE CARGAS LTDA';
    const t = textoDoPdf(await gerar(mdfeExemplo({ municipiosDescarga: 3, documentosPorMunicipio: 400 }).replace('TRANSPORTADORA GRAOS DO NORTE LTDA', nome)));
    expect(t).toContain('TRANSPORTADORA GRAOS DO NORTE E CENTRO-OESTE COMERCIO E SERVICOS DE');
    expect(t).toContain('TRANSPORTE RODOVIARIO DE CARGAS LTDA');
    expect(t).toMatch(/TRANSPORTADORA GRAOS DO NORTE E CENTRO-OESTE COMERCIO E SERVICOS DE TRA\u0085/);
  });

  it('texto livre enorme é cortado com aviso, em vez de gerar dezenas de páginas', async () => {
    const pdf = await gerar(mdfeExemplo({ infCpl: 'PALAVRA '.repeat(6000) }));
    expect(paginas(pdf)).toBeLessThan(12);
    expect(textoDoPdf(pdf)).toContain('texto completo no XML');
  });

  it('caractere fora do alfabeto do PDF vira ponto de interrogação em vez de quebrar o arquivo', async () => {
    const xml = mdfeExemplo().replace('AGRO EXPORTADORA SOL NASCENTE S/A', 'AGRO EXPORTADORA ŐŰ S/A').replace('SORRISO</xMunCarrega>', 'SORRISO ★</xMunCarrega>');
    const t = textoDoPdf(await gerar(xml));
    expect(t).toContain('AGRO EXPORTADORA ?? S/A');
    expect(t).toContain('SORRISO ?; LUCAS DO RIO VERDE');
  });

  it('com a compressão normal (a de produção) o arquivo é válido e menor', async () => {
    const comprimido = await gerarDamdfe(mdfeExemplo());
    const puro = await gerar(mdfeExemplo());
    expect(comprimido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(comprimido.length).toBeLessThan(puro.length);
  });

  it('recusa o que não é MDF-e modelo 58, com erro em português que serve para a tela', async () => {
    await expect(gerarDamdfe(mdfeExemplo().replace('<mod>58</mod>', '<mod>57</mod>'))).rejects.toThrow(/modelo 58/);
    await expect(gerarDamdfe('<catalogo/>')).rejects.toBeInstanceOf(ErroLeituraDocumento);
    await expect(gerarDamdfe(nfeExemplo())).rejects.toThrow(/não é um MDF-e/);
    await expect(gerarDamdfe('')).rejects.toBeInstanceOf(ErroLeituraDocumento);
    await expect(gerarDamdfe(`<MDFe>${'x'.repeat(2 * 1024 * 1024 + 1)}</MDFe>`)).rejects.toBeInstanceOf(ErroLeituraDocumento);
  });
});
