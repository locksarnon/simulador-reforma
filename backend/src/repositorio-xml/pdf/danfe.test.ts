import { describe, expect, it } from 'vitest';
import { gerarDanfe } from './danfe';
import { CHAVE_EXEMPLO, nfeExemplo } from './__fixtures__/nfe-exemplo';
import { paginas, textoDoPdf } from './__fixtures__/pdf-teste';
import { ErroLeituraNfe } from './nfe-leitor';

const gerar = (xml: string, opcoes = {}) => gerarDanfe(xml, { semCompressao: true, ...opcoes });

describe('gerarDanfe', () => {
  it('uma NF-e pequena vira um PDF de uma página com os blocos e os dados do XML', async () => {
    const pdf = await gerar(nfeExemplo());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
    const t = textoDoPdf(pdf);
    for (const bloco of ['DANFE', 'DESTINATÁRIO / REMETENTE', 'FATURA / DUPLICATAS', 'CÁLCULO DO IMPOSTO', 'TRANSPORTADOR / VOLUMES TRANSPORTADOS', 'DADOS DOS PRODUTOS / SERVIÇOS', 'DADOS ADICIONAIS', 'RESERVADO AO FISCO', 'FOLHA 1/1']) {
      expect(t, bloco).toContain(bloco);
    }
    expect(t).toContain('5126 1112 3456 7800 0195 5500 1000 0001 2310 0000 0010'); // chave em grupos de 4
    expect(t).toContain('Nº 000.000.123');
    expect(t).toContain('FORNECEDOR AGRO COMERCIO E REPRESENTACOES LTDA');
    expect(t).toContain('CLIENTE EXEMPLO AGROPECUARIA S/A');
    expect(t).toContain('12.345.678/0001-95');
    expect(t).toContain('98.765.432/0001-10');
    expect(t).toContain('351260000000001 - 05/11/2026 10:16:30');
    expect(t).toContain('VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS');
    expect(t).toContain('SOJA EM GRAOS CLASSIFICADA');
    expect(t).toContain('Lote 2026/11-A'); // informação adicional do item sob a descrição
    expect(t).toContain('1.126,13'); // valor do primeiro item em pt-BR
    expect(t).toContain('3.906,26'); // valor total da nota
    expect(t).toContain('TRANSPORTES RAPIDOS DO CENTRO-OESTE LTDA');
    expect(t).toContain('Pedido 4567');
    expect(t).not.toContain('CANCELADA');
    expect(t).not.toContain('SEM VALOR FISCAL');
  });

  it('muitos itens viram várias páginas: todos os itens aparecem, cada página tem o cabeçalho e a folha n/N', async () => {
    const pdf = await gerar(nfeExemplo({ itens: 70 }));
    const n = paginas(pdf);
    expect(n).toBeGreaterThanOrEqual(3);
    const t = textoDoPdf(pdf);
    for (let i = 1; i <= n; i += 1) expect(t, `folha ${i}`).toContain(`FOLHA ${i}/${n}`);
    for (let i = 1; i <= 70; i += 1) expect(t, `item ${i}`).toContain(`P${String(i).padStart(4, '0')}`);
    expect(t.match(/DANFE - continuação dos itens/g)).toHaveLength(n - 1);
    expect(t.match(/DADOS DOS PRODUTOS \/ SERVIÇOS \(continuação\)/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('informações complementares longas continuam na página seguinte sem perder palavra', async () => {
    const pdf = await gerar(nfeExemplo({ itens: 40, infCpl: 'PALAVRA '.repeat(800) }));
    const t = textoDoPdf(pdf);
    expect(t.match(/PALAVRA/g)).toHaveLength(800);
    expect(t).toContain('DADOS ADICIONAIS');
  });

  it('texto livre enorme é cortado com aviso, em vez de gerar dezenas de páginas', async () => {
    const pdf = await gerar(nfeExemplo({ itens: 2, infCpl: 'PALAVRA '.repeat(6000) }));
    expect(paginas(pdf)).toBeLessThan(8);
    expect(textoDoPdf(pdf)).toContain('texto completo no XML');
  });

  it('nota cancelada, denegada e em homologação ganham marca d\'água; a de homologação ainda avisa nas informações complementares', async () => {
    expect(textoDoPdf(await gerar(nfeExemplo(), { cancelada: true }))).toContain('CANCELADA');
    expect(textoDoPdf(await gerar(nfeExemplo(), { denegada: true }))).toContain('DENEGADA');
    const homolog = textoDoPdf(await gerar(nfeExemplo({ homologacao: true })));
    expect(homolog).toContain('SEM VALOR FISCAL');
    expect(homolog).toContain('NF-e emitida em ambiente de homologação - sem valor fiscal.');
  });

  it('sem destinatário, sem protocolo e sem duplicatas o PDF sai do mesmo jeito (campos em branco)', async () => {
    const pdf = await gerar(nfeExemplo({ semDestinatario: true, semProtocolo: true, duplicatas: 0 }));
    const t = textoDoPdf(pdf);
    expect(paginas(pdf)).toBe(1);
    expect(t).toContain('PROTOCOLO DE AUTORIZAÇÃO DE USO');
    expect(t).not.toContain('FATURA / DUPLICATAS');
    expect(t).not.toContain('351260000000001');
  });

  it('o bloco do ISSQN aparece quando a nota traz serviços', async () => {
    const t = textoDoPdf(await gerar(nfeExemplo({ servicos: true })));
    expect(t).toContain('CÁLCULO DO ISSQN');
    expect(t).toContain('VALOR DO ISSQN');
  });

  it('caractere fora do alfabeto do PDF vira ponto de interrogação em vez de quebrar o arquivo', async () => {
    const xml = nfeExemplo().replace('CLIENTE EXEMPLO AGROPECUARIA S/A', 'CLIENTE EXEMPLO ŐŰ S/A');
    const t = textoDoPdf(await gerar(xml));
    expect(t).toContain('CLIENTE EXEMPLO ?? S/A');
  });

  it('com a compressão normal (a de produção) o arquivo é válido e menor', async () => {
    const comprimido = await gerarDanfe(nfeExemplo());
    const puro = await gerar(nfeExemplo());
    expect(comprimido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(comprimido.length).toBeLessThan(puro.length);
  });

  it('recusa o que não é NF-e modelo 55', async () => {
    await expect(gerarDanfe(nfeExemplo().replace('<mod>55</mod>', '<mod>65</mod>'))).rejects.toThrow(/modelo 55/);
    await expect(gerarDanfe('<catalogo/>')).rejects.toBeInstanceOf(ErroLeituraNfe);
    expect(CHAVE_EXEMPLO).toHaveLength(44);
  });
});
