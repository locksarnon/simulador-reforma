import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Larguras das colunas das tabelas (como no Excel).
 * - Por padrão cada coluna fica do tamanho do conteúdo: a tabela mede, depois de desenhada, o maior entre o título e as células
 *   visíveis (`definirAuto`), entre LARGURA_MIN e LARGURA_AUTO_MAX. Antes de medir (e nos testes, sem navegador) vale a largura
 *   configurada da coluna.
 * - A largura que a pessoa arrasta (ou ajusta pelo teclado) vence a medida e fica guardada neste navegador, por tabela
 *   (`intax-larguras:<id>`), entre LARGURA_MIN e LARGURA_MAX.
 * - Remedir (`definirAuto`) a cada mudança de dados com `crescer`: a coluna só aumenta; "Restaurar larguras" zera e mede de novo.
 * - Clique duplo na alça = volta aquela coluna ao tamanho do conteúdo (apaga a largura escolhida); "Restaurar larguras" volta todas.
 * Todo acesso ao armazenamento fica em try/catch: sem ele (navegação privada, bloqueio), vale só nesta visita.
 */
export const LARGURA_MIN = 48;
export const LARGURA_MAX = 800;
export const LARGURA_AUTO_MAX = 480;
export const PASSO_TECLADO = 10;

export const limitarLargura = (v, max = LARGURA_MAX) => {
  const n = Number(v);
  return Math.round(Math.min(max, Math.max(LARGURA_MIN, Number.isFinite(n) ? n : LARGURA_MIN)));
};

export const chaveDasLarguras = (id) => `intax-larguras:${id}`;

/** Chave estável para tabelas sem `id`: o nome da tabela e as colunas. */
export const idDaTabela = (id, nome, chaves) => id || `auto:${typeof nome === "string" ? nome : ""}:${(chaves || []).join(",")}`;

function armazenamento() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Larguras escolhidas pela pessoa para a tabela (só números válidos, já limitados). */
export function lerLarguras(id) {
  if (!id) return {};
  try {
    const bruto = JSON.parse(armazenamento()?.getItem(chaveDasLarguras(id)) || "null");
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
    const saida = {};
    for (const [k, v] of Object.entries(bruto)) if (typeof v === "number" && Number.isFinite(v)) saida[k] = limitarLargura(v);
    return saida;
  } catch { return {}; }
}

/** Guarda as larguras; sem nenhuma, apaga a chave. Nunca lança. */
export function gravarLarguras(id, larguras) {
  if (!id) return;
  try {
    const s = armazenamento();
    if (!s) return;
    if (!larguras || Object.keys(larguras).length === 0) s.removeItem(chaveDasLarguras(id));
    else s.setItem(chaveDasLarguras(id), JSON.stringify(larguras));
  } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** Seta esquerda/direita: 10 px a menos/a mais; outras teclas: null. */
export function larguraPorTecla(atual, tecla) {
  if (tecla === "ArrowLeft") return limitarLargura(atual - PASSO_TECLADO);
  if (tecla === "ArrowRight") return limitarLargura(atual + PASSO_TECLADO);
  return null;
}

const iguais = (a, b) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** Efeito de layout no navegador (mede antes de pintar, sem pulo); no servidor, efeito comum (sem aviso). */
export const useEfeitoDeLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useLargurasColunas(id) {
  const [estado, setEstado] = useState(() => ({ id, usuario: lerLarguras(id), auto: {}, versao: 0 }));
  let atual = estado;
  if (estado.id !== id) { atual = { id, usuario: lerLarguras(id), auto: {}, versao: estado.versao + 1 }; setEstado(atual); }
  const ref = useRef(atual);
  ref.current = atual;

  const definir = useCallback((chave, px, { gravar = true } = {}) => {
    const e = ref.current;
    const usuario = { ...e.usuario, [chave]: limitarLargura(px) };
    ref.current = { ...e, usuario };
    setEstado(ref.current);
    if (gravar) gravarLarguras(e.id, usuario);
  }, []);
  const gravar = useCallback(() => gravarLarguras(ref.current.id, ref.current.usuario), []);
  /** Volta a coluna ao tamanho do conteúdo. */
  const autoAjustar = useCallback((chave) => {
    const e = ref.current;
    if (!(chave in e.usuario)) return;
    const usuario = { ...e.usuario };
    delete usuario[chave];
    ref.current = { ...e, usuario };
    setEstado(ref.current);
    gravarLarguras(e.id, usuario);
  }, []);
  const restaurar = useCallback(() => {
    ref.current = { ...ref.current, usuario: {}, auto: {}, versao: ref.current.versao + 1 };
    setEstado(ref.current);
    gravarLarguras(ref.current.id, {});
  }, []);
  /** Larguras medidas do conteúdo (não são guardadas). `crescer`: só aumenta as já medidas (a coluna não encolhe ao filtrar ou paginar). */
  const definirAuto = useCallback((mapa, { crescer = false } = {}) => {
    const auto = crescer ? { ...ref.current.auto } : {};
    for (const [k, v] of Object.entries(mapa || {})) if (v > 0) auto[k] = Math.max(crescer ? auto[k] || 0 : 0, limitarLargura(v, LARGURA_AUTO_MAX));
    if (iguais(auto, ref.current.auto)) return;
    ref.current = { ...ref.current, auto };
    setEstado(ref.current);
  }, []);

  const larguraDe = (chave, padrao) => atual.usuario[chave] ?? atual.auto[chave] ?? padrao;
  return {
    larguraDe, definir, gravar, autoAjustar, restaurar, definirAuto,
    usuario: atual.usuario, auto: atual.auto, versao: atual.versao,
    escolhida: (chave) => chave in atual.usuario,
    personalizadas: Object.keys(atual.usuario).length > 0,
    medidas: Object.keys(atual.auto).length > 0,
  };
}

/**
 * Mede a largura natural (conteúdo sem corte) de um conjunto de células de div: põe cada uma em max-content por um instante,
 * lê e devolve como estava. Só em eventos e efeitos (nunca durante o desenho).
 */
export function medirLarguraNatural(elementos) {
  const lista = Array.from(elementos || []);
  const antes = lista.map((el) => [el.style.width, el.style.flex, el.style.minWidth, el.style.maxWidth]);
  for (const el of lista) { el.style.width = "max-content"; el.style.flex = "0 0 auto"; el.style.minWidth = "0"; el.style.maxWidth = "none"; }
  let maior = 0;
  for (const el of lista) maior = Math.max(maior, Math.ceil(el.getBoundingClientRect().width));
  lista.forEach((el, i) => { [el.style.width, el.style.flex, el.style.minWidth, el.style.maxWidth] = antes[i]; });
  return maior;
}

/** Mede, de uma vez, a largura natural de cada coluna (células com `data-coluna`) dentro de `raiz`. */
export function medirColunasNaturais(raiz, { limiteLinhas = 200 } = {}) {
  if (!raiz || !raiz.getBoundingClientRect || raiz.getBoundingClientRect().width === 0) return null;
  const porChave = new Map();
  const todas = raiz.querySelectorAll("[data-coluna]");
  const contagem = new Map();
  for (const el of todas) {
    const k = el.getAttribute("data-coluna");
    const n = contagem.get(k) || 0;
    if (n > limiteLinhas) continue;
    contagem.set(k, n + 1);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(el);
  }
  const lista = [...porChave.values()].flat();
  const antes = lista.map((el) => [el.style.width, el.style.flex, el.style.minWidth, el.style.maxWidth]);
  for (const el of lista) { el.style.width = "max-content"; el.style.flex = "0 0 auto"; el.style.minWidth = "0"; el.style.maxWidth = "none"; }
  const saida = {};
  for (const [k, els] of porChave) saida[k] = Math.max(...els.map((el) => Math.ceil(el.getBoundingClientRect().width)));
  lista.forEach((el, i) => { [el.style.width, el.style.flex, el.style.minWidth, el.style.maxWidth] = antes[i]; });
  return saida;
}

/** Remede quando a área muda de tamanho (por exemplo, a aba que estava escondida aparece). */
export function useAoRedimensionar(elemento, aoMudar) {
  const cb = useRef(aoMudar);
  cb.current = aoMudar;
  useEffect(() => {
    if (!elemento || typeof ResizeObserver === "undefined") return undefined;
    let largura = elemento.getBoundingClientRect().width;
    const o = new ResizeObserver(() => {
      const w = elemento.getBoundingClientRect().width;
      if ((largura === 0) !== (w === 0)) cb.current();
      largura = w;
    });
    o.observe(elemento);
    return () => o.disconnect();
  }, [elemento]);
}
