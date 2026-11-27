import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, RefreshCw } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { chaves, san } from "./api";
import { SeletorErp, useErps } from "@/components/erps/erps";
import { erpDoRegistro, vinculoErpParaSalvar } from "@/lib/erps";
import { Aviso, BotaoInfo, botaoPrimario, botaoSecundario, campoCls, Quadro, Rotulo, rotuloCompactoCls, SecaoForm, Tag, usePodeAlterar } from "./comuns";
import {
  efeitoDaAtividade, ehAtividadesConfirmadas, ehConflitoVersao, estadoDaTrava, fmtCnae, fmtData, fmtDataHora, mensagemDeErro, motivoDaAtividade, motivoListaVazia,
  regimeDoCliente, REGIMES_CLIENTE, textoBuscaCnpj,
} from "./logica";

/** Origem da atividade numa etiqueta só: "CNPJ · principal", "CNPJ · secundário" ou "Manual". */
export function rotuloDaOrigem(a, projeto) {
  if (a.origem !== "CNPJ") return "Manual";
  const principal = projeto?.cliente?.cnaePrincipal;
  return principal ? `CNPJ · ${String(principal) === String(a.codigo) ? "principal" : "secundário"}` : "CNPJ";
}

const listaDeEstabelecimentos = (p) => (Array.isArray(p?.estabelecimentos) ? p.estabelecimentos : []);

/**
 * Configuração do projeto. Fase 1: ERP, estabelecimentos, responsável, data-base, corte e última escrituração entregue, sem trava.
 * Premissas da Fase 2: regime do cliente (obrigatório) e atividades confirmadas; só as análises da Fase 2 dependem delas.
 * Módulos ainda não disponíveis não aparecem. `parte`: "dados" (só os dados do projeto: Fase 1 > 1.1 Preparar e diretrizes), "premissas" (só as
 * premissas: Fase 2 > 2.1 Premissas e diretrizes) ou as duas (padrão).
 */
/** Rótulo dos campos compactos: mesma altura em todos (com ou sem o botão "i"), para os campos ficarem alinhados. */
const ROT = rotuloCompactoCls;

export default function Configuracao({ projeto, recarregar: recarregarProjeto, parte = "tudo" }) {
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  // O projeto e a liberação das fases andam juntos: regime e atividades mudam o bloqueio da Fase 2.
  const recarregar = () => { recarregarProjeto(); qc.invalidateQueries({ queryKey: chaves.fases(projeto.id) }); };
  const regimeSalvo = projeto.parametros?.regimeCliente ?? "";
  const [regime, setRegime] = useState(regimeSalvo);
  const trava = estadoDaTrava(projeto);
  const { pode, razao } = usePodeAlterar();
  const [form, setForm] = useState(() => ({
    // `erp` do formulário é o texto original (registro histórico); o nome exibido vem do cadastro pelo erp_id (projeto.erp/erp_nome).
    erp: (projeto.erp_texto_original !== undefined ? projeto.erp_texto_original : projeto.erp) ?? "", erp_id: projeto.erp_id ?? null, erp_versao: projeto.erp_versao ?? "", responsavel: projeto.responsavel ?? "",
    estabelecimentos: listaDeEstabelecimentos(projeto).join("\n"), corte: projeto.parametros?.corteMovimentacao ?? "",
    competenciaEntregue: projeto.parametros?.competenciaEntregue ?? "",
  }));
  const [msg, setMsg] = useState(null);
  const [novaAtividade, setNovaAtividade] = useState({ codigo: "", descricao: "" });
  const [infoAberta, setInfoAberta] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const erpsQ = useErps();
  const erps = erpsQ.data || [];
  const erpEscolhido = erpDoRegistro(form, erps).erp;

  const aoFalhar = (err) => {
    setMsg({ tom: "erro", texto: mensagemDeErro(err) });
    if (ehConflitoVersao(err) || ehAtividadesConfirmadas(err)) recarregar(); // traz a versão nova; o que foi digitado fica no formulário
  };
  const aoConcluir = (texto) => () => { setMsg(texto ? { tom: "ok", texto } : null); recarregar(); };

  const salvar = useMutation({
    mutationFn: () => san.configurar(projeto.id, {
      versao: projeto.versao, ...vinculoErpParaSalvar(form, erps, erpsQ.isSuccess), erp_versao: form.erp_versao, responsavel: form.responsavel,
      estabelecimentos: form.estabelecimentos.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      parametros: { ...(projeto.parametros || {}), corteMovimentacao: form.corte || null, competenciaEntregue: form.competenciaEntregue || null },
    }),
    onSuccess: aoConcluir("Configuração salva."), onError: aoFalhar,
  });
  const alternar = useMutation({ mutationFn: ({ id, mantida }) => san.alterarAtividade(projeto.id, id, mantida), onSuccess: aoConcluir(), onError: aoFalhar });
  const acrescentar = useMutation({
    mutationFn: () => san.adicionarAtividade(projeto.id, novaAtividade),
    onSuccess: () => { setNovaAtividade({ codigo: "", descricao: "" }); aoConcluir()(); }, onError: aoFalhar,
  });
  const salvarRegime = useMutation({
    // O regime vai no campo próprio e também dentro dos parâmetros (onde o servidor o guarda), para os outros parâmetros ficarem como estão.
    mutationFn: () => san.configurar(projeto.id, { versao: projeto.versao, regimeCliente: regime, parametros: { ...(projeto.parametros || {}), regimeCliente: regime } }),
    onSuccess: aoConcluir("Regime do cliente salvo."), onError: aoFalhar,
  });
  const confirmarAtividades = useMutation({ mutationFn: () => san.confirmarAtividades(projeto.id, projeto.versao), onSuccess: aoConcluir("Atividades confirmadas. Esta premissa da Fase 2 está registrada."), onError: aoFalhar });
  const reabrir = useMutation({ mutationFn: () => san.reabrirAtividades(projeto.id, projeto.versao), onSuccess: aoConcluir("Atividades reabertas."), onError: aoFalhar });
  const buscarCnpj = useMutation({
    mutationFn: () => san.buscarAtividadesCnpj(projeto.id, projeto.versao),
    onSuccess: (r) => { setMsg({ tom: r?.aviso && !r?.acrescentadas?.length ? "alerta" : "ok", texto: textoBuscaCnpj(r) }); recarregar(); }, onError: aoFalhar,
  });
  const botaoBuscarCnpj = (
    <button type="button" className={botaoSecundario} disabled={!pode || buscarCnpj.isPending} title={razao || "Consulta o CNPJ agora, atualiza os dados públicos do cliente e acrescenta os CNAEs que faltam (nada é apagado)."} onClick={() => buscarCnpj.mutate()}>
      <RefreshCw className="h-4 w-4" aria-hidden="true" />{buscarCnpj.isPending ? "Consultando o CNPJ…" : "Buscar atividades pelo CNPJ"}
    </button>
  );

  const pedirReabertura = async () => {
    const ok = await confirmar({
      titulo: "Reabrir as atividades?", rotulo: "Reabrir",
      descricao: "As análises da Fase 2 (Finalidade, Classificação NCM e Tratamento tributário) ficam bloqueadas até nova confirmação. A importação e a Fase 1 seguem normalmente.\nAs células de Finalidade, Tratamento tributário e Impacto no SPED já trabalhadas ficam marcadas \"revisar\". Nenhuma decisão é apagada.",
    });
    if (ok) reabrir.mutate();
  };

  const atividades = projeto.atividades || [];
  return (
    <div className="space-y-6">
      {msg && <Aviso tom={msg.tom === "erro" || msg.tom === "alerta" ? msg.tom : "ok"}>{msg.texto}</Aviso>}

      {parte !== "premissas" && (
      <SecaoForm titulo="Fase 1 · Dados do projeto" nivel="h2" idTitulo="san-cfg-dados" corpoCls="space-y-2"
        acoes={<button type="button" className={`${botaoPrimario} px-3 py-1 text-sm`} disabled={!pode || salvar.isPending} title={razao} onClick={() => salvar.mutate()}>{salvar.isPending ? "Salvando…" : "Salvar configuração"}</button>}>
        {/* Seis campos numa linha (lg): rótulos de mesma altura (ROT), campos com a mesma classe e margem, alinhados pela base. */}
        <div className="grid items-end gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6" title="Usado pela Fase 1. Não depende das atividades do cliente: importação e análises da Fase 1 ficam sempre disponíveis.">
          <SeletorErp id="san-cfg-erp" rotulo="ERP" compacto classeRotulo={ROT} classeCampo={`${campoCls} mt-1`} registro={form} aoMudar={(v) => setForm((f) => ({ ...f, erp_id: v.erp_id, erp: f.erp || v.erp || "" }))} />
          <label className="block"><span className={ROT}>Versão do ERP</span>{erpEscolhido?.versoes?.length
            ? <select className={`${campoCls} mt-1`} value={form.erp_versao} onChange={set("erp_versao")}><option value="">Selecione a versão</option>{[...erpEscolhido.versoes, ...(form.erp_versao && !erpEscolhido.versoes.includes(form.erp_versao) ? [form.erp_versao] : [])].map((v) => <option key={v} value={v}>{v}</option>)}</select>
            : <input className={`${campoCls} mt-1`} value={form.erp_versao} onChange={set("erp_versao")} />}</label>
          <label className="block"><span className={ROT}>Responsável</span><input className={`${campoCls} mt-1`} value={form.responsavel} onChange={set("responsavel")} /></label>
          <div><span className={ROT} title="Vem do projeto de consultoria.">Data-base</span><p className={`${campoCls} mt-1 bg-muted/40`} title="Vem do projeto de consultoria.">{fmtData(projeto.data_base) || "—"}</p></div>
          <div>
            <span className={ROT}><label htmlFor="san-cfg-corte">Corte de movimentação</label><BotaoInfo id="san-cfg-corte-info" rotulo="Corte de movimentação" pequeno aberto={infoAberta === "corte"} aoAlternar={() => setInfoAberta(infoAberta === "corte" ? null : "corte")} /></span>
            <input id="san-cfg-corte" type="date" className={`${campoCls} mt-1`} value={form.corte} onChange={set("corte")} title="Itens sem movimento desde esta data" />
          </div>
          <div>
            <span className={ROT}><label htmlFor="san-cfg-competencia">Última escrituração entregue (SPED)</label><BotaoInfo id="san-cfg-competencia-info" rotulo="Última escrituração entregue" pequeno aberto={infoAberta === "competencia"} aoAlternar={() => setInfoAberta(infoAberta === "competencia" ? null : "competencia")} /></span>
            <input id="san-cfg-competencia" type="month" className={`${campoCls} mt-1`} value={form.competenciaEntregue} onChange={set("competenciaEntregue")} placeholder="aaaa-mm" />
          </div>
          <label className="block sm:col-span-3 lg:col-span-6"><span className={ROT}>Estabelecimentos (um por linha; vazio = um só)</span>
            <textarea rows={1} className={`${campoCls} mt-1 min-h-[34px] resize-y`} value={form.estabelecimentos} onChange={set("estabelecimentos")} />
          </label>
        </div>
        {infoAberta === "corte" && (
          <p id="san-cfg-corte-info" className="border-l-2 border-border pl-3 text-xs text-muted-foreground">
            Item ativo cuja última movimentação (coluna importada do cadastro) é anterior a esta data é candidato a inativação, na camada Qualidade, por grupo. Sem saldo: propõe inativar. Com saldo: pede regularizar o saldo antes, sem propor inativar. O código que fica numa unificação de códigos não é proposto. Item sem data é tratado à parte. Vazio: o critério não é aplicado, e a Cobertura e o relatório dizem isso. Depois de mudar a data, rode a Qualidade de novo.
          </p>
        )}
        {infoAberta === "competencia" && (
          <p id="san-cfg-competencia-info" className="border-l-2 border-border pl-3 text-xs text-muted-foreground">
            Ajuste com início nesta competência ou antes aparece como “impacto em escrituração já entregue”. Vazio: esse impacto fica “não avaliado” no Excel e no relatório.
          </p>
        )}
      </SecaoForm>
      )}

      {parte !== "dados" && (
      <SecaoForm titulo="Premissas da Fase 2" nivel="h2" idTitulo="san-cfg-fase2">
        <p className="text-sm text-foreground/75">A Fase 2 (tributário e Reforma) começa depois de liberada a versão da Fase 1 (Cadastro saneado), com o regime do cliente informado e as atividades confirmadas. Estas premissas só valem para a Fase 2: a Fase 1 segue sem elas.</p>
        <Quadro titulo="Regime do cliente" nivel="h3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[280px] flex-1"><Rotulo>Regime do cliente no IBS e na CBS (obrigatório para a Fase 2)</Rotulo>
              <select className={campoCls} value={regime} onChange={(e) => setRegime(e.target.value)} disabled={!pode}>
                <option value="">Selecione o regime</option>
                {REGIMES_CLIENTE.map((r) => <option key={r.codigo} value={r.codigo}>{r.rotulo}</option>)}
              </select>
            </label>
            <button type="button" className={botaoPrimario} disabled={!pode || !regime || regime === regimeSalvo || salvarRegime.isPending} title={razao} onClick={() => salvarRegime.mutate()}>{salvarRegime.isPending ? "Salvando…" : "Salvar o regime"}</button>
          </div>
          {regimeDoCliente(regime) ? <p className="text-xs text-foreground/75">Fundamento: {regimeDoCliente(regime).fundamento}.</p>
            : <p className="text-xs text-foreground/75">Sem o regime, as análises da Fase 2 ficam bloqueadas.</p>}
          {regime !== regimeSalvo && regimeSalvo && <p className="text-xs text-foreground/75">Regime salvo: {regimeDoCliente(regimeSalvo)?.rotulo || regimeSalvo}. Clique em Salvar o regime para trocar.</p>}
        </Quadro>
        <Quadro titulo="Atividades do cliente" nivel="h3" acoes={atividades.length > 0 ? botaoBuscarCnpj : null}>
        <p className="text-sm text-foreground/75">Vêm do CNAE principal e dos secundários do CNPJ. Mantenha as que o cliente realmente exerce, exclua as outras e acrescente as que faltam. Só a Fase 2 depende desta confirmação (a finalidade sugerida e o tratamento tributário leem as atividades); a importação e a Fase 1 seguem sem ela. “Buscar atividades pelo CNPJ” consulta a Receita agora e acrescenta os CNAEs que faltam, sem apagar nada.</p>
        {trava.revisarAtividades && <Aviso tom="alerta" titulo="Revisar atividades">Os dados do CNPJ do cliente mudaram depois que o projeto foi aberto. Confira se as atividades abaixo ainda valem; o que já foi feito não é bloqueado.</Aviso>}
        {trava.confirmada && (
          <Aviso tom="ok" titulo="Atividades confirmadas" acao={<button type="button" className={botaoSecundario} onClick={pedirReabertura} disabled={!pode || reabrir.isPending} title={razao}>Reabrir para alterar</button>}>
            Por {projeto.atividades_confirmadas_por || "—"} em {fmtDataHora(projeto.atividades_confirmadas_em)}.
          </Aviso>
        )}
        {atividades.length === 0 ? (
          <Aviso tom="alerta" titulo="Nenhuma atividade na lista" acao={projeto.cliente?.tipoDocumento === "PF" ? null : botaoBuscarCnpj}>
            {motivoListaVazia(projeto)}
          </Aviso>
        ) : (
          <table className="w-full border border-foreground/30 text-sm" aria-label="Atividades do cliente">
            <thead><tr className="border-b border-foreground/50 bg-primary/10 text-left text-xs font-medium text-foreground/80"><th scope="col" className="w-16 px-2 py-1.5">Manter</th><th scope="col" className="px-2">Código</th><th scope="col" className="px-2">Descrição</th><th scope="col" className="px-2">Origem</th>{projeto.mapaAtividades && <th scope="col" className="px-2">Efeito nas sugestões</th>}</tr></thead>
            <tbody>
              {atividades.map((a) => (
                <tr key={a.id} className={`border-b border-foreground/20 last:border-b-0 ${a.mantida ? "" : "text-muted-foreground"}`}>
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={!!a.mantida} disabled={!pode || !trava.editavel || alternar.isPending} title={razao} aria-label={`${a.mantida ? "Excluir" : "Manter"} a atividade ${a.codigo}`} onChange={() => alternar.mutate({ id: a.id, mantida: !a.mantida })} />
                  </td>
                  <td className="px-2 tabular-nums">{fmtCnae(a.codigo)}</td>
                  <td className={a.mantida ? "px-2" : "px-2 line-through"}>{a.descricao}{!a.mantida && <Tag className="ml-2">excluída</Tag>}</td>
                  <td className="px-2">
                    <Tag tom={a.origem === "CNPJ" ? "info" : "neutro"}>{rotuloDaOrigem(a, projeto)}</Tag>
                  </td>
                  {projeto.mapaAtividades && (
                    <td className="px-2 text-xs">
                      {a.mantida ? (efeitoDaAtividade(projeto.mapaAtividades, a.codigo) || "—") : "—"}
                      {a.mantida && motivoDaAtividade(projeto.mapaAtividades, a.codigo) && <span className="block text-foreground/75">{motivoDaAtividade(projeto.mapaAtividades, a.codigo)}</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {trava.editavel && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); acrescentar.mutate(); }}>
            {Array.isArray(projeto.listaAtividades) && projeto.listaAtividades.length > 0 && (
              <label className="block"><Rotulo>Da lista de atividades</Rotulo>
                <select className={`${campoCls} w-64`} value={projeto.listaAtividades.some((x) => x.codigo === novaAtividade.codigo) ? novaAtividade.codigo : ""}
                  onChange={(e) => { const x = projeto.listaAtividades.find((l) => l.codigo === e.target.value); setNovaAtividade(x ? { codigo: x.codigo, descricao: x.rotulo } : { codigo: "", descricao: "" }); }}>
                  <option value="">Escolha (ou digite um CNAE ao lado)</option>
                  {projeto.listaAtividades.filter((x) => !atividades.some((a) => a.codigo === x.codigo && a.mantida)).map((x) => <option key={x.codigo} value={x.codigo}>{x.rotulo}</option>)}
                </select>
              </label>
            )}
            <label className="block"><Rotulo>Código (CNAE ou outro)</Rotulo><input className={`${campoCls} w-40`} value={novaAtividade.codigo} onChange={(e) => setNovaAtividade((n) => ({ ...n, codigo: e.target.value }))} /></label>
            <label className="block min-w-[220px] flex-1"><Rotulo>Descrição</Rotulo><input className={campoCls} value={novaAtividade.descricao} onChange={(e) => setNovaAtividade((n) => ({ ...n, descricao: e.target.value }))} /></label>
            <button type="submit" className={botaoSecundario} disabled={!pode || acrescentar.isPending || !novaAtividade.codigo.trim() || !novaAtividade.descricao.trim()}><Plus className="h-4 w-4" aria-hidden="true" />Acrescentar</button>
          </form>
        )}
        {trava.editavel && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={botaoPrimario} disabled={!pode || !trava.podeConfirmar || confirmarAtividades.isPending} title={razao} onClick={() => confirmarAtividades.mutate()}>
              <Lock className="h-4 w-4" aria-hidden="true" />{confirmarAtividades.isPending ? "Confirmando…" : "Confirmo as atividades"}
            </button>
            {trava.motivoSemConfirmar && <span className="text-sm text-muted-foreground">{trava.motivoSemConfirmar}</span>}
            <span className="text-xs text-muted-foreground">Registra quem confirmou e quando.</span>
          </div>
        )}
        </Quadro>
      </SecaoForm>
      )}
    </div>
  );
}
