import { deflateRawSync } from 'zlib';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { lerXmlsDoZip, ZipInvalidoError } from './zip-seguro';

const MB = 1024 * 1024;
const LIMITES = { maxEntradas: 5000, maxTotal: 200 * MB, maxPorArquivo: 2 * MB };

type EntradaManual = { nome: string; metodo: 0 | 8; dados: Buffer; declarado: number; flags?: number; localZerado?: boolean };

/** Monta um ZIP à mão, para declarar tamanhos que mentem e para simular o "data descriptor" (tamanhos zerados no cabeçalho local). */
function montarZip(entradas: EntradaManual[]): Buffer {
  const partes: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const flags = e.flags ?? 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(e.metodo, 8);
    local.writeUInt32LE(e.localZerado ? 0 : e.dados.length, 18); local.writeUInt32LE(e.localZerado ? 0 : e.declarado, 22);
    local.writeUInt16LE(nome.length, 26);
    partes.push(local, nome, e.dados);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(e.metodo, 10);
    central.writeUInt32LE(e.dados.length, 20); central.writeUInt32LE(e.declarado, 24); central.writeUInt16LE(nome.length, 28); central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);
    deslocamento += 30 + nome.length + e.dados.length;
  }
  const tamCentral = centrais.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(entradas.length, 8); fim.writeUInt16LE(entradas.length, 10); fim.writeUInt32LE(tamCentral, 12); fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...partes, ...centrais, fim]);
}

const xml = (n: number) => Buffer.from(`<nfeProc><n>${n}</n></nfeProc>`);

describe('lerXmlsDoZip', () => {
  it('lê os .xml de um ZIP comum, usa só o nome do arquivo e deixa de lado o que não é .xml', () => {
    const zip = Buffer.from(zipSync({
      'pasta/nfe-1.xml': new Uint8Array(xml(1)), 'pasta/sub/nfe-2.XML': new Uint8Array(xml(2)), 'leiame.txt': new TextEncoder().encode('oi'),
      '__MACOSX/pasta/._nfe-1.xml': new TextEncoder().encode('lixo'),
    }));
    const r = lerXmlsDoZip(zip, LIMITES);
    expect(r.entradas.map((e) => e.nome).sort()).toEqual(['nfe-1.xml', 'nfe-2.XML']);
    expect(r.entradas.find((e) => e.nome === 'nfe-1.xml')?.buffer.toString()).toBe('<nfeProc><n>1</n></nfeProc>');
    expect(r.ignorados).toEqual([]);
  });

  it('BOMBA: arquivo que declara 100 bytes mas infla para 64 MB é recusado com trabalho limitado (não infla tudo)', () => {
    const inflavel = deflateRawSync(Buffer.alloc(64 * MB));
    expect(inflavel.length).toBeLessThan(200_000);
    const zip = montarZip([{ nome: 'bomba.xml', metodo: 8, dados: inflavel, declarado: 100 }, { nome: 'ok.xml', metodo: 8, dados: deflateRawSync(xml(7)), declarado: xml(7).length }]);
    const t0 = Date.now();
    const r = lerXmlsDoZip(zip, LIMITES);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r.ignorados).toEqual([{ nome: 'bomba.xml', motivo: 'maior que 2 MB' }]);
    expect(r.entradas.map((e) => e.nome)).toEqual(['ok.xml']);
  });

  it('arquivo de exatamente 2 MB passa; 2 MB mais 1 byte não passa, qualquer que seja o tamanho declarado', () => {
    const exato = Buffer.alloc(2 * MB, 0x20);
    const passa = lerXmlsDoZip(montarZip([{ nome: 'a.xml', metodo: 8, dados: deflateRawSync(exato), declarado: 1 }]), LIMITES);
    expect(passa.entradas[0].buffer.length).toBe(2 * MB);
    const alem = lerXmlsDoZip(montarZip([{ nome: 'b.xml', metodo: 8, dados: deflateRawSync(Buffer.alloc(2 * MB + 1, 0x20)), declarado: 5 }]), LIMITES);
    expect(alem.entradas).toEqual([]);
    expect(alem.ignorados).toEqual([{ nome: 'b.xml', motivo: 'maior que 2 MB' }]);
  });

  it('arquivo guardado sem compressão acima do limite é recusado sem copiar', () => {
    const r = lerXmlsDoZip(montarZip([{ nome: 'grande.xml', metodo: 0, dados: Buffer.alloc(2 * MB + 10, 0x20), declarado: 2 * MB + 10 }]), LIMITES);
    expect(r.ignorados).toEqual([{ nome: 'grande.xml', motivo: 'maior que 2 MB' }]);
  });

  it('ZIP com data descriptor (cabeçalho local com tamanhos zerados, como os gerados em Java) lê pelos tamanhos do diretório central', () => {
    const dados = deflateRawSync(xml(9));
    const r = lerXmlsDoZip(montarZip([{ nome: 'nfe-9.xml', metodo: 8, dados, declarado: xml(9).length, flags: 0x808, localZerado: true }]), LIMITES);
    expect(r.entradas.map((e) => e.buffer.toString())).toEqual(['<nfeProc><n>9</n></nfeProc>']);
  });

  it('soma dos arquivos acima do total recusa o ZIP inteiro; mais arquivos que o limite também', () => {
    const quase = deflateRawSync(Buffer.alloc(MB, 0x20));
    const muitos = montarZip(Array.from({ length: 4 }, (_, i) => ({ nome: `a${i}.xml`, metodo: 8 as const, dados: quase, declarado: MB })));
    expect(() => lerXmlsDoZip(muitos, { ...LIMITES, maxTotal: 3 * MB })).toThrow(ZipInvalidoError);
    expect(lerXmlsDoZip(muitos, { ...LIMITES, maxTotal: 4 * MB }).entradas).toHaveLength(4);
    expect(() => lerXmlsDoZip(muitos, { ...LIMITES, maxEntradas: 3 })).toThrow(ZipInvalidoError);
    // só os .xml contam para o limite de arquivos
    const comTxt = Buffer.from(zipSync({ 'a.xml': new Uint8Array(xml(1)), 'b.txt': new Uint8Array(1), 'c.txt': new Uint8Array(1) }));
    expect(lerXmlsDoZip(comTxt, { ...LIMITES, maxEntradas: 1 }).entradas).toHaveLength(1);
  });

  it('arquivo protegido por senha, método de compressão desconhecido e deflate corrompido viram "ignorado" com o motivo, sem derrubar os outros', () => {
    const r = lerXmlsDoZip(montarZip([
      { nome: 'senha.xml', metodo: 8, dados: deflateRawSync(xml(1)), declarado: 10, flags: 0x801 },
      { nome: 'bzip.xml', metodo: 12 as never, dados: Buffer.from('x'), declarado: 1 },
      { nome: 'quebrado.xml', metodo: 8, dados: Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff]), declarado: 10 },
      { nome: 'bom.xml', metodo: 8, dados: deflateRawSync(xml(2)), declarado: xml(2).length },
    ]), LIMITES);
    expect(r.entradas.map((e) => e.nome)).toEqual(['bom.xml']);
    expect(r.ignorados.map((i) => [i.nome, i.motivo])).toEqual([
      ['senha.xml', 'arquivo protegido por senha dentro do ZIP'],
      ['bzip.xml', 'método de compressão do ZIP não suportado'],
      ['quebrado.xml', 'arquivo corrompido dentro do ZIP'],
    ]);
  });

  it('lixo, ZIP truncado e ZIP64 são recusados', () => {
    expect(() => lerXmlsDoZip(Buffer.from('isto não é um zip'), LIMITES)).toThrow(ZipInvalidoError);
    expect(() => lerXmlsDoZip(Buffer.alloc(10), LIMITES)).toThrow(ZipInvalidoError);
    const bom = Buffer.from(zipSync({ 'a.xml': new Uint8Array(xml(1)) }));
    expect(() => lerXmlsDoZip(bom.subarray(0, bom.length - 30), LIMITES)).toThrow(ZipInvalidoError);
    const zip64 = Buffer.from(bom);
    zip64.writeUInt16LE(0xffff, zip64.length - 22 + 10);
    expect(() => lerXmlsDoZip(zip64, LIMITES)).toThrow(/ZIP64/);
  });
});
