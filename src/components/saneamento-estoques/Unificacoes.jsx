import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { usePerfilErp } from "@/components/erps/erps";
import { perfilEspecifico } from "@/lib/erps";
import { chaves, san } from "./api";
import TabelaDensa from "./TabelaDensa";
import { Aviso, botaoSecundario, campoCls, Carregar, Rotulo, SeloTexto, TextoLongo } from "./comuns";
import { fmtData, fmtSaldo, mensagemDeErro, SITUACOES_MAPA, TIPOS_MAPA } from "./logica";

const longo = (texto) => <TextoLongo texto={texto} largura="max-w-full" />;
const num = (n) => Number(n || 0).toLocaleString("pt-BR");
const codigo = (v) => <span className="block truncate font-medium tabular-nums" title={v}>{v || "—"}</span>;

/** Colunas comuns às listas: situação, ação no ERP, vigência, alerta e justificativa. */
const situacao = { chave: "situacao", rotulo: "Situação", largura: 170, valor: (l) => SITUACOES_MAPA[l.situacao] || l.situacao, render: (l) => <SeloTexto situacao={l.situacao}>{SITUACOES_MAPA[l.situacao] || l.situacao}</SeloTexto> };
const acao = { chave: "acao", rotulo: "Ação no ERP", largura: 300, valor: (l) => l.acao || "", render: (l) => longo(l.acao) };
const inicio = { chave: "inicio", rotulo: "Início da vigência", largura: 124, valor: (l) => fmtData(l.inicio) };
const alertas = { chave: "alertas", rotulo: "Alerta de coerência", largura: 300, valor: (l) => (l.alertas || []).join(" "), render: (l) => longo((l.alertas || []).join(" ")) };
const justificativa = { chave: "justificativa", rotulo: "Justificativa", largura: 260, valor: (l) => l.justificativa || "", render: (l) => longo(l.justificativa) };
const estab = { chave: "estab", rotulo: "Estabelecimento", largura: 110, valor: (l) => l.morre?.estab || "" };

/**
 * As três listas do mapa, cada uma com as colunas que usa (o mesmo do Excel da lista): Unificações (o código que sai, o que fica e os saldos;
 * também as trocas de código), Inativações (o código, a origem e o saldo) e Equivalências (os códigos relacionados; nenhum código sai).
 */
export const LISTAS_MAPA = [
  {
    id: "UNIFICACOES", rotulo: "Unificações", tipos: "UNIFICACAO,TROCA_CODIGO", vazio: "Nenhuma unificação neste filtro.",
    explica: "Cada linha é um código que sai: para qual código vai, o saldo que entra e o saldo que fica concentrado. Sem saldo no código que sai, a ação é só inativá-lo.",
    colunas: [
      { chave: "tipo", rotulo: "Tipo", largura: 170, fixa: true, valor: (l) => l.rotuloTipo || TIPOS_MAPA[l.tipo] || l.tipo },
      { chave: "morre", rotulo: "Código que sai", largura: 124, fixa: true, valor: (l) => l.morre?.codigo || "", render: (l) => codigo(l.morre?.codigo) },
      estab,
      { chave: "morreDescricao", rotulo: "Descrição (sai)", largura: 240, valor: (l) => l.morre?.descricao || "", render: (l) => longo(l.morre?.descricao) },
      { chave: "morreUnidade", rotulo: "Unidade (sai)", largura: 96, valor: (l) => l.morre?.unidade || "" },
      { chave: "morreSaldo", rotulo: "Saldo (sai)", largura: 110, alinhar: "direita", valor: (l) => fmtSaldo(l.morre?.saldo) },
      { chave: "fica", rotulo: "Código que fica", largura: 124, valor: (l) => l.fica?.codigo || "", render: (l) => codigo(l.fica?.codigo) },
      { chave: "ficaDescricao", rotulo: "Descrição (fica)", largura: 240, valor: (l) => l.fica?.descricao || "", render: (l) => longo(l.fica?.descricao) },
      { chave: "ficaUnidade", rotulo: "Unidade (fica)", largura: 96, valor: (l) => l.fica?.unidade || "" },
      { chave: "ficaSaldo", rotulo: "Saldo atual (fica)", largura: 124, alinhar: "direita", valor: (l) => fmtSaldo(l.fica?.saldo) },
      { chave: "saldoEntra", rotulo: "Saldo que entra", largura: 120, alinhar: "direita", valor: (l) => fmtSaldo(l.saldoEntra) },
      { chave: "saldoConsolidado", rotulo: "Saldo consolidado", largura: 130, alinhar: "direita", valor: (l) => fmtSaldo(l.saldoConsolidado) },
      situacao, acao, inicio, alertas, justificativa,
    ],
  },
  {
    id: "INATIVACOES", rotulo: "Inativações", tipos: "INATIVACAO", vazio: "Nenhuma inativação neste filtro.",
    explica: "Cada linha é um código a inativar sem unificação: sem movimentação desde o corte (Qualidade) ou duplicado sem código que o receba (Duplicidades).",
    colunas: [
      { chave: "origem", rotulo: "Origem", largura: 190, fixa: true, valor: (l) => l.rotuloTipo || TIPOS_MAPA[l.tipo] || l.tipo },
      { chave: "morre", rotulo: "Código", largura: 124, fixa: true, valor: (l) => l.morre?.codigo || "", render: (l) => codigo(l.morre?.codigo) },
      estab,
      { chave: "descricao", rotulo: "Descrição", largura: 280, valor: (l) => l.morre?.descricao || "", render: (l) => longo(l.morre?.descricao) },
      { chave: "unidade", rotulo: "Unidade", largura: 90, valor: (l) => l.morre?.unidade || "" },
      { chave: "saldo", rotulo: "Saldo", largura: 110, alinhar: "direita", valor: (l) => fmtSaldo(l.morre?.saldo) },
      situacao, acao, inicio, alertas, justificativa,
    ],
  },
  {
    id: "EQUIVALENCIAS", rotulo: "Equivalências", tipos: "EQUIVALENCIA", vazio: "Nenhuma equivalência neste filtro.",
    explica: "Códigos relacionados que continuam todos ativos (apresentações, equivalentes ou mantidos distintos): nenhum código sai.",
    colunas: [
      { chave: "codigos", rotulo: "Códigos relacionados", largura: 320, fixa: true, valor: (l) => l.fica?.codigo || "", render: (l) => longo(l.fica?.codigo) },
      { ...acao, rotulo: "Ação" }, situacao, justificativa,
    ],
  },
];

const ORIGEM_INATIVACAO = { DUPLICIDADE: "duplicidade", QUALIDADE: "sem movimentação" };
/** Texto do par em conflito: a unificação (sai → fica) e a inativação do código que fica. */
export function textoDoConflito(c) {
  const unif = `${c.sai} → ${c.fica} (unificação ${String(SITUACOES_MAPA[c.situacaoUnificacao] || c.situacaoUnificacao).toLowerCase()})`;
  if (c.inativacao?.situacao === "INATIVO_NA_BASE") return `${unif} × ${c.fica} já está inativo no cadastro`;
  const origem = ORIGEM_INATIVACAO[c.inativacao?.origem] ? `, ${ORIGEM_INATIVACAO[c.inativacao.origem]}` : "";
  return `${unif} × inativação ${String(SITUACOES_MAPA[c.inativacao?.situacao] || "").toLowerCase()} de ${c.inativacao?.codigo}${origem}`;
}
const MAX_CONFLITOS_NA_TELA = 20;

function Conflitos({ conflitos = [], total = 0 }) {
  if (!conflitos.length) return null;
  const n = Math.max(total, conflitos.length);
  return (
    <Aviso tom="erro" titulo={`${num(n)} ${n === 1 ? "conflito" : "conflitos"} entre unificação e inativação`}>
      <p>O código que fica numa unificação também tem inativação. Rejeitar ou reabrir um dos dois casos antes de ajustar o ERP.</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5" aria-label="Pares em conflito">
        {conflitos.slice(0, MAX_CONFLITOS_NA_TELA).map((c) => <li key={`${c.sai}-${c.fica}-${c.inativacao?.codigo}`} className="tabular-nums">{textoDoConflito(c)}</li>)}
      </ul>
      {n > MAX_CONFLITOS_NA_TELA && <p className="mt-1">E mais {num(n - MAX_CONFLITOS_NA_TELA)}: a lista completa está na aba “Conflitos” do Excel.</p>}
    </Aviso>
  );
}

/**
 * Unificações, inativações e equivalências: o que sai, para onde vai e com que saldo, o que só se inativa e o que fica relacionado. É a lista
 * que se manda para quem faz os ajustes no ERP (o Excel traz uma aba por lista e os conflitos). Somente leitura: as decisões ficam nos casos.
 */
export default function Unificacoes({ projeto }) {
  const perfilErp = usePerfilErp(projeto.erp_id).data;
  const [lista, setLista] = useState(LISTAS_MAPA[0].id);
  const atual = LISTAS_MAPA.find((x) => x.id === lista) || LISTAS_MAPA[0];
  const [filtro, setFiltro] = useState({ situacao: "", tipo: LISTAS_MAPA[0].tipos, busca: "", pagina: 1 });
  const [busca, setBusca] = useState("");
  const consulta = useQuery({ queryKey: chaves.unificacoes(projeto.id, filtro), queryFn: () => san.unificacoes(projeto.id, filtro), placeholderData: keepPreviousData });
  const [erro, setErro] = useState(null);
  const baixar = useMutation({ mutationFn: () => san.baixarUnificacoes(projeto.id, { ...filtro, tipo: "" }), onSuccess: () => setErro(null), onError: (e) => setErro(mensagemDeErro(e, "Não foi possível gerar o Excel agora.")) });
  const mudar = (k, v) => setFiltro((f) => ({ ...f, [k]: v, pagina: 1 }));
  const trocarLista = (id) => { const l = LISTAS_MAPA.find((x) => x.id === id); setLista(id); setFiltro((f) => ({ ...f, tipo: l.tipos, pagina: 1 })); };
  const botao = (ativo) => `border px-2.5 py-1 text-sm ${ativo ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`;

  return (
    <section aria-labelledby="san-unif" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="san-unif" className="font-semibold">Unificações, inativações e equivalências</h2>
          <p className="text-sm text-muted-foreground">O que fazer no ERP com cada código. As decisões são tomadas nos casos (Duplicidades e Qualidade).</p>
          <p className="text-sm text-muted-foreground">{perfilEspecifico(perfilErp) ? <>A coluna “Ação no ERP” segue o perfil do <b>{perfilErp.nome}</b> (Cadastro de ERPs) quando ele tem o procedimento do ajuste.</> : "A coluna “Ação no ERP” traz o procedimento geral: o ERP do projeto não tem perfil desenvolvido no Cadastro de ERPs."}</p>
        </div>
        <button type="button" className={botaoSecundario} disabled={baixar.isPending} onClick={() => baixar.mutate()} aria-label="Baixar as três listas em Excel">
          <Download className="h-4 w-4" aria-hidden="true" />{baixar.isPending ? "Gerando…" : "Baixar listas (Excel)"}
        </button>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Carregar consulta={consulta} textoErro="Não foi possível carregar as unificações." tituloVazio="Nenhuma unificação nem inativação ainda"
        vazio={(d) => (d.totalGeral ? null : "As linhas aparecem quando a camada Duplicidades propõe unificar ou relacionar códigos ou a camada Qualidade propõe inativar itens sem movimentação desde o corte.")}>
        {(d) => {
          const semEstab = (d.linhas || []).every((l) => !l.morre?.estab);
          const colunas = semEstab ? atual.colunas.filter((c) => c.chave !== "estab") : atual.colunas;
          return (
            <>
              <Conflitos conflitos={d.conflitos} total={d.totalConflitos} />
              {d.corteDefinido === false && <Aviso tom="alerta">O corte de movimentação não está definido na Configuração: os itens sem movimentação a longa data não foram avaliados para inativação.</Aviso>}
              <div className="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="Listas">
                {LISTAS_MAPA.map((l) => (
                  <button key={l.id} type="button" role="tab" aria-selected={lista === l.id} onClick={() => trocarLista(l.id)}
                    className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${lista === l.id ? "border-primary font-semibold" : "border-transparent hover:bg-muted"}`}>
                    {l.rotulo} ({num(d.porLista?.[l.id])})
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{atual.explica}</p>
              <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Filtrar por situação">
                <button type="button" aria-pressed={filtro.situacao === ""} onClick={() => mudar("situacao", "")} className={botao(filtro.situacao === "")}>Todas as situações</button>
                {Object.entries(SITUACOES_MAPA).filter(([k]) => d.porSituacao?.[k]).map(([k, v]) => (
                  <button key={k} type="button" aria-pressed={filtro.situacao === k} onClick={() => mudar("situacao", filtro.situacao === k ? "" : k)} className={botao(filtro.situacao === k)}>{v}</button>
                ))}
              </div>
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); mudar("busca", busca); }}>
                <label className="block"><Rotulo>Código</Rotulo><input className={`${campoCls} w-48`} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
                <button type="submit" className={botaoSecundario}>Buscar</button>
                {(filtro.situacao || filtro.busca) && <button type="button" className={botaoSecundario} onClick={() => { setBusca(""); setFiltro((f) => ({ ...f, situacao: "", busca: "", pagina: 1 })); }}>Limpar filtros</button>}
              </form>
              {d.escalaSaldo > 1 && lista !== "EQUIVALENCIAS" && <p className="text-sm text-muted-foreground">A base traz o saldo multiplicado por {num(d.escalaSaldo)}: os saldos desta lista já estão divididos (a mesma regra da camada Duplicidades).</p>}
              {d.comAlerta > 0 && lista !== "EQUIVALENCIAS" && <p className="text-sm text-muted-foreground">{num(d.comAlerta)} linha(s) com alerta de coerência (unidade diferente, fator sem direção, saldo não informado, código que fica fora do estabelecimento ou com inativação): conferir antes de ajustar o ERP.</p>}
              <TabelaDensa id={`saneamento-estoques-unificacoes-${atual.id.toLowerCase()}`} ariaLabel={atual.rotulo} colunas={colunas} linhas={d.linhas} chaveLinha={(l, i) => `${l.casoId || "v"}-${l.morre?.codigo || ""}-${l.morre?.estab || ""}-${i}`} vazio={atual.vazio}
                contador={`Linhas ${d.total ? ((d.pagina - 1) * d.limite + 1).toLocaleString("pt-BR") : 0} a ${Math.min(d.pagina * d.limite, d.total).toLocaleString("pt-BR")} de ${num(d.total)}${filtro.situacao || filtro.busca ? " com estes filtros" : ""}.`} />
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Página {num(d.pagina)} de {Math.max(1, Math.ceil(Number(d.total) / d.limite)).toLocaleString("pt-BR")}</span>
                <button type="button" className={botaoSecundario} disabled={d.pagina <= 1} onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina - 1 }))}>Anterior</button>
                <button type="button" className={botaoSecundario} disabled={d.pagina * d.limite >= d.total} onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina + 1 }))}>Próxima</button>
              </div>
            </>
          );
        }}
      </Carregar>
    </section>
  );
}
