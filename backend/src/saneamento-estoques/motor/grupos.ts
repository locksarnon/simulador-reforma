/**
 * Camada GRUPOS_FINALIDADE, parte de grupos (a finalidade é de outro agente). O grupo segue o uso que o próprio cliente já faz na base: só se indica com certeza alta
 * (palavra frequente e concentrada num único grupo). O motor PROPÕE a árvore em `proposta` e nunca redistribui sozinho.
 * Casos: nomes de grupo que são a mesma coisa escrita de formas diferentes (padronização), grupo genérico (com subgrupos sugeridos), grupos sobrepostos,
 * item deslocado (descrição incompatível com o grupo), item sem grupo e necessidade de novo grupo.
 */
import type { AnalisadorCamada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ev, justificar, montarResultado } from './base';
import { parametrosDe } from './contexto';
import { novoCaso } from './dependencias';
import { agrupar, GENERICOS, palavras, porTexto, STOP, txt } from './texto';

const PARTICIPACAO_MINIMA = 0.9; // uma palavra só indica um grupo se ao menos 90% dos itens com ela estão nele
const MAX_SUBGRUPOS = 8;

const grupoDe = (it: ItemTrabalho): string => txt(it.grupo);

/** Nome do grupo comparável: sem acento, caixa, pontuação, ligações e plural simples. */
const chaveGrupo = (nome: string): string => palavras(nome).filter((t) => !STOP.has(t)).map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)).sort().join(' ');

/** Palavras do item que valem como evidência de grupo: 4+ letras, sem números e sem termos genéricos. */
const tokensDoItem = (it: ItemTrabalho): string[] => [...new Set(palavras(it.descricao).filter((t) => t.length >= 4 && !/\d/.test(t) && !GENERICOS.has(t)))];

type Cluster = { token: string; itens: ItemTrabalho[] };
/** Agrupa itens pela palavra mais frequente, depois pela seguinte entre os que sobram (no máximo `max` grupos, cada um com ao menos `minimo` itens). */
function clusterPorPalavra(itens: ItemTrabalho[], tokens: Map<string, string[]>, minimo: number, max: number): Cluster[] {
  const porToken = new Map<string, ItemTrabalho[]>();
  for (const it of itens) for (const t of tokens.get(it.id) ?? []) { const a = porToken.get(t); if (a) a.push(it); else porToken.set(t, [it]); }
  const usados = new Set<string>(); const saida: Cluster[] = [];
  while (saida.length < max) {
    let melhor: string | null = null; let n = 0;
    for (const [t, l] of porToken) { const livres = l.reduce((k, i) => k + (usados.has(i.id) ? 0 : 1), 0); if (livres > n || (livres === n && melhor !== null && t < melhor)) { n = livres; melhor = t; } }
    if (!melhor || n < minimo) break;
    const itensDoCluster = porToken.get(melhor)!.filter((i) => !usados.has(i.id));
    for (const i of itensDoCluster) usados.add(i.id);
    saida.push({ token: melhor, itens: itensDoCluster });
  }
  return saida;
}

export class AnalisadorGrupos implements AnalisadorCamada {
  readonly camada = 'GRUPOS_FINALIDADE' as const;

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const par = parametrosDe(contexto);
    const minimo = Math.max(2, par.minimoItensEvidencia ?? 5);
    const casos: CasoProposto[] = [];
    const c = (x: Parameters<typeof novoCaso>[0]) => casos.push(novoCaso(x));
    const origem = ev('Origem', 'Coluna do grupo de itens e descrição da base importada');

    const porGrupo = agrupar(itens.filter((i) => grupoDe(i)), grupoDe);
    const semGrupo = itens.filter((i) => !grupoDe(i));
    const tokens = new Map<string, string[]>(itens.map((i) => [i.id, tokensDoItem(i)]));
    const tamanho = (g: string) => porGrupo.get(g)?.length ?? 0;

    // ── Palavra → distribuição por grupo (só itens agrupados) ──
    const dist = new Map<string, Map<string, number>>();
    for (const [g, l] of porGrupo) for (const it of l) for (const t of tokens.get(it.id)!) { const m = dist.get(t) ?? dist.set(t, new Map()).get(t)!; m.set(g, (m.get(g) ?? 0) + 1); }
    const decisiva = (t: string): { grupo: string; participacao: number; total: number } | null => {
      const m = dist.get(t); if (!m) return null;
      let total = 0; let top = ''; let n = 0;
      for (const [g, k] of m) { total += k; if (k > n || (k === n && g < top)) { n = k; top = g; } }
      return total >= minimo && n / total >= PARTICIPACAO_MINIMA ? { grupo: top, participacao: n / total, total } : null;
    };

    // ── 1) Nomes de grupo que são o mesmo grupo escrito de formas diferentes ──
    const porChave = agrupar([...porGrupo.keys()].sort(porTexto), chaveGrupo);
    for (const [chave, nomes] of porChave) {
      if (!chave || nomes.length < 2) continue;
      const dominante = [...nomes].sort((a, b) => tamanho(b) - tamanho(a) || porTexto(a, b))[0];
      const ids = nomes.flatMap((n) => porGrupo.get(n)!.map((i) => i.id));
      c({ camada: 'GRUPOS_FINALIDADE', tipo: 'GRUPO_NOME_VARIANTE', itens: ids, problema: `${nomes.length} grafias do mesmo grupo: ${nomes.map((n) => `"${n}"`).join(', ')}`,
        evidencia: [origem, ...nomes.map((n) => ev(n, `${tamanho(n)} itens`))], atual: { grupos: nomes.join(' | ') }, proposta: { grupo: dominante, arvore: dominante },
        justificativa: justificar('Escrever o mesmo grupo de formas diferentes fragmenta a finalidade e o tratamento por grupo.', `padronizar para "${dominante}" (a grafia mais usada); a proposta só vale depois de aprovada, nenhum item é movido sozinho.`) });
    }

    // ── 2) Grupo genérico: pelo nome, com subgrupos sugeridos pelas palavras mais frequentes dos itens ──
    const genericos = new Set<string>();
    for (const [nome, l] of porGrupo) {
      const ps = palavras(nome);
      if (ps.length && ps.every((t) => GENERICOS.has(t) || t === 'sem' || t === 'grupo' || t === 'classificacao')) genericos.add(nome);
      void l;
    }
    for (const nome of [...genericos].sort(porTexto)) {
      const l = porGrupo.get(nome)!;
      const subs = clusterPorPalavra(l, tokens, Math.max(10, minimo * 2), MAX_SUBGRUPOS);
      const arvore = subs.length ? subs.map((s) => `${nome} > ${s.token.toUpperCase()} (${s.itens.length})`).join('; ') : undefined;
      c({ camada: 'GRUPOS_FINALIDADE', tipo: 'GRUPO_GENERICO', itens: l.map((i) => i.id), problema: `Grupo genérico "${nome}" com ${l.length} itens: não diz o que o item é`,
        evidencia: [origem, ev('Itens no grupo', l.length), ...subs.map((s) => ev('Subgrupo sugerido', `${s.token.toUpperCase()} (${s.itens.length} itens)`))], atual: { grupo: nome },
        proposta: arvore ? { arvore, subgrupos: subs.length } : {},
        justificativa: justificar('Um grupo genérico mistura produtos de finalidade e tratamento diferentes; a finalidade é confirmada por grupo.', arvore ? 'avaliar os subgrupos sugeridos (palavras mais frequentes) e redistribuir os itens depois de aprovada a árvore.' : 'definir com o cliente os grupos reais; não há palavra frequente que sirva de base.') });
    }

    // ── 3) Grupos sobrepostos: nome contido no outro, ou vocabulário quase igual ──
    const grandes = [...porGrupo.keys()].filter((g) => tamanho(g) >= minimo * 4).sort((a, b) => tamanho(b) - tamanho(a) || porTexto(a, b)).slice(0, 400);
    const topPalavras = new Map<string, Set<string>>();
    for (const g of grandes) {
      const cont = new Map<string, number>(); for (const it of porGrupo.get(g)!) for (const t of tokens.get(it.id)!) cont.set(t, (cont.get(t) ?? 0) + 1);
      topPalavras.set(g, new Set([...cont.entries()].sort((a, b) => b[1] - a[1] || porTexto(a[0], b[0])).slice(0, 15).map(([t]) => t)));
    }
    const palChave = new Map(grandes.map((g) => [g, new Set(chaveGrupo(g).split(' ').filter(Boolean))] as const));
    for (let i = 0; i < grandes.length; i++) {
      for (let j = i + 1; j < grandes.length; j++) {
        const a = grandes[i]; const b = grandes[j];
        if (chaveGrupo(a) === chaveGrupo(b)) continue; // mesma grafia: caso de padronização
        const pa = palChave.get(a)!; const pb = palChave.get(b)!;
        const contido = pa.size > 0 && pb.size > 0 && ((pa.size < pb.size && [...pa].every((t) => pb.has(t))) || (pb.size < pa.size && [...pb].every((t) => pa.has(t))));
        const ta = topPalavras.get(a)!; const tb = topPalavras.get(b)!; const comum = [...ta].filter((t) => tb.has(t));
        const jac = comum.length / (ta.size + tb.size - comum.length || 1);
        if (!contido && !(ta.size >= 8 && tb.size >= 8 && jac >= 0.6)) continue;
        const [pai, filho] = contido ? (pa.size < pb.size ? [a, b] : [b, a]) : [a, b];
        c({ camada: 'GRUPOS_FINALIDADE', tipo: 'GRUPOS_SOBREPOSTOS', itens: [...porGrupo.get(a)!, ...porGrupo.get(b)!].map((x) => x.id), problema: `Grupos sobrepostos: "${a}" e "${b}"`,
          evidencia: [origem, ev(a, `${tamanho(a)} itens`), ev(b, `${tamanho(b)} itens`), ev('Critério', contido ? 'o nome de um está contido no nome do outro' : `vocabulário em comum (${Math.round(jac * 100)}% das palavras mais frequentes): ${comum.slice(0, 8).join(', ')}`)],
          atual: { grupos: `${a} | ${b}` }, proposta: { arvore: contido ? `${pai} > ${filho}` : `Unir "${a}" e "${b}" num só grupo, ou separar por critério` },
          justificativa: justificar('Grupos que se sobrepõem fazem o mesmo produto cair em lugares diferentes e impedem a finalidade por grupo.', 'decidir com o cliente entre unir os grupos ou subordinar um ao outro; nenhum item é movido sozinho.') });
      }
    }

    // ── 4) Item deslocado e item sem grupo (indicação por palavra concentrada num único grupo) ──
    for (const [g, l] of [...porGrupo.entries()].sort((x, y) => porTexto(x[0], y[0]))) {
      for (const it of l) {
        const dec = tokens.get(it.id)!.map((t) => ({ t, d: decisiva(t) })).filter((x) => x.d) as { t: string; d: NonNullable<ReturnType<typeof decisiva>> }[];
        if (!dec.length || dec.some((x) => x.d.grupo === g)) continue;
        const destinos = new Set(dec.map((x) => x.d.grupo));
        if (destinos.size !== 1) continue; // palavras apontam grupos diferentes: sem certeza
        const alvo = dec[0].d.grupo;
        c({ camada: 'GRUPOS_FINALIDADE', tipo: 'ITEM_DESLOCADO', itens: [it.id], problema: `A descrição combina com o grupo "${alvo}", não com "${g}"`,
          evidencia: [origem, ev('Descrição', it.descricao), ...dec.slice(0, 4).map((x) => ev(x.t.toUpperCase(), `${Math.round(x.d.participacao * 100)}% dos ${x.d.total} itens com a palavra estão em "${alvo}"`))], atual: { codigo: it.codigo, grupo: g },
          proposta: { grupo: alvo }, fundamento: `Uso do próprio cliente: palavra presente em ao menos ${minimo} itens e ao menos ${Math.round(PARTICIPACAO_MINIMA * 100)}% deles no mesmo grupo`,
          justificativa: justificar('Indicação pelo uso do cliente na própria base; não prova que o grupo atual esteja errado.', 'conferir o item e, se for o caso, aprovar a mudança de grupo (a finalidade herdada muda junto).') });
      }
    }
    const semProposta: ItemTrabalho[] = [];
    for (const it of semGrupo) {
      const dec = tokens.get(it.id)!.map((t) => ({ t, d: decisiva(t) })).filter((x) => x.d) as { t: string; d: NonNullable<ReturnType<typeof decisiva>> }[];
      const destinos = new Set(dec.map((x) => x.d.grupo));
      if (destinos.size === 1) {
        const alvo = dec[0].d.grupo;
        c({ camada: 'GRUPOS_FINALIDADE', tipo: 'ITEM_SEM_GRUPO', itens: [it.id], problema: `Item sem grupo; a descrição combina com "${alvo}"`,
          evidencia: [origem, ev('Descrição', it.descricao), ...dec.slice(0, 4).map((x) => ev(x.t.toUpperCase(), `${Math.round(x.d.participacao * 100)}% dos ${x.d.total} itens com a palavra estão em "${alvo}"`))], atual: { codigo: it.codigo, grupo: null }, proposta: { grupo: alvo },
          fundamento: `Uso do próprio cliente (participação mínima ${Math.round(PARTICIPACAO_MINIMA * 100)}%)`, justificativa: justificar('Indicação pelo uso do cliente na própria base.', 'conferir e aprovar o grupo sugerido.') });
      } else {
        semProposta.push(it);
        c({ camada: 'GRUPOS_FINALIDADE', tipo: 'ITEM_SEM_GRUPO', itens: [it.id], problema: 'Item sem grupo e sem indicação segura de grupo existente', evidencia: [origem, ev('Descrição', it.descricao)], atual: { codigo: it.codigo, grupo: null },
          justificativa: justificar('Sem grupo não há finalidade herdada nem tratamento por grupo.', 'definir o grupo com o cliente; o motor só indica quando a evidência é forte.') });
      }
    }

    // ── 5) Necessidade de novo grupo: itens sem grupo (e sem destino) que se agrupam por palavra ──
    for (const s of clusterPorPalavra(semProposta, tokens, Math.max(10, minimo * 2), MAX_SUBGRUPOS)) {
      c({ camada: 'GRUPOS_FINALIDADE', tipo: 'NECESSIDADE_NOVO_GRUPO', itens: s.itens.map((i) => i.id), problema: `${s.itens.length} itens sem grupo compartilham a palavra "${s.token.toUpperCase()}" e não cabem em grupo existente`,
        evidencia: [origem, ev('Palavra comum', s.token.toUpperCase()), ev('Itens', s.itens.length), ...s.itens.slice(0, 4).map((i) => ev(`Código ${i.codigo}`, i.descricao))], atual: { grupo: null }, proposta: { novoGrupo: s.token.toUpperCase(), arvore: s.token.toUpperCase() },
        justificativa: justificar('Um conjunto coerente de itens sem lugar na árvore atual pede grupo próprio.', 'avaliar o nome e a posição do novo grupo na árvore; os itens só são movidos depois de aprovado.') });
    }

    return montarResultado('GRUPOS_FINALIDADE', itens, casos);
  }
}
