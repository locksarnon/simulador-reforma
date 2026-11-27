import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookCopy, FileText, Pencil, Plus } from "lucide-react";
import { api } from "@/api/client";
import { useConfirmar } from "@/components/ConfirmProvider";
import { atualizarTudo, chaves, san } from "../api";
import { Aviso, bordaQuadro, botaoPrimario, botaoSecundario, campoCls, Carregar, MarcaRevisar, Quadro, Rotulo, rotuloCls, Tag, TextoLongo, usePodeAlterar } from "../comuns";
import { ehConflitoVersao, fmtData, fmtDataHora, mensagemDeErro } from "../logica";
import { realceVerde } from "./Blocos";
import FormularioRegra from "./FormularioRegra";
import { ASPECTOS, atualizacaoDa, mensagemDiretriz, regrasPorAspecto, ROTULO_ASPECTO, SITUACAO_REGRA, SOBRE_ASPECTO, textoAbrangencia } from "./logica";

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
function LinhaRegra({ regra, atualizacao, aoAbrir, aoAdotar, adotando, pode, razao }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 border-b border-foreground/20 px-3 py-1.5 text-sm last:border-b-0 ${realceVerde}`}>
      <span className="w-12 font-mono font-semibold">{regra.codigo}</span>
      <button type="button" className="min-w-[12rem] flex-1 text-left font-medium text-primary underline-offset-2 hover:underline" onClick={aoAbrir}>{regra.nome}</button>
      <span className="text-xs font-medium text-foreground/80">Grupos:</span><TextoLongo texto={textoAbrangencia(regra.abrangencia)} largura="max-w-[22rem]" />
      <Tag tom={regra.situacao === "APROVADA" ? "ok" : "neutro"}>{SITUACAO_REGRA[regra.situacao] || "Rascunho"}</Tag>
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

/** Regras do projeto por aspecto (5 seções) e o quadro "Grupos sem regra". */
export function ListaDeRegras({ dados, aoAbrir, aoNova, aoAdotar, adotandoId, pode, razao }) {
  const porAspecto = regrasPorAspecto(dados.regras);
  const semRegra = new Map((dados.gruposSemRegra || []).map((g) => [g.aspecto, g.grupos || []]));
  return (
    <div className="space-y-5">
      {ASPECTOS.map((a) => (
        <section key={a} aria-labelledby={`dir-asp-${a}`} className={`border ${bordaQuadro} bg-card shadow-sm`}>
          <header className={`flex flex-wrap items-center gap-2 border-b ${bordaQuadro} bg-primary/10 px-3 py-2`}>
            <h3 id={`dir-asp-${a}`} className="text-sm font-semibold text-foreground">{ROTULO_ASPECTO[a]}</h3>
            <span className="text-xs font-medium text-foreground/75">{porAspecto[a].length} {porAspecto[a].length === 1 ? "regra" : "regras"}</span>
            <button type="button" className={`${botaoSecundario} ml-auto bg-card px-2 py-1 text-xs`} disabled={!pode} title={razao} onClick={() => aoNova(a)}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Regra de {ROTULO_ASPECTO[a].toLocaleLowerCase("pt-BR")}</button>
          </header>
          <p className="border-b border-foreground/20 bg-muted px-3 py-1.5 text-xs text-foreground/75">{SOBRE_ASPECTO[a]}</p>
          {porAspecto[a].length === 0 ? <p className="px-3 py-2 text-sm text-foreground/75">Nenhuma regra deste aspecto.</p> : (
            <ul className="py-1" aria-label={`Regras: ${ROTULO_ASPECTO[a]}`}>
              {porAspecto[a].map((r) => <LinhaRegra key={r.id} regra={r} atualizacao={atualizacaoDa(r, dados.atualizacoesBiblioteca)} aoAbrir={() => aoAbrir(r.id)} aoAdotar={() => aoAdotar(r)} adotando={adotandoId === r.id} pode={pode} razao={razao} />)}
            </ul>
          )}
        </section>
      ))}
      <Quadro as="section" titulo="Grupos sem regra" nivel="h3">
        {(dados.grupos || []).length === 0 ? <p className="text-sm text-foreground/75">Os grupos aparecem depois de importar o cadastro de itens.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {ASPECTOS.map((a) => {
              const g = semRegra.get(a) || [];
              return (
                <li key={a} className="space-y-1 border border-foreground/30 bg-card p-2 text-xs">
                  <span className="block font-medium">{ROTULO_ASPECTO[a]}</span>
                  {g.length === 0 ? <Tag tom="ok">Todos os grupos têm regra</Tag> : <><Tag tom="alerta">{g.length} {g.length === 1 ? "grupo pendente" : "grupos pendentes"}</Tag><TextoLongo texto={g.join(", ")} largura="max-w-full" /></>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-foreground/75">Grupo sem regra entra na política como pendência, nunca como regra vigente.</p>
      </Quadro>
    </div>
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
    const ok = await confirmar({ titulo: "Aplicar o modelo?", rotulo: "Aplicar modelo", perigoso: false, descricao: `As regras de "${escolhido?.nome}" entram em rascunho. Regras que o projeto já tem não são duplicadas. Depois, abra cada regra e use Aplicar e reanalisar.` });
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

/** Aba Diretrizes do projeto: cabeçalho, modelo, regras por aspecto, grupos sem regra, Política (PDF) e o formulário da regra. */
export default function Diretrizes({ projeto }) {
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
              <button type="button" className={botaoPrimario} disabled={!pode} title={razao} onClick={() => nova("NOMES")}><Plus className="h-4 w-4" aria-hidden="true" />Adicionar regra</button>
              <AplicarModelo projeto={projeto} pode={pode} razao={razao} aoAplicou={async (m) => { setMsg(m); if (m.tom === "ok") await atualizarTudo(qc, projeto.id); }} />
              <BotaoPolitica projetoId={projeto.id} />
            </div>
            <ListaDeRegras dados={dados} aoAbrir={abrir} aoNova={nova} aoAdotar={pedirAdocao} adotandoId={adotar.isPending ? adotar.variables?.id : null} pode={pode} razao={razao} />
          </div>
        );
      }}
    </Carregar>
  );
}
