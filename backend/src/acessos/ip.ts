/** IP de quem chamou: o primeiro do x-forwarded-for (o proxy da VPS o preenche) ou o da conexão. */
export const ipDoCliente = (req: { headers: Record<string, unknown>; ip?: string }) => String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim();

/** Endereço IP como o servidor enxerga: tira a lista do proxy (x-forwarded-for), o prefixo IPv4-em-IPv6 e trata o loopback IPv6 como IPv4. */
export function normalizarIp(ip?: string | null): string {
  let s = String(ip ?? '').split(',')[0].trim().toLowerCase();
  if (s.startsWith('::ffff:') && s.includes('.')) s = s.slice(7);
  if (s === '::1') s = '127.0.0.1';
  return s;
}

function ipv4ParaNumero(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const partes = m.slice(1).map(Number);
  if (partes.some((p) => p > 255)) return null;
  return ((partes[0] << 24) >>> 0) + (partes[1] << 16) + (partes[2] << 8) + partes[3];
}

/** Uma faixa vale se for um IPv4 (com ou sem /0 a /32) ou um IPv6 literal (sem máscara). */
export function faixaValida(faixa: string): boolean {
  const f = String(faixa ?? '').trim();
  const [base, mascara, resto] = f.split('/');
  if (resto !== undefined) return false;
  if (ipv4ParaNumero(base) !== null) return mascara === undefined || (/^\d{1,2}$/.test(mascara) && Number(mascara) <= 32);
  return mascara === undefined && base.includes(':') && /^[0-9a-f:]+$/i.test(base) && base.length >= 2;
}

/** O IP está na faixa? IPv4 aceita máscara CIDR; os demais casos comparam o endereço inteiro. */
export function ipNaFaixa(ip: string, faixa: string): boolean {
  const alvo = normalizarIp(ip);
  const f = String(faixa ?? '').trim().toLowerCase();
  if (!alvo || !f) return false;
  const [base, mascara] = f.split('/');
  if (mascara === undefined) return normalizarIp(base) === alvo;
  const a = ipv4ParaNumero(alvo);
  const b = ipv4ParaNumero(base);
  if (a === null || b === null) return false;
  const bits = Number(mascara);
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}
