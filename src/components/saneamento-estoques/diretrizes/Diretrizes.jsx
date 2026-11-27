import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookCopy, CheckCircle2, FileText, Pencil, Play, Plus } from "lucide-react";
import { api } from "@/api/client";
import { useConfirmar } from "@/components/ConfirmProvider";
import { atualizarTudo, chaves, san } from "../api";
import { Aviso, bordaQuadro, botaoPrimario, botaoSecundario, campoCls, Carregar, MarcaRevisar, Quadro, Rotulo, rotuloCls, Tag, TextoLongo, usePodeAlterar } from "../comuns";
import { ehConflitoVersao, fmtData, fmtDataHora, mensagemDeErro } from "../logica";
import { realceVerde } from "./Blocos";
import FormularioRegra from "./FormularioRegra";
import Janela from "./Janela";
import {
  ASPECTOS, atualizacaoDa, falhasDaReanalise, gruposSemRegraAgrupados, mensagemDiretriz, regrasParaAplicar, regrasPorAspecto, resumoPreviaVarias, ROTULO_ASPECTO, separarParaAprovar,
  SITUACAO_REGRA, SOBRE_ASPECTO, textoAbrangencia,
} from "./logica";

/** Botão "Política (PDF)": sem versão, a política de agora (marcada Rascunho enquanto houver regra não aprovada); com versão, a congelada nela. */
export function BotaoPolitica({ projetoId, versao = null, rotulo = "Política (PDF)" }) {
  const [erro, setErro] = useState(null);
  const baixar = useMutation({ mutationFn: () => san.baixarPolitica(projetoId, versao), onError: (e) => setErro(mensagemDeErro(e, "Não foi possível gerar a política agora.")), onSuccess: () => setErro(null) });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={botaoSecundario} disabled={baixar.isPending} onClick={() => baixar.mutate()} aria-label={versao ? `Baixar a política (PDF) da versão ${versao.numero}` : "Baixar a política (PDF)"}>
        <FileText className="h-4 w-4" aria-hidden="true" />{baixar.isPending ? "Gerando…" : rotulo}
      </button>
      {erro && <span className="text-xs text-destructive" role="alert">{erro}</span>}
    </span>
  );
}

/** Cabeçalho: só MOSTRA o que o projeto já tem (cliente, base importada, ERP, data-base) e edita a vigência; situação e "revisar". */
export function CabecalhoDiretrizes({ projeto, cabecalho, cliente, ultimaImportacao, aoSalvarVigencia, salvando, podeAlterar, razao }) {
  const [vigencia, setVigencia] = useState(cabecalho?.vigencia ? String(cabecalho.vigencia).slice(0, 10) : "");
  const mudou = vigencia !== (cabecalho?.vigencia ? String(cabecalho.vigencia).slice(0, 10) : "");
  const erp = projeto.erp_nome || projeto.erp || "Não informado";
  return (
    <section aria-label="Cabeçalho das diretrizes" className={`space-y-3 border ${bordaQuadro} bg-card p-4`}>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className={rotuloCls}>Cliente</dt><dd>{cliente || "—"}</dd></div>
        <div><dt className={rotuloCls}>Base importada</dt><dd>{ultimaImportacao === undefined ? "…" : ultimaImportacao ? `${ultimaImportacao.arquivo || "Cadastro de itens"} — ${fmtDataHora(ultimaImportacao.createdAt)}` : "Nenhuma importação ainda"}</dd></div>
        <div><dt className={rotuloCls}>ERP</dt><dd>{erp}{projeto.erp_versao ? ` — versão ${projeto.erp_versao}` : ""}</dd></div>
        <div><dt className={rotuloCls}>Data-base</dt><dd>{fmtData(projeto.data_base) || "—"}</dd></div>
      </dl>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><Rotulo>Vigência da política</Rotulo><input type="date" className={`${campoCls} w-44`} disabled={!podeAlterar || salvando} value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></label>
        <button type="button" className={botaoSecundario} disabled={!podeAlterar || salvando || !mudou} title={razao} onClick={() => aoSalvarVigencia(vigencia || null)}>{salvando ? "Salvando…" : "Salvar vigência"}</button>
        <div><Rotulo>Situação</Rotulo>
          <span className="flex items-center gap-1"><Tag tom={cabecalho?.situacao === "APROVADA" ? "ok" : "neutro"}>{SITUACAO_REGRA[cabecalho?.situacao] || "Rascunho"}</Tag>{cabecalho?.revisar && <MarcaRevisar causa="Uma regra mudou depois da aprovação: confira." />}</span>
        </div>
      </div>
    </section>
  );
}

/** Uma regra na lista: código, nome, grupos, situação, revisar e o aviso de atualização da biblioteca (com "Adotar"). */
function LinhaRegra({ regra, atualizacao, aoAbrir, aoAdotar, adotando, pode, razao, marcada, aoMarcar }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 border-b border-foreground/20 px-3 py-1.5 text-sm last:border-b-0 ${realceVerde}`}>
      {aoMarcar && <input type="checkbox" checked={!!marcada} onChange={() => aoMarcar(regra.id)} aria-label={`Marcar a regra ${regra.codigo}`} />}
      <span className="w-12 font-mono font-semibold">{regra.codigo}</span>
      <button type="button" className="min-w-[12rem] flex-1 text-left font-medium text-primary underline-offset-2 hover:underline" onClick={aoAbrir}>{regra.nome}</button>
      <span className="text-xs font-medium text-foreground/80">Grupos:</span><TextoLongo texto={textoAbrangencia(regra.abrangencia)} largura="max-w-[22rem]" />
      <Tag tom={regra.situacao === "APROVADA" ? "ok" : "neutro"}>{SITUACAO_REGRA[regra.situacao] || "Rascunho"}</Tag>
      {regra.pendenteAplicar && regra.ativa !== false && <Tag tom="alerta">Não aplicada</Tag>}
      {regra.revisar && <MarcaRevisar causa="Algo de que esta regra depende mudou: confira." />}
      {regra.bibliotecaId && <Tag tom="info">Biblioteca{regra.bibliotecaVersao ? ` v${regra.bibliotecaVersao}` : ""}</Tag>}
      {atualizacao && (
        <span className="inline-flex items-center gap-1 border border-sky-600/50 bg-sky-500/10 px-1.5 py-0.5 text-xs">
          Regra atualizada na biblioteca (versão {atualizacao.versaoNova})
          <button type="button" className="font-semibold underline disabled:opacity-50" disabled={!pode || adotando} title={razao} onClick={aoAdotar}>{adotando ? "Adotando…" : "Adotar"}</button>
        </span>
      )}
      <button type="button" className={`${botaoSecundario} px-2 py-1 text-xs`} onClick={aoAbrir} aria-label={`Abrir a regra ${regra.codigo}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Abrir</button>
    </li>
  );
}

/** Regras do projeto por aspecto (as 5 seções, ou só os `aspectos` da fase) e o quadro "Grupos sem regra". */
export function ListaDeRegras({ dados, aoAbrir, aoNova, aoAdotar, adotandoId, pode, razao, selecionadas, aoMarcar, aspectos = ASPECTOS }) {
  const porAspecto = regrasPorAspecto(dados.regras);
  return (
    <div className="space-y-5">
      {aspectos.map((a) => (
        <section key={a} aria-labelledby={`dir-asp-${a}`} className={`border ${bordaQuadro} bg-card shadow-sm`}>
          <header className={`flex flex-wrap items-center gap-2 border-b ${bordaQuadro} bg-primary/10 px-3 py-2`}>
            <h3 id={`dir-asp-${a}`} className="text-sm font-semibold text-foreground">{ROTULO_ASPECTO[a]}</h3>
            <span className="text-xs font-medium text-foreground/75">{porAspecto[a].length} {porAspecto[a].length === 1 ? "regra" : "regras"}</span>
            <button type="button" className={`${botaoSecundario} ml-auto bg-card px-2 py-1 text-xs`} disabled={!pode} title={razao} onClick={() => aoNova(a)}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Regra de {ROTULO_ASPECTO[a].toLocaleLowerCase("pt-BR")}</button>
          </header>
          <p className="border-b border-foreground/20 bg-muted px-3 py-1.5 text-xs text-foreground/75">{SOBRE_ASPECTO[a]}</p>
          {porAspecto[a].length === 0 ? <p className="px-3 py-2 text-sm text-foreground/75">Nenhuma regra deste aspecto.</p> : (
            <ul className="py-1" aria-label={`Regras: ${ROTULO_ASPECTO[a]}`}>
              {porAspecto[a].map((r) => <LinhaRegra key={r.id} regra={r} atualizacao={atualizacaoDa(r, dados.atualizacoesBiblioteca)} aoAbrir={() => aoAbrir(r.id)} aoAdotar={() => aoAdotar(r)} adotando={adotandoId === r.id} pode={pode} razao={razao} marcada={selecionadas?.has(r.id)} aoMarcar={aoMarcar} />)}
            </ul>
          )}
        </section>
      ))}
      <GruposSemRegra dados={dados} aspectos={aspectos} />
    </div>
  );
}

/**
 * "Grupos sem regra": a contagem por aspecto e, uma vez só, a lista dos grupos (juntos os que faltam nos mesmos aspectos), expansível.
 */
export function GruposSemRegra({ dados, aspectos = ASPECTOS }) {
  const { porAspecto, conjuntos } = gruposSemRegraAgrupados((dados.gruposSemRegra || []).filter((g) => aspectos.includes(g.aspecto)));
  return (
    <Quadro as="section" titulo="Grupos sem regra" nivel="h3">
      {(dados.grupos || []).length === 0 ? <p className="text-sm text-foreground/75">Os grupos aparecem depois de importar o cadastro de itens.</p> : (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Grupos sem regra por aspecto">
            {aspectos.map((a) => (
              <li key={a} className="inline-flex items-center gap-1">
                <span className="font-medium">{ROTULO_ASPECTO[a]}</span>
                {porAspecto[a] === 0 ? <Tag tom="ok">Todos os grupos têm regra</Tag> : <Tag tom="alerta">{porAspecto[a]} {porAspecto[a] === 1 ? "grupo pendente" : "grupos pendentes"}</Tag>}
              </li>
            ))}
          </ul>
          {conjuntos.map((c) => (
            <details key={c.aspectos.join("|")} className="text-xs">
              <summary className="cursor-pointer font-medium">{c.grupos.length} {c.grupos.length === 1 ? "grupo" : "grupos"} sem regra de {c.aspectos.map((a) => ROTULO_ASPECTO[a].toLocaleLowerCase("pt-BR")).join(", ")}</summary>
              <p className="mt-1 max-h-40 overflow-auto text-foreground/80">{c.grupos.join(", ")}</p>
            </details>
          ))}
        </>
      )}
      <p className="text-xs text-foreground/75">Grupo sem regra entra na política como pendência, nunca como regra vigente.</p>
    </Quadro>
  );
}

/**
 * Prévia agregada de aplicar várias regras: regras, grupos, itens e análises refeitas (uma reanálise só). Regras escolhidas que disputam
 * o mesmo grupo impedem aplicar; grupo de regra fora da seleção exige marcar a transferência.
 */
export function PreviaVarias({ previa, aoConfirmar, aoCancelar, ocupado }) {
  const [transferir, setTransferir] = useState(false);
  const r = resumoPreviaVarias(previa);
  const sobrepoe = r.sobreposicoes.length > 0;
  const disputa = r.entreEscolhidas.length > 0;
  return (
    <Janela titulo="Prévia: aplicar as regras" aoFechar={ocupado ? undefined : aoCancelar}>
      <section aria-label="Prévia da aplicação das regras" className="space-y-2 border-2 border-primary/60 bg-card p-3">
        <h3 className="text-sm font-semibold">Antes de aplicar, confira o que muda</h3>
        <p className="text-sm">{r.texto}</p>
        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className={rotuloCls}>Regras</dt><dd><TextoLongo texto={(previa.regras || []).map((x) => `${x.codigo} ${x.nome}`).join("; ")} largura="max-w-full" /></dd>
          <dt className={rotuloCls}>Grupos</dt><dd>{r.grupos.length ? <TextoLongo texto={r.grupos.join(", ")} largura="max-w-full" /> : "Nenhum grupo com itens importados"}</dd>
          <dt className={rotuloCls}>Análises refeitas</dt><dd>{r.camadas.length ? r.camadas.join(", ") : "—"}</dd>
        </dl>
        {disputa && (
          <Aviso tom="erro" titulo="Regras escolhidas disputam o mesmo grupo">
            <ul className="list-disc pl-5">{r.entreEscolhidas.map((s) => <li key={`${s.grupo}-${s.regra}-${s.regraAtual}`}>{s.grupo}: {s.regraAtual} e {s.regra}</li>)}</ul>
            Tire uma delas da seleção ou ajuste a abrangência.
          </Aviso>
        )}
        {sobrepoe && !disputa && (
          <Aviso tom="alerta" titulo="Grupos já cobertos por outra regra do mesmo aspecto">
            <ul className="list-disc pl-5">{r.sobreposicoes.map((s) => <li key={`${s.grupo}-${s.regra}-${s.regraAtual}`}>{s.grupo}: hoje na regra {s.regraAtual}, passa para {s.regra}</li>)}</ul>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={transferir} onChange={(e) => setTransferir(e.target.checked)} />Confirmo transferir esses grupos (o histórico fica)</label>
          </Aviso>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botaoPrimario} disabled={ocupado || disputa || (sobrepoe && !transferir)} onClick={() => aoConfirmar({ confirmarTransferencia: transferir })}><Play className="h-4 w-4" aria-hidden="true" />{ocupado ? "Aplicando e reanalisando…" : "Confirmar e aplicar"}</button>
          <button type="button" className={botaoSecundario} disabled={ocupado} onClick={aoCancelar}>Cancelar</button>
        </div>
      </section>
    </Janela>
  );
}

/** Aplicar um modelo da biblioteca: cria as regras do modelo em rascunho, sem duplicar as que já existem. */
function AplicarModelo({ projeto, pode, razao, aoAplicou }) {
  const confirmar = useConfirmar();
  const [aberto, setAberto] = useState(false);
  const [modeloId, setModeloId] = useState("");
  const modelos = useQuery({ queryKey: chaves.modelos(), queryFn: () => san.modelos(), enabled: aberto });
  const lista = Array.isArray(modelos.data) ? modelos.data : [];
  const escolhido = lista.find((m) => m.id === modeloId);
  const aplicar = useMutation({ mutationFn: () => san.aplicarModelo(projeto.id, modeloId), onSuccess: (r) => { setAberto(false); setModeloId(""); aoAplicou({ tom: "ok", texto: textoModeloAplicado(r, escolhido) }); }, onError: (e) => aoAplicou({ tom: "erro", texto: mensagemDiretriz(e) }) });
  const pedir = async () => {
    const ok = await confirmar({ titulo: "Aplicar o modelo?", rotulo: "Aplicar modelo", perigoso: false, descricao: `As regras de "${escolhido?.nome}" entram em rascunho. Regras que o projeto já tem não são duplicadas. Depois, use Aplicar todas as regras: uma prévia só e uma reanálise só.` });
    if (ok) aplicar.mutate();
  };
  if (!aberto) return <button type="button" className={botaoSecundario} disabled={!pode} title={razao} onClick={() => setAberto(true)}><BookCopy className="h-4 w-4" aria-hidden="true" />Aplicar modelo da biblioteca</button>;
  return (
    <div className={`flex w-full flex-wrap items-end gap-2 border ${bordaQuadro} bg-muted p-3`}>
      <label className="block min-w-[260px] flex-1"><Rotulo>Modelo da biblioteca</Rotulo>
        <select className={campoCls} value={modeloId} disabled={modelos.data === undefined} onChange={(e) => setModeloId(e.target.value)}>
          <option value="">{modelos.isError ? "Não foi possível carregar os modelos" : modelos.data === undefined ? "Carregando…" : lista.length ? "Escolha o modelo" : "Nenhum modelo cadastrado"}</option>
          {lista.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        {escolhido?.descricao && <span className="mt-1 block text-xs text-muted-foreground">{escolhido.descricao}</span>}
      </label>
      <button type="button" className={botaoPrimario} disabled={!modeloId || aplicar.isPending} onClick={pedir}>{aplicar.isPending ? "Aplicando…" : "Aplicar modelo"}</button>
      <button type="button" className={botaoSecundario} onClick={() => { setAberto(false); setModeloId(""); }}>Cancelar</button>
    </div>
  );
}
/** Mensagem depois de aplicar o modelo (o servidor pode devolver quantas regras criou e quantas já existiam). */
export function textoModeloAplicado(r, modelo) {
  const nome = modelo?.nome ? `"${modelo.nome}"` : "O modelo";
  const criadas = Number(r?.criadas ?? (Array.isArray(r?.regras) ? r.regras.length : Array.isArray(r) ? r.length : NaN));
  const ja = Number(r?.jaExistiam ?? r?.ignoradas ?? NaN);
  if (!Number.isFinite(criadas)) return `${nome} foi aplicado. As regras novas estão em rascunho.`;
  return `${nome} foi aplicado: ${criadas} ${criadas === 1 ? "regra criada" : "regras criadas"} em rascunho${Number.isFinite(ja) && ja > 0 ? `; ${ja} já ${ja === 1 ? "existia" : "existiam"}` : ""}.`;
}

/**
 * Aba Diretrizes do projeto: cabeçalho, modelo, regras por aspecto, grupos sem regra, Política (PDF) e o formulário da regra. `aspectos`:
 * os aspectos que a fase mostra (Fase 1: nomes, atributos, unidades e limites; Fase 2: classificação fiscal); aplicar e aprovar em lote
 * ficam nas regras desses aspectos. Uma regra aberta pelo endereço abre mesmo sendo de outro aspecto.
 */
export default function Diretrizes({ projeto, aspectos = ASPECTOS }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { pode, razao } = usePodeAlterar();
  const [params, setParams] = useSearchParams();
  const consulta = useQuery({ queryKey: chaves.diretrizes(projeto.id), queryFn: () => san.diretrizes(projeto.id) });
  const cliente = useQuery({ queryKey: chaves.cliente(projeto.empresa_id), queryFn: () => api.entities.Empresa.get(projeto.empresa_id), enabled: !!projeto.empresa_id });
  const importacoes = useQuery({ queryKey: chaves.importacoes(projeto.id), queryFn: () => san.importacoes(projeto.id) });
  const [edicao, setEdicao] = useState(() => (params.get("regra") ? { regraId: params.get("regra") } : null));
  const [msg, setMsg] = useState(null);

  const ultimaImportacao = importacoes.isError ? null : importacoes.data === undefined ? undefined
    : [...(Array.isArray(importacoes.data) ? importacoes.data : [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;

  const vigencia = useMutation({
    mutationFn: (v) => san.salvarCabecalhoDiretrizes(projeto.id, { vigencia: v, versao: consulta.data?.cabecalho?.versao }),
    onSuccess: async () => { setMsg({ tom: "ok", texto: "Vigência salva." }); await qc.invalidateQueries({ queryKey: chaves.diretrizes(projeto.id) }); },
    onError: async (e) => { setMsg({ tom: ehConflitoVersao(e) ? "alerta" : "erro", texto: ehConflitoVersao(e) ? "Outra pessoa alterou as diretrizes depois que você abriu a aba. Recarregamos os dados: confira e salve de novo." : mensagemDiretriz(e) }); if (ehConflitoVersao(e)) await qc.invalidateQueries({ queryKey: chaves.diretrizes(projeto.id) }); },
  });
  const adotar = useMutation({
    mutationFn: (r) => san.adotarVersao(r.id, r.versao),
    onSuccess: async () => { setMsg({ tom: "ok", texto: "Versão da biblioteca adotada. Abra a regra e use Aplicar e reanalisar para ver o impacto." }); await atualizarTudo(qc, projeto.id); },
    onError: async (e) => { setMsg({ tom: "erro", texto: mensagemDiretriz(e) }); if (ehConflitoVersao(e)) await qc.invalidateQueries({ queryKey: chaves.diretrizes(projeto.id) }); },
  });
  const pedirAdocao = async (r) => {
    const at = atualizacaoDa(r, consulta.data?.atualizacoesBiblioteca);
    const ok = await confirmar({ titulo: `Adotar a versão ${at?.versaoNova} da biblioteca?`, rotulo: "Adotar", perigoso: false, descricao: `A regra ${r.codigo} passa a usar a versão nova da biblioteca, mantendo as alterações próprias deste projeto. Ela volta a Rascunho; nada é reanalisado até você usar Aplicar e reanalisar.` });
    if (ok) adotar.mutate(r);
  };

  // Várias regras: seleção, prévia agregada (aplicar todas ou as marcadas) e aprovar as marcadas.
  const [selecionadas, setSelecionadas] = useState(() => new Set());
  const [previaVarias, setPreviaVarias] = useState(null); // { dados, regras }
  const marcar = (id) => setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const buscarPrevia = useMutation({
    mutationFn: (regras) => san.previaAplicarVarias(projeto.id, regras.map((r) => r.id)).then((dados) => ({ dados, regras })),
    onSuccess: (p) => { setMsg(null); setPreviaVarias(p); },
    onError: (e) => setMsg({ tom: "erro", texto: mensagemDiretriz(e) }),
  });
  const aplicarVarias = useMutation({
    mutationFn: ({ regras, confirmarTransferencia }) => san.aplicarVarias(projeto.id, { regras: regras.map((r) => ({ id: r.id, versao: r.versao })), ...(confirmarTransferencia ? { confirmarTransferencia: true } : {}) }),
    onSuccess: async (r) => {
      const falhas = falhasDaReanalise(r.reanalise);
      setPreviaVarias(null); setSelecionadas(new Set());
      setMsg({ tom: falhas.length ? "alerta" : "ok", texto: `${resumoPreviaVarias(r.previa).textoFeito(r.aplicadas)}${falhas.length ? ` Não reanalisado: ${falhas.join("; ")}.` : ""}` });
      await atualizarTudo(qc, projeto.id);
    },
    onError: async (e) => { setPreviaVarias(null); setMsg({ tom: "erro", texto: mensagemDiretriz(e) }); await qc.invalidateQueries({ queryKey: chaves.diretrizes(projeto.id) }); },
  });
  const aprovarVarias = useMutation({
    mutationFn: async (regras) => {
      const erros = [];
      for (const r of regras) { try { await san.aprovarRegra(r.id, r.versao); } catch (e) { erros.push(`${r.codigo}: ${mensagemDiretriz(e)}`); } }
      return { aprovadas: regras.length - erros.length, erros };
    },
    onSuccess: async ({ aprovadas, erros }) => {
      setSelecionadas(new Set());
      setMsg({ tom: erros.length ? "alerta" : "ok", texto: `${aprovadas} ${aprovadas === 1 ? "regra aprovada" : "regras aprovadas"}.${erros.length ? ` Não aprovadas: ${erros.join("; ")}` : ""}` });
      await atualizarTudo(qc, projeto.id);
    },
  });
  const pedirAprovacaoVarias = async (regras) => {
    const { aprovaveis, fora } = separarParaAprovar(regras);
    if (!aprovaveis.length) { setMsg({ tom: "alerta", texto: "Nenhuma das regras marcadas pode ser aprovada agora: aplique antes as que estão como Não aplicada." }); return; }
    const ok = await confirmar({ titulo: `Aprovar ${aprovaveis.length} ${aprovaveis.length === 1 ? "regra" : "regras"}?`, rotulo: "Aprovar", perigoso: false,
      descricao: `${aprovaveis.map((r) => r.codigo).join(", ")} passam a valer na política do cliente. Você fica registrado como aprovador.${fora.length ? `\nFicam de fora (não aplicadas ou já aprovadas): ${fora.map((r) => r.codigo).join(", ")}.` : ""}` });
    if (ok) aprovarVarias.mutate(aprovaveis);
  };
  const ocupadoVarias = buscarPrevia.isPending || aplicarVarias.isPending || aprovarVarias.isPending;

  const abrir = (regraId) => { setMsg(null); setEdicao({ regraId }); };
  const nova = (aspecto) => { setMsg(null); setEdicao({ inicial: { aspecto } }); };
  const fechar = () => {
    setEdicao(null);
    if (params.get("regra")) setParams((p) => { const n = new URLSearchParams(p); n.delete("regra"); return n; }, { replace: true });
  };

  return (
    <Carregar consulta={consulta} textoErro="Não foi possível carregar as diretrizes." textoCarregando="Carregando as diretrizes…">
      {(dados) => {
        if (edicao) {
          const existe = !edicao.regraId || (dados.regras || []).some((r) => r.id === edicao.regraId);
          if (!existe) return <Aviso tom="alerta" titulo="Regra não encontrada" acao={<button type="button" className={botaoSecundario} onClick={fechar}>Voltar às diretrizes</button>}>A regra pode ter sido removida ou é de outro projeto.</Aviso>;
          return <FormularioRegra key={edicao.regraId || `nova-${edicao.inicial?.aspecto}`} projeto={projeto} dados={dados} regraId={edicao.regraId || null} inicial={edicao.inicial || null} aoFechar={fechar} />;
        }
        const daFase = { ...dados, regras: (dados.regras || []).filter((r) => aspectos.includes(r.aspecto)) };
        const pendentes = regrasParaAplicar(daFase.regras);
        const marcadas = daFase.regras.filter((r) => selecionadas.has(r.id));
        return (
          <div className="space-y-4">
            <CabecalhoDiretrizes key={`${dados.cabecalho?.versao}-${dados.cabecalho?.vigencia}`} projeto={projeto} cabecalho={dados.cabecalho} cliente={cliente.data?.razao_social || cliente.data?.nome} ultimaImportacao={ultimaImportacao}
              aoSalvarVigencia={(v) => vigencia.mutate(v)} salvando={vigencia.isPending} podeAlterar={pode} razao={razao} />
            {msg && <Aviso tom={msg.tom === "erro" ? "erro" : msg.tom === "alerta" ? "alerta" : "ok"}>{msg.texto}</Aviso>}
            {(dados.grupos || []).length === 0 && (
              <Aviso tom="info" titulo="Os grupos aparecem depois de importar o cadastro">
                Você já pode cadastrar regras para Todos os grupos ou aplicar um modelo da biblioteca. Depois da importação, os grupos do cliente aparecem aqui para regras por grupo e no quadro Grupos sem regra.
              </Aviso>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={botaoPrimario} disabled={!pode} title={razao} onClick={() => nova(aspectos[0])}><Plus className="h-4 w-4" aria-hidden="true" />Adicionar regra</button>
              <AplicarModelo projeto={projeto} pode={pode} razao={razao} aoAplicou={async (m) => { setMsg(m); if (m.tom === "ok") await atualizarTudo(qc, projeto.id); }} />
              <BotaoPolitica projetoId={projeto.id} />
            </div>
            {daFase.regras.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-y border-border py-2" role="group" aria-label="Ações em várias regras">
                <button type="button" className={botaoPrimario} disabled={!pode || ocupadoVarias || !pendentes.length} title={razao || (!pendentes.length ? "Todas as regras já estão aplicadas como estão" : "Uma prévia só e uma reanálise só")} onClick={() => buscarPrevia.mutate(pendentes)}>
                  <Play className="h-4 w-4" aria-hidden="true" />{buscarPrevia.isPending ? "Preparando a prévia…" : `Aplicar todas as regras (${pendentes.length})`}
                </button>
                <button type="button" className={botaoSecundario} disabled={!pode || ocupadoVarias || !marcadas.length} title={razao} onClick={() => buscarPrevia.mutate(marcadas)}>Aplicar selecionadas ({marcadas.length})</button>
                <button type="button" className={botaoSecundario} disabled={!pode || ocupadoVarias || !marcadas.length} title={razao} onClick={() => pedirAprovacaoVarias(marcadas)}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{aprovarVarias.isPending ? "Aprovando…" : `Aprovar selecionadas (${marcadas.length})`}</button>
                {marcadas.length > 0 && <button type="button" className="text-xs underline" onClick={() => setSelecionadas(new Set())}>Limpar seleção</button>}
              </div>
            )}
            <ListaDeRegras dados={daFase} aspectos={aspectos} aoAbrir={abrir} aoNova={nova} aoAdotar={pedirAdocao} adotandoId={adotar.isPending ? adotar.variables?.id : null} pode={pode} razao={razao} selecionadas={selecionadas} aoMarcar={marcar} />
            {previaVarias && <PreviaVarias previa={previaVarias.dados} ocupado={aplicarVarias.isPending} aoCancelar={() => setPreviaVarias(null)} aoConfirmar={({ confirmarTransferencia }) => aplicarVarias.mutate({ regras: previaVarias.regras, confirmarTransferencia })} />}
          </div>
        );
      }}
    </Carregar>
  );
}
