import { describe, expect, it } from 'vitest';
import { paginas, retangulos, textoDoPdf } from './__fixtures__/pdf-teste';
import { A4, Pintor, marcaDagua, montarPdf, prefixoQueCabe } from './pintor';
import { matrizQr } from './qr';

describe('montarPdf', () => {
  it('entrega um PDF com o que o desenho pintou, e dá para voltar às páginas para escrever "FOLHA n/N"', async () => {
    const pdf = await montarPdf({ titulo: 'Teste', assunto: 'Assunto', semCompressao: true }, (doc) => {
      const p = new Pintor(doc);
      p.texto('PRIMEIRA', 20, 20, 200);
      doc.addPage();
      p.texto('SEGUNDA', 20, 20, 200);
      doc.switchToPage(0);
      p.texto('FOLHA 1/2', 20, 40, 200);
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(2);
    const t = textoDoPdf(pdf);
    for (const s of ['PRIMEIRA', 'SEGUNDA', 'FOLHA 1/2']) expect(t).toContain(s);
  });

  it('aceita página de outro tamanho (rolo de cupom) e repassa o erro de quem desenha', async () => {
    const pdf = await montarPdf({ titulo: 'Cupom', assunto: 'x', tamanho: [226.77, 600], semCompressao: true }, () => {});
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 226\.77 600\]/);
    await expect(montarPdf({ titulo: 't', assunto: 'a' }, () => { throw new Error('desenho falhou'); })).rejects.toThrow('desenho falhou');
  });
});

describe('Pintor', () => {
  it('desenha o QR Code com um retângulo por trecho contínuo de módulos escuros', async () => {
    const texto = 'https://exemplo.gov.br/consulta?chave=51261112345678000195650010000001231000000010';
    const matriz = matrizQr(texto);
    let trechos = 0;
    for (const linha of matriz) {
      let anterior = false;
      for (const escuro of linha) { if (escuro && !anterior) trechos += 1; anterior = escuro; }
    }
    const pdf = await montarPdf({ titulo: 'QR', assunto: 'x', semCompressao: true }, (doc) => { new Pintor(doc).qrCode(20, 20, 100, texto); });
    expect(retangulos(pdf)).toBe(trechos);
  });

  it('corta o texto com reticências quando passa da largura e mede a altura do texto quebrado', async () => {
    await montarPdf({ titulo: 't', assunto: 'a', semCompressao: true }, (doc) => {
      const p = new Pintor(doc);
      doc.font('Helvetica').fontSize(7);
      const curto = p.ajustar('ABC', 100);
      const longo = p.ajustar('PALAVRA '.repeat(40), 100);
      expect(curto).toBe('ABC');
      expect(longo.endsWith('…')).toBe(true);
      expect(doc.widthOfString(longo)).toBeLessThanOrEqual(100);
      expect(p.altura('PALAVRA '.repeat(40), 100, 7)).toBeGreaterThan(p.altura('PALAVRA', 100, 7) * 3);
    });
  });

  it('linhaDeCampos usa a margem e a largura do Pintor, e a última célula completa a linha', async () => {
    await montarPdf({ titulo: 't', assunto: 'a', semCompressao: true }, (doc) => {
      const estreito = new Pintor(doc, 5, 200);
      const chamadas: number[][] = [];
      estreito.campo = (x, _y, w) => { chamadas.push([x, w]); };
      estreito.linhaDeCampos(10, 20, [{ w: 60, rotulo: 'A', valor: '1' }, { w: 70, rotulo: 'B', valor: '2' }, { w: 1, rotulo: 'C', valor: '3' }]);
      expect(chamadas).toEqual([[5, 60], [65, 70], [135, 70]]);
    });
  });
});

describe('prefixoQueCabe e marcaDagua', () => {
  it('o prefixo cabe na altura e, havendo corte, termina numa palavra', async () => {
    await montarPdf({ titulo: 't', assunto: 'a', semCompressao: true }, (doc) => {
      const p = new Pintor(doc);
      const texto = 'PALAVRA '.repeat(300).trim();
      const corte = prefixoQueCabe(p, texto, 120, 40, 7);
      expect(corte).toBeGreaterThan(0);
      expect(corte).toBeLessThan(texto.length);
      expect(p.altura(texto.slice(0, corte), 120, 7)).toBeLessThanOrEqual(40);
      expect(texto.slice(0, corte).endsWith('PALAVRA')).toBe(true);
      expect(prefixoQueCabe(p, 'curto', 120, 40, 7)).toBe(5);
    });
  });

  it('a marca d\'água escreve o texto na página atual', async () => {
    const pdf = await montarPdf({ titulo: 't', assunto: 'a', semCompressao: true }, (doc) => { marcaDagua(doc, 'CANCELADA', '#c62828', A4); });
    expect(textoDoPdf(pdf)).toContain('CANCELADA');
  });
});
