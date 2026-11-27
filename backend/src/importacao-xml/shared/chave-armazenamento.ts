/**
 * Validação da chave de armazenamento (objeto no MinIO) dos XML enviados à
 * importação. O servidor nunca baixa uma URL vinda do cliente: o conteúdo é
 * lido direto do bucket pela chave, e a chave enviada pelo usuário tem de ser
 * exatamente a que POST /uploads devolveu para ele
 * (`${user.id}/${uuid}-${nome original}`, ver storage.controller.ts).
 */

export const MAX_CHAVE_ARMAZENAMENTO = 512;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f]/;

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Regras que valem para qualquer chave (também as do repositório de XML, que
 * chegam por dentro do servidor): texto, até 512 caracteres, sem barra
 * inicial, sem `..`, sem barra invertida, sem `://` e sem caractere de controle.
 */
export function chaveArmazenamentoSegura(chave: unknown): chave is string {
  return (
    typeof chave === 'string' &&
    chave.length > 0 &&
    chave.length <= MAX_CHAVE_ARMAZENAMENTO &&
    !chave.startsWith('/') &&
    !chave.includes('..') &&
    !chave.includes('\\') &&
    !chave.includes('://') &&
    !CONTROLE.test(chave)
  );
}

/** Expressão do formato gerado no upload para um usuário: `${userId}/${uuid}-${nome}` (nome sem barra nem controle). */
export function regexChaveDeUpload(userId: string): RegExp {
  return new RegExp(`^${escaparRegex(userId)}/${UUID}-[^/\\\\\\u0000-\\u001f\\u007f]+$`);
}

/** A chave foi gerada pelo upload deste usuário (formato exato e prefixo do próprio usuário)? */
export function chaveDeUploadDoUsuario(chave: unknown, userId: string): boolean {
  if (!userId || !chaveArmazenamentoSegura(chave)) return false;
  if (!chave.startsWith(`${userId}/`)) return false;
  return regexChaveDeUpload(userId).test(chave);
}

/** Chave antiga gravada a partir do file_url (antes desta correção): parece URL, não é chave do bucket. */
export function pareceUrl(chave: string | null | undefined): boolean {
  return !!chave && /^[a-z][a-z0-9+.-]*:/i.test(chave);
}
