/**
 * Hash determinístico (djb2) de um snapshot de simulação — não é
 * criptográfico, só serve para detectar se duas rodadas usaram exatamente
 * a mesma entrada (mesmas operações + mesmos parâmetros).
 */
export function hashSnapshot(obj) {
  const s = JSON.stringify(obj);
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
