import { useId, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Aviso, botaoSecundario, campoCls, Rotulo, Tag } from "../comuns";
import {
  ABRANGENCIA_CONVERSAO, alternarNaLista, APLICABILIDADE, ATRIBUTOS_SUGERIDOS, AVISO_CONVERSAO_DESCONHECIDA, CAMPO_ITEM, CAPITALIZACOES, CENARIOS_FISCAIS, COMPONENTES_NOME,
  CRITERIO_ESTOQUE, lerExemplos, lerFator, lerLimite, mover, moverPara, novaConversao, novaLinhaLimite, novoAtributo, ONDE_ATRIBUTO, ORIGEM_LIMITE, previaEstrutura,
  resumoExemplos, resumoLimites, ROTULO_COMPONENTE, rotuloAtributo, SEPARADORES, TEXTO_AMBIGUO, TEXTO_AUSENTE, TRATAMENTO_EXCESSO, UNIDADES_COMUNS,
} from "./logica";

const botaoIcone = "inline-flex h-7 w-7 items-center justify-center border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30";
/** Realce verde do InTAX ao passar o mouse (o mesmo das linhas da tabela padrão). */
export const realceVerde = "transition-[background-color,box-shadow] hover:bg-gradient-to-r hover:from-primary/30 hover:via-primary/12 hover:to-transparent hover:shadow-[inset_3px_0_0_0_hsl(var(--primary))]";

function Secao({ titulo, children, dica }) {
  return (
    <fieldset className="space-y-2 border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
      {children}
    </fieldset>
  );
}

/** Lista de marcar com filtro digitável (grupos, unidades). `extra` permite acrescentar um valor que não está na lista. */
export function SeletorMultiplo({ rotulo, opcoes, marcados, aoMudar, desabilitado, rotuloDe = (o) => o, permitirOutro = false, alturaMax = "max-h-48" }) {
  const id = useId();
  const [filtro, setFiltro] = useState("");
  const [outro, setOutro] = useState("");
  const todas = [...new Set([...(opcoes || []), ...(marcados || [])])];
  const f = filtro.trim().toLocaleLowerCase("pt-BR");
  const visiveis = f ? todas.filter((o) => String(rotuloDe(o)).toLocaleLowerCase("pt-BR").includes(f)) : todas;
  const acrescentar = () => { const v = outro.trim().toUpperCase(); if (v && !marcados.includes(v)) aoMudar([...marcados, v]); setOutro(""); };
  return (
    <div role="group" aria-labelledby={`${id}-r`} className="space-y-1">
      <Rotulo><span id={`${id}-r`}>{rotulo}</span> <span className="text-muted-foreground">({marcados.length} marcado{marcados.length === 1 ? "" : "s"})</span></Rotulo>
      {todas.length > 8 && <input className={campoCls} placeholder="Filtrar a lista" aria-label={`Filtrar: ${rotulo}`} value={filtro} onChange={(e) => setFiltro(e.target.value)} />}
      <ul className={`${alturaMax} overflow-y-auto border border-border bg-background p-1`}>
        {visiveis.length === 0 && <li className="px-1 py-0.5 text-xs text-muted-foreground">Nada na lista.</li>}
        {visiveis.map((o) => (
          <li key={o} className={`px-1 py-0.5 text-sm ${realceVerde}`}>
            <label className="flex items-center gap-2"><input type="checkbox" checked={marcados.includes(o)} disabled={desabilitado} onChange={() => aoMudar(alternarNaLista(marcados, o))} />{rotuloDe(o)}</label>
          </li>
        ))}
      </ul>
      {permitirOutro && !desabilitado && (
        <div className="flex gap-1">
          <input className={`${campoCls} w-32`} placeholder="Outra" aria-label={`Acrescentar a ${rotulo}`} value={outro} onChange={(e) => setOutro(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); acrescentar(); } }} />
          <button type="button" className={botaoSecundario} disabled={!outro.trim()} onClick={acrescentar}><Plus className="h-4 w-4" aria-hidden="true" />Acrescentar</button>
        </div>
      )}
    </div>
  );
}

/** Tabela de linhas editáveis (abreviações, termos, conversões…): uma linha por registro, botão remover e "Acrescentar linha". */
function TabelaLinhas({ rotulo, colunas, linhas, aoMudar, nova, desabilitado, vazio }) {
  const set = (i, k, v) => aoMudar(linhas.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={rotulo}>
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">{colunas.map((c) => <th key={c.chave} scope="col" className="py-1 pr-2 font-normal">{c.rotulo}</th>)}<th scope="col"><span className="sr-only">Remover</span></th></tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={colunas.length + 1} className="py-1.5 text-xs text-muted-foreground">{vazio}</td></tr>}
            {linhas.map((l, i) => (
              <tr key={i} className="border-b border-border/60 align-top">
                {colunas.map((c) => (
                  <td key={c.chave} className="py-1 pr-2">{c.render ? c.render(l, (v) => set(i, c.chave, v), i) : (
                    <input className={campoCls} disabled={desabilitado} aria-label={`${c.rotulo}, linha ${i + 1}`} value={l[c.chave] ?? ""} onChange={(e) => set(i, c.chave, e.target.value)} placeholder={c.placeholder} />
                  )}</td>
                ))}
                <td className="py-1">{!desabilitado && <button type="button" className={botaoIcone} aria-label={`Remover a linha ${i + 1} de ${rotulo}`} onClick={() => aoMudar(linhas.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!desabilitado && <button type="button" className={botaoSecundario} onClick={() => aoMudar([...linhas, nova()])}><Plus className="h-4 w-4" aria-hidden="true" />Acrescentar linha</button>}
    </div>
  );
}

// ── A. Padrão de nomes ───────────────────────────────────────────────────────

/** Componentes da descrição: ordem (arrastar ou setas), incluir/excluir e marca de obrigatório. */
function Componentes({ valor, aoMudar, desabilitado }) {
  const [arrastando, setArrastando] = useState(null);
  const fora = COMPONENTES_NOME.filter((c) => !valor.componentes.includes(c));
  const setComp = (componentes) => aoMudar({ ...valor, componentes, obrigatorios: valor.obrigatorios.filter((o) => componentes.includes(o)) });
  return (
    <div className="space-y-2">
      <ol className="space-y-1" aria-label="Ordem dos componentes na descrição">
        {valor.componentes.map((c, i) => (
          <li key={c} draggable={!desabilitado} onDragStart={() => setArrastando(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (arrastando !== null) setComp(moverPara(valor.componentes, arrastando, i)); setArrastando(null); }}
            className={`flex flex-wrap items-center gap-2 border border-border bg-background px-2 py-1 text-sm ${realceVerde}`}>
            {!desabilitado && <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden="true" />}
            <span className="w-6 tabular-nums text-muted-foreground">{i + 1}.</span>
            <span className="min-w-[10rem] flex-1">{ROTULO_COMPONENTE[c]}</span>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={desabilitado} checked={valor.obrigatorios.includes(c)} onChange={() => aoMudar({ ...valor, obrigatorios: alternarNaLista(valor.obrigatorios, c) })} />Obrigatório</label>
            {!desabilitado && <>
              <button type="button" className={botaoIcone} disabled={i === 0} aria-label={`Subir ${ROTULO_COMPONENTE[c]}`} onClick={() => setComp(mover(valor.componentes, i, -1))}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></button>
              <button type="button" className={botaoIcone} disabled={i === valor.componentes.length - 1} aria-label={`Descer ${ROTULO_COMPONENTE[c]}`} onClick={() => setComp(mover(valor.componentes, i, 1))}><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
              <button type="button" className={botaoIcone} aria-label={`Tirar ${ROTULO_COMPONENTE[c]} da estrutura`} onClick={() => setComp(valor.componentes.filter((x) => x !== c))}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </>}
          </li>
        ))}
      </ol>
      {!desabilitado && fora.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs"><span className="text-muted-foreground">Acrescentar:</span>
          {fora.map((c) => <button key={c} type="button" className={`${botaoSecundario} px-2 py-0.5 text-xs`} onClick={() => setComp([...valor.componentes, c])}><Plus className="h-3 w-3" aria-hidden="true" />{ROTULO_COMPONENTE[c]}</button>)}
        </div>
      )}
    </div>
  );
}

/** Exemplos com itens reais do grupo (só depois de salvar a regra). `consulta` = useQuery da rota exemplos. */
export function ExemplosReais({ consulta, salva }) {
  if (!salva) return <p className="text-xs text-muted-foreground">Salve o rascunho para ver exemplos com itens reais dos grupos.</p>;
  if (!consulta) return null;
  if (consulta.isError) return <p className="text-xs text-muted-foreground" role="alert">Não foi possível carregar os exemplos agora.</p>;
  if (consulta.data === undefined) return <p className="text-xs text-muted-foreground" role="status">Carregando exemplos…</p>;
  const lista = lerExemplos(consulta.data);
  const resumo = resumoExemplos(consulta.data);
  if (!lista.length) return <p className="text-xs text-muted-foreground">Nenhum item nos grupos desta regra (os grupos aparecem depois de importar o cadastro).</p>;
  return (
    <div className="overflow-x-auto">
      {resumo && <p className="mb-1 text-xs text-muted-foreground" role="status">{resumo}</p>}
      <table className="w-full text-sm" aria-label="Exemplos com itens reais">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-1">Código</th><th scope="col">Grupo</th><th scope="col">Descrição atual</th><th scope="col">Como ficaria</th><th scope="col">Observação</th></tr></thead>
        <tbody>{lista.map((e) => (
          <tr key={e.id} className={`border-b border-border/60 align-top ${realceVerde}`}>
            <td className="py-1 pr-2 tabular-nums">{e.codigo}</td><td className="pr-2">{e.grupo}</td><td className="pr-2">{e.atual}</td>
            <td className="pr-2 font-medium">{e.muda ? e.proposta : <span className="text-muted-foreground">sem mudança</span>}</td><td className="text-xs text-muted-foreground">{e.observacao}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function BlocoNomes({ valor, aoMudar, desabilitado, exemplos }) {
  const set = (k) => (v) => aoMudar({ ...valor, [k]: v });
  const previa = previaEstrutura(valor);
  const sepConhecido = SEPARADORES.some((s) => s.valor === valor.separador);
  return (
    <div className="space-y-3">
      <Secao titulo="Componentes e ordem" dica="Arraste ou use as setas para mudar a ordem. Marque os componentes que não podem faltar.">
        <Componentes valor={valor} aoMudar={aoMudar} desabilitado={desabilitado} />
      </Secao>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><Rotulo>Separador entre componentes</Rotulo>
          <select className={campoCls} disabled={desabilitado} value={sepConhecido ? valor.separador : "__outro"} onChange={(e) => set("separador")(e.target.value === "__outro" ? "" : e.target.value)}>
            {SEPARADORES.map((s) => <option key={s.rotulo} value={s.valor}>{s.rotulo}</option>)}<option value="__outro">Outro</option>
          </select>
          {!sepConhecido && <input className={`${campoCls} mt-1`} disabled={desabilitado} aria-label="Outro separador" value={valor.separador} onChange={(e) => set("separador")(e.target.value)} />}
        </label>
        <label className="block"><Rotulo>Maiúsculas e minúsculas</Rotulo>
          <select className={campoCls} disabled={desabilitado} value={valor.capitalizacao} onChange={(e) => set("capitalizacao")(e.target.value)}>{Object.entries(CAPITALIZACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:mt-5"><input type="checkbox" disabled={desabilitado} checked={!!valor.removerEspacosDuplicados} onChange={(e) => set("removerEspacosDuplicados")(e.target.checked)} />Remover espaços duplicados</label>
      </div>
      <Secao titulo="Abreviações aprovadas" dica="Só estas abreviações podem ser usadas, inclusive para caber no limite de caracteres.">
        <TabelaLinhas rotulo="Abreviações aprovadas" desabilitado={desabilitado} linhas={valor.abreviacoes} aoMudar={set("abreviacoes")} nova={() => ({ completa: "", abreviacao: "" })} vazio="Nenhuma abreviação cadastrada."
          colunas={[{ chave: "completa", rotulo: "Expressão completa", placeholder: "Ex.: Caixa" }, { chave: "abreviacao", rotulo: "Abreviação", placeholder: "Ex.: CX" }]} />
      </Secao>
      <Secao titulo="Termos proibidos e substituições" dica="Substituição vazia: o termo é só apontado (ou removido na proposta).">
        <TabelaLinhas rotulo="Termos proibidos" desabilitado={desabilitado} linhas={valor.termosProibidos.map((t) => ({ ...t, substituicao: t.substituicao ?? "" }))} aoMudar={set("termosProibidos")} nova={() => ({ termo: "", substituicao: "" })} vazio="Nenhum termo proibido cadastrado."
          colunas={[{ chave: "termo", rotulo: "Termo proibido", placeholder: "Ex.: Diversos" }, { chave: "substituicao", rotulo: "Substituir por (opcional)" }]} />
      </Secao>
      <Secao titulo="Prévia">
        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Estrutura</dt><dd>{previa.estrutura}</dd>
          <dt className="text-muted-foreground">Exemplo</dt><dd className="font-mono">{previa.exemplo}</dd>
        </dl>
        {exemplos}
      </Secao>
    </div>
  );
}

// ── B. Atributos técnicos ────────────────────────────────────────────────────

export function BlocoAtributos({ valor, aoMudar, desabilitado }) {
  const [outro, setOutro] = useState("");
  const marcados = valor.atributos.map((a) => a.atributo);
  const set = (i, parte) => aoMudar({ ...valor, atributos: valor.atributos.map((a, j) => (j === i ? { ...a, ...parte } : a)) });
  const alternar = (atr) => aoMudar({ ...valor, atributos: marcados.includes(atr) ? valor.atributos.filter((a) => a.atributo !== atr) : [...valor.atributos, novoAtributo(atr)] });
  const acrescentar = () => { const v = outro.trim(); if (v && !marcados.some((m) => m.toLocaleLowerCase("pt-BR") === v.toLocaleLowerCase("pt-BR"))) aoMudar({ ...valor, atributos: [...valor.atributos, novoAtributo(v)] }); setOutro(""); };
  return (
    <div className="space-y-3">
      <Secao titulo="Atributos exigidos" dica="Marque os atributos que o item precisa ter. Atributo ausente vira pendência; a IA só sugere de onde tirar, nunca preenche.">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {ATRIBUTOS_SUGERIDOS.map((a) => <label key={a} className="flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={desabilitado} checked={marcados.includes(a)} onChange={() => alternar(a)} />{rotuloAtributo(a)}</label>)}
        </div>
        {!desabilitado && (
          <div className="flex gap-1">
            <input className={`${campoCls} w-56`} placeholder="Outro atributo" aria-label="Outro atributo" value={outro} onChange={(e) => setOutro(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); acrescentar(); } }} />
            <button type="button" className={botaoSecundario} disabled={!outro.trim()} onClick={acrescentar}><Plus className="h-4 w-4" aria-hidden="true" />Acrescentar</button>
          </div>
        )}
      </Secao>
      {valor.atributos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum atributo marcado.</p> : (
        <ul className="space-y-2" aria-label="Como cada atributo deve constar">
          {valor.atributos.map((a, i) => (
            <li key={`${a.atributo}-${i}`} className="grid gap-2 border border-border p-2 sm:grid-cols-4">
              <div className="text-sm font-medium sm:pt-5">{rotuloAtributo(a.atributo) || `Atributo ${i + 1}`}</div>
              <label className="block"><Rotulo>Onde deve constar</Rotulo>
                <select className={campoCls} disabled={desabilitado} value={a.onde} onChange={(e) => set(i, { onde: e.target.value })}>{Object.entries(ONDE_ATRIBUTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              {a.onde !== "DESCRICAO" ? (
                <label className="block"><Rotulo>Campo próprio (coluna do cadastro)</Rotulo><input className={campoCls} disabled={desabilitado} value={a.campo ?? ""} onChange={(e) => set(i, { campo: e.target.value })} placeholder="Ex.: Fabricante" /></label>
              ) : <div />}
              <label className="block"><Rotulo>Exigência</Rotulo>
                <select className={campoCls} disabled={desabilitado} value={a.aplicabilidade} onChange={(e) => set(i, { aplicabilidade: e.target.value })}>{Object.entries(APLICABILIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              {a.aplicabilidade === "QUANDO_APLICAVEL" && (
                <label className="block sm:col-span-4"><Rotulo>Quando se aplica</Rotulo><input className={campoCls} disabled={desabilitado} value={a.condicao ?? ""} onChange={(e) => set(i, { condicao: e.target.value })} placeholder="Ex.: defensivos com princípio ativo registrado" /></label>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── C. Unidades e embalagens ─────────────────────────────────────────────────

export function BlocoUnidades({ valor, aoMudar, desabilitado }) {
  const set = (k) => (v) => aoMudar({ ...valor, [k]: v });
  const id = useId();
  return (
    <div className="space-y-3">
      <Secao titulo="Unidade de estoque">
        <div role="radiogroup" aria-label="Critério da unidade de estoque" className="space-y-1">
          {Object.entries(CRITERIO_ESTOQUE).map(([k, v]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name={`${id}-crit`} disabled={desabilitado} checked={valor.criterioEstoque === k} onChange={() => set("criterioEstoque")(k)} />{v}</label>)}
        </div>
        {valor.criterioEstoque === "DEFINIDA" && (
          <label className="block max-w-xs"><Rotulo>Unidade definida</Rotulo>
            <input className={campoCls} list={`${id}-un`} disabled={desabilitado} value={valor.unidadeDefinida ?? ""} onChange={(e) => set("unidadeDefinida")(e.target.value.toUpperCase())} placeholder="Ex.: KG" />
            <datalist id={`${id}-un`}>{UNIDADES_COMUNS.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
        )}
      </Secao>
      <div className="grid gap-3 sm:grid-cols-2">
        <SeletorMultiplo rotulo="Unidades de compra permitidas" opcoes={UNIDADES_COMUNS} marcados={valor.unidadesCompra} aoMudar={set("unidadesCompra")} desabilitado={desabilitado} permitirOutro />
        <SeletorMultiplo rotulo="Unidades de saída permitidas" opcoes={UNIDADES_COMUNS} marcados={valor.unidadesSaida} aoMudar={set("unidadesSaida")} desabilitado={desabilitado} permitirOutro />
      </div>
      <Secao titulo="Conversões" dica="Fator: quantas unidades de destino há em 1 unidade de origem. Digite no padrão brasileiro (1.000 = mil; 0,5 = meio).">
        <TabelaLinhas rotulo="Conversões" desabilitado={desabilitado} linhas={valor.conversoes} aoMudar={set("conversoes")} nova={novaConversao} vazio="Nenhuma conversão cadastrada."
          colunas={[
            { chave: "origem", rotulo: "Origem", placeholder: "Ex.: CX" },
            { chave: "destino", rotulo: "Destino", placeholder: "Ex.: UN" },
            { chave: "fator", rotulo: "Fator", render: (l, mudar, i) => {
              const invalido = String(l.fator ?? "").trim() !== "" && lerFator(l.fator) === null;
              return <><input className={`${campoCls} ${invalido ? "ring-2 ring-destructive" : ""}`} inputMode="decimal" disabled={desabilitado} aria-label={`Fator, linha ${i + 1}`} aria-invalid={invalido} value={l.fator ?? ""} onChange={(e) => mudar(e.target.value)} placeholder="Ex.: 12" />{invalido && <span className="text-xs text-destructive">Número inválido</span>}</>;
            } },
            { chave: "abrangencia", rotulo: "Vale para", render: (l, mudar, i) => <select className={campoCls} disabled={desabilitado} aria-label={`Vale para, linha ${i + 1}`} value={l.abrangencia} onChange={(e) => mudar(e.target.value)}>{Object.entries(ABRANGENCIA_CONVERSAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> },
            { chave: "codigoProduto", rotulo: "Código do produto", render: (l, mudar, i) => (l.abrangencia === "PRODUTO" ? <input className={campoCls} disabled={desabilitado} aria-label={`Código do produto, linha ${i + 1}`} value={l.codigoProduto ?? ""} onChange={(e) => mudar(e.target.value)} /> : <span className="text-xs text-muted-foreground">—</span>) },
          ]} />
        <Aviso tom="alerta">{AVISO_CONVERSAO_DESCONHECIDA}</Aviso>
      </Secao>
    </div>
  );
}

// ── D. Limites de caracteres ─────────────────────────────────────────────────

export function BlocoLimites({ valor, aoMudar, desabilitado, exemplos }) {
  const linhas = valor.linhas;
  const set = (i, parte) => aoMudar({ ...valor, linhas: linhas.map((l, j) => (j === i ? { ...l, ...parte } : l)) });
  const resumo = resumoLimites(linhas);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Ordem de confiança: o leiaute oficial é o teto; depois o ERP e o limite próprio do cliente. Vale o menor limite confirmado. Limite vazio = não confirmado (fica pendente). O texto nunca é cortado: o excesso gera uma proposta ou um pedido de revisão.</p>
      {linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum limite cadastrado.</p>}
      <ul className="space-y-2" aria-label="Linhas de limite">
        {linhas.map((l, i) => {
          const lim = lerLimite(l.limite);
          return (
            <li key={i} className="space-y-2 border border-border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Limite {i + 1}</span>
                <Tag tom={l.origem === "LEIAUTE_OFICIAL" ? "info" : "neutro"}>{ORIGEM_LIMITE[l.origem]}</Tag>
                {lim.valor === null || !l.confirmado ? <Tag tom="alerta">Não confirmado</Tag> : <Tag tom="ok">Confirmado</Tag>}
                {!desabilitado && <button type="button" className={`${botaoIcone} ml-auto`} aria-label={`Remover o limite ${i + 1}`} onClick={() => aoMudar({ ...valor, linhas: linhas.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="block"><Rotulo>Destino</Rotulo><input className={campoCls} disabled={desabilitado} value={l.destino} onChange={(e) => set(i, { destino: e.target.value })} placeholder="Ex.: SPED EFD ICMS/IPI" /></label>
                <label className="block"><Rotulo>Campo do destino</Rotulo><input className={campoCls} disabled={desabilitado} value={l.campo} onChange={(e) => set(i, { campo: e.target.value })} placeholder="Ex.: 0200 DESCR_ITEM" /></label>
                <label className="block"><Rotulo>Campo do item</Rotulo><select className={campoCls} disabled={desabilitado} value={l.campoItem} onChange={(e) => set(i, { campoItem: e.target.value })}>{Object.entries(CAMPO_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="block"><Rotulo>Limite (caracteres)</Rotulo>
                  <input className={`${campoCls} ${lim.invalido ? "ring-2 ring-destructive" : ""}`} inputMode="numeric" disabled={desabilitado} aria-invalid={lim.invalido} value={l.limite ?? ""} onChange={(e) => set(i, { limite: e.target.value, ...(String(e.target.value).trim() ? {} : { confirmado: false }) })} placeholder="Vazio = não confirmado" />
                  {lim.invalido && <span className="text-xs text-destructive">Digite um número inteiro.</span>}
                </label>
                <label className="block"><Rotulo>Origem</Rotulo><select className={campoCls} disabled={desabilitado} value={l.origem} onChange={(e) => set(i, { origem: e.target.value })}>{Object.entries(ORIGEM_LIMITE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="block sm:col-span-2"><Rotulo>Referência e versão (documento, versão, vigência)</Rotulo><input className={campoCls} disabled={desabilitado} value={l.referencia ?? ""} onChange={(e) => set(i, { referencia: e.target.value })} placeholder="Ex.: Guia Prático da EFD ICMS/IPI, versão 3.1.8" /></label>
                <label className="block"><Rotulo>Endereço da fonte</Rotulo><input className={campoCls} disabled={desabilitado} value={l.url ?? ""} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://" /></label>
                <label className="flex items-center gap-2 text-sm sm:mt-5"><input type="checkbox" disabled={desabilitado || lim.valor === null} checked={lim.valor !== null && !!l.confirmado} onChange={(e) => set(i, { confirmado: e.target.checked })} />Confirmado na fonte</label>
                <label className="block"><Rotulo>Tratamento do excesso</Rotulo><select className={campoCls} disabled={desabilitado} value={l.tratamento} onChange={(e) => set(i, { tratamento: e.target.value })}>{Object.entries(TRATAMENTO_EXCESSO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <div className="sm:col-span-3"><Rotulo>Componentes a preservar</Rotulo>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">{COMPONENTES_NOME.map((c) => <label key={c} className="flex items-center gap-1 text-sm"><input type="checkbox" disabled={desabilitado} checked={(l.preservar || []).includes(c)} onChange={() => set(i, { preservar: alternarNaLista(l.preservar || [], c) })} />{ROTULO_COMPONENTE[c]}</label>)}</div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!desabilitado && <button type="button" className={botaoSecundario} onClick={() => aoMudar({ ...valor, linhas: [...linhas, novaLinhaLimite()] })}><Plus className="h-4 w-4" aria-hidden="true" />Acrescentar limite</button>}
      {resumo.length > 0 && (
        <Secao titulo="Limite efetivo">
          <ul className="space-y-1 text-sm" aria-label="Limite efetivo por campo">
            {resumo.map((r) => (
              <li key={r.campoItem}>
                <span className="font-medium">{CAMPO_ITEM[r.campoItem]}:</span>{" "}
                {r.efetivo === null ? <span>não confirmado (pendente)</span> : <span>{r.efetivo} caracteres — menor confirmado ({ORIGEM_LIMITE[r.origemEfetivo]}{r.destinoEfetivo ? `: ${r.destinoEfetivo}` : ""})</span>}
                {r.pendentes > 0 && r.efetivo !== null && <span className="text-muted-foreground"> · {r.pendentes} linha(s) ainda não confirmada(s)</span>}
                {r.alertas.map((a) => <p key={a} className="mt-1 flex items-start gap-1 text-amber-800 dark:text-amber-200" role="status"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{a}</p>)}
              </li>
            ))}
          </ul>
        </Secao>
      )}
      {exemplos && <Secao titulo="Exemplos com itens reais">{exemplos}</Secao>}
    </div>
  );
}

// ── E. Classificação fiscal ──────────────────────────────────────────────────

export function BlocoFiscal({ valor, aoMudar, desabilitado }) {
  const set = (k) => (v) => aoMudar({ ...valor, [k]: v });
  return (
    <div className="space-y-3">
      <Secao titulo="NCM">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={desabilitado} checked={!!valor.validarNcm} onChange={(e) => set("validarNcm")(e.target.checked)} />Validar o NCM</label>
        <Rotulo>Exceções justificadas (itens ou grupos não sujeitos à classificação)</Rotulo>
        <TabelaLinhas rotulo="Exceções de NCM" desabilitado={desabilitado} linhas={valor.excecoesNcm} aoMudar={set("excecoesNcm")} nova={() => ({ alvo: "", justificativa: "" })} vazio="Nenhuma exceção."
          colunas={[{ chave: "alvo", rotulo: "Item ou grupo", placeholder: "Ex.: Serviços de terceiros" }, { chave: "justificativa", rotulo: "Justificativa" }]} />
      </Secao>
      <Secao titulo="cClassTrib">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={desabilitado} checked={!!valor.validarCClassTrib} onChange={(e) => set("validarCClassTrib")(e.target.checked)} />Validar o cClassTrib nos cenários aplicáveis</label>
        <div role="group" aria-label="Cenários" className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(CENARIOS_FISCAIS).map(([k, v]) => <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={desabilitado} checked={valor.cenarios.includes(k)} onChange={() => set("cenarios")(alternarNaLista(valor.cenarios, k))} />{v}</label>)}
        </div>
      </Secao>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground" aria-label="Regras fixas">
        <li>{TEXTO_AUSENTE}</li>
        <li>{TEXTO_AMBIGUO}</li>
      </ul>
    </div>
  );
}

/** O bloco do aspecto (A a E). `exemplos` (itens reais) só nos aspectos Nomes e Limites. */
export function BlocoDoAspecto({ aspecto, valor, aoMudar, desabilitado, exemplos }) {
  if (aspecto === "NOMES") return <BlocoNomes valor={valor} aoMudar={aoMudar} desabilitado={desabilitado} exemplos={exemplos} />;
  if (aspecto === "ATRIBUTOS") return <BlocoAtributos valor={valor} aoMudar={aoMudar} desabilitado={desabilitado} />;
  if (aspecto === "UNIDADES") return <BlocoUnidades valor={valor} aoMudar={aoMudar} desabilitado={desabilitado} />;
  if (aspecto === "LIMITES") return <BlocoLimites valor={valor} aoMudar={aoMudar} desabilitado={desabilitado} exemplos={exemplos} />;
  if (aspecto === "FISCAL") return <BlocoFiscal valor={valor} aoMudar={aoMudar} desabilitado={desabilitado} />;
  return null;
}
