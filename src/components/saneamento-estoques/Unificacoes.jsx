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
const COLUNAS = [
  { chave: "tipo", rotulo: "Tipo", largura: 190, fixa: true, valor: (l) => l.rotuloTipo || TIPOS_MAPA[l.tipo] || l.tipo },
  { chave: "morre", rotulo: "Código que morre", largura: 124, fixa: true, valor: (l) => l.morre?.codigo || "", render: (l) => <span className="block truncate font-medium tabular-nums" title={l.morre?.codigo}>{l.morre?.codigo || "—"}</span> },
  { chave: "estab", rotulo: "Estabelecimento", largura: 110, valor: (l) => l.morre?.estab || "" },
  { chave: "morreDescricao", rotulo: "Descrição (morre)", largura: 240, valor: (l) => l.morre?.descricao || "", render: (l) => longo(l.morre?.descricao) },
  { chave: "morreUnidade", rotulo: "Unidade (morre)", largura: 96, valor: (l) => l.morre?.unidade || "" },
  { chave: "morreSaldo", rotulo: "Saldo (morre)", largura: 110, alinhar: "direita", valor: (l) => fmtSaldo(l.morre?.saldo) },
  { chave: "fica", rotulo: "Código que fica", largura: 124, valor: (l) => l.fica?.codigo || "", render: (l) => <span className="block truncate font-medium tabular-nums" title={l.fica?.codigo}>{l.fica?.codigo || "—"}</span> },
  { chave: "ficaDescricao", rotulo: "Descrição (fica)", largura: 240, valor: (l) => l.fica?.descricao || "", render: (l) => longo(l.fica?.descricao) },
  { chave: "ficaUnidade", rotulo: "Unidade (fica)", largura: 96, valor: (l) => l.fica?.unidade || "" },
  { chave: "ficaSaldo", rotulo: "Saldo atual (fica)", largura: 124, alinhar: "direita", valor: (l) => fmtSaldo(l.fica?.saldo) },
  { chave: "saldoEntra", rotulo: "Saldo que entra", largura: 120, alinhar: "direita", valor: (l) => fmtSaldo(l.saldoEntra) },
  { chave: "saldoConsolidado", rotulo: "Saldo consolidado", largura: 130, alinhar: "direita", valor: (l) => fmtSaldo(l.saldoConsolidado) },
  { chave: "situacao", rotulo: "Situação", largura: 170, valor: (l) => SITUACOES_MAPA[l.situacao] || l.situacao, render: (l) => <SeloTexto situacao={l.situacao}>{SITUACOES_MAPA[l.situacao] || l.situacao}</SeloTexto> },
  { chave: "acao", rotulo: "Ação no ERP", largura: 300, valor: (l) => l.acao || "", render: (l) => longo(l.acao) },
  { chave: "inicio", rotulo: "Início da vigência", largura: 124, valor: (l) => fmtData(l.inicio) },
  { chave: "alertas", rotulo: "Alerta de coerência", largura: 300, valor: (l) => (l.alertas || []).join(" "), render: (l) => longo((l.alertas || []).join(" ")) },
  { chave: "justificativa", rotulo: "Justificativa", largura: 260, valor: (l) => l.justificativa || "", render: (l) => longo(l.justificativa) },
];

/**
 * Unificações: quais códigos morrem, para onde vão e com que saldo (e as inativações por falta de movimento). É a lista que se manda para
 * quem faz os ajustes no ERP; o mesmo conteúdo da aba "De para e equivalências" do Excel. Somente leitura (as decisões ficam nos casos).
 */
export default function Unificacoes({ projeto }) {
  const perfilErp = usePerfilErp(projeto.erp_id).data;
  const [filtro, setFiltro] = useState({ situacao: "", tipo: "", busca: "", pagina: 1 });
  const [busca, setBusca] = useState("");
  const consulta = useQuery({ queryKey: chaves.unificacoes(projeto.id, filtro), queryFn: () => san.unificacoes(projeto.id, filtro), placeholderData: keepPreviousData });
  const [erro, setErro] = useState(null);
  const baixar = useMutation({ mutationFn: () => san.baixarUnificacoes(projeto.id, filtro), onSuccess: () => setErro(null), onError: (e) => setErro(mensagemDeErro(e, "Não foi possível gerar o Excel agora.")) });
  const mudar = (k, v) => setFiltro((f) => ({ ...f, [k]: v, pagina: 1 }));
  const botao = (ativo) => `border px-2.5 py-1 text-sm ${ativo ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`;

  return (
    <section aria-labelledby="san-unif" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="san-unif" className="font-semibold">Unificações e inativações</h2>
          <p className="text-sm text-muted-foreground">Cada linha é um código que deixa de existir: para onde vai o saldo, o saldo que fica concentrado e o que fazer no ERP. As decisões são tomadas nos casos (Duplicidades e Qualidade).</p>
          <p className="text-sm text-muted-foreground">{perfilEspecifico(perfilErp) ? <>A coluna “Ação no ERP” segue o perfil do <b>{perfilErp.nome}</b> (Cadastro de ERPs) quando ele tem o procedimento do ajuste.</> : "A coluna “Ação no ERP” traz o procedimento geral: o ERP do projeto não tem perfil desenvolvido no Cadastro de ERPs."}</p>
        </div>
        <button type="button" className={botaoSecundario} disabled={baixar.isPending} onClick={() => baixar.mutate()} aria-label="Baixar esta lista em Excel">
          <Download className="h-4 w-4" aria-hidden="true" />{baixar.isPending ? "Gerando…" : "Baixar lista (Excel)"}
        </button>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Carregar consulta={consulta} textoErro="Não foi possível carregar as unificações." tituloVazio="Nenhuma unificação nem inativação ainda"
        vazio={(d) => (d.totalGeral ? null : "As linhas aparecem quando a camada Duplicidades propõe unificar códigos ou a camada Qualidade propõe inativar itens sem movimentação desde o corte.")}>
        {(d) => (
          <>
            {d.corteDefinido === false && <Aviso tom="alerta">O corte de movimentação não está definido na Configuração: os itens sem movimentação a longa data não foram avaliados para inativação.</Aviso>}
            <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Filtrar por situação">
              <button type="button" aria-pressed={filtro.situacao === ""} onClick={() => mudar("situacao", "")} className={botao(filtro.situacao === "")}>Todas ({Number(d.totalGeral).toLocaleString("pt-BR")})</button>
              {Object.entries(SITUACOES_MAPA).map(([k, v]) => (
                <button key={k} type="button" aria-pressed={filtro.situacao === k} onClick={() => mudar("situacao", filtro.situacao === k ? "" : k)} className={botao(filtro.situacao === k)}>{v} ({Number(d.porSituacao?.[k] || 0).toLocaleString("pt-BR")})</button>
              ))}
            </div>
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); mudar("busca", busca); }}>
              <label className="block"><Rotulo>Tipo</Rotulo>
                <select className={`${campoCls} w-60`} value={filtro.tipo} onChange={(e) => mudar("tipo", e.target.value)}>
                  <option value="">Todos</option>
                  {Object.entries(TIPOS_MAPA).map(([k, v]) => <option key={k} value={k}>{v} ({Number(d.porTipo?.[k] || 0).toLocaleString("pt-BR")})</option>)}
                </select>
              </label>
              <label className="block"><Rotulo>Código (que morre ou que fica)</Rotulo><input className={`${campoCls} w-48`} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
              <button type="submit" className={botaoSecundario}>Buscar</button>
              {(filtro.situacao || filtro.tipo || filtro.busca) && <button type="button" className={botaoSecundario} onClick={() => { setBusca(""); setFiltro({ situacao: "", tipo: "", busca: "", pagina: 1 }); }}>Limpar filtros</button>}
            </form>
            {d.escalaSaldo > 1 && <p className="text-sm text-muted-foreground">A base traz o saldo multiplicado por {Number(d.escalaSaldo).toLocaleString("pt-BR")}: os saldos desta lista já estão divididos (a mesma regra da camada Duplicidades).</p>}
            {d.comAlerta > 0 && <p className="text-sm text-muted-foreground">{Number(d.comAlerta).toLocaleString("pt-BR")} linha(s) com alerta de coerência (unidade diferente, fator sem direção, saldo não informado, código que fica fora do estabelecimento ou com inativação): conferir antes de ajustar o ERP.</p>}
            <TabelaDensa id="saneamento-estoques-unificacoes" ariaLabel="Unificações e inativações" colunas={COLUNAS} linhas={d.linhas} chaveLinha={(l, i) => `${l.casoId || "v"}-${l.morre?.codigo || ""}-${l.morre?.estab || ""}-${i}`} vazio="Nenhuma linha neste filtro."
              contador={`Linhas ${d.total ? ((d.pagina - 1) * d.limite + 1).toLocaleString("pt-BR") : 0} a ${Math.min(d.pagina * d.limite, d.total).toLocaleString("pt-BR")} de ${Number(d.total).toLocaleString("pt-BR")}${filtro.situacao || filtro.tipo || filtro.busca ? " com estes filtros" : ""}.`} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Página {Number(d.pagina).toLocaleString("pt-BR")} de {Math.max(1, Math.ceil(Number(d.total) / d.limite)).toLocaleString("pt-BR")}</span>
              <button type="button" className={botaoSecundario} disabled={d.pagina <= 1} onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina - 1 }))}>Anterior</button>
              <button type="button" className={botaoSecundario} disabled={d.pagina * d.limite >= d.total} onClick={() => setFiltro((f) => ({ ...f, pagina: f.pagina + 1 }))}>Próxima</button>
            </div>
          </>
        )}
      </Carregar>
    </section>
  );
}
