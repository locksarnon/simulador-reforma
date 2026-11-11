/**
 * QR Code (ISO/IEC 18004) para os documentos auxiliares (DANFE NFC-e, DANFSe, DACTE e DAMDFE).
 * Texto em UTF-8 e correção de erros nível M, que é o que o manual do DANFE NFC-e manda usar (item 4.7).
 */
import qrcode from 'qrcode-generator';

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

export type NivelQr = 'L' | 'M' | 'Q' | 'H';

/** Matriz do QR Code do texto: `true` é módulo escuro. A versão (tamanho) é a menor que comporta o texto. */
export function matrizQr(texto: string, nivel: NivelQr = 'M'): boolean[][] {
  const qr = qrcode(0, nivel);
  qr.addData(texto, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const matriz: boolean[][] = [];
  for (let linha = 0; linha < n; linha += 1) {
    const celulas: boolean[] = [];
    for (let coluna = 0; coluna < n; coluna += 1) celulas.push(qr.isDark(linha, coluna));
    matriz.push(celulas);
  }
  return matriz;
}
