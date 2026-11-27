import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Plus, RefreshCw } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { san } from "./api";
import { SeletorErp, useErps } from "@/components/erps/erps";
import { erpDoRegistro, vinculoErpParaSalvar } from "@/lib/erps";
import { Aviso, BotaoInfo, botaoPrimario, botaoSecundario, campoCls, Rotulo, SecaoForm, Tag, usePodeAlterar } from "./comuns";
import {
  efeitoDaAtividade, ehAtividadesConfirmadas, ehConflitoVersao, estadoDaTrava, fmtCnae, fmtData, fmtDataHora, mensagemDeErro, motivoDaAtividade, motivoListaVazia,
  MODULOS_OPCIONAIS, textoBuscaCnpj,
} from "./logica";

const listaDeEstabelecimentos = (p) => (Array.isArray(p?.estabelecimentos) ? p.estabelecimentos : []);

/** Configuração do projeto: ERP, estabelecimentos, responsável, data-base, corte, atividades com a trava e módulos opcionais. */
export default function Configuracao({ projeto, recarregar }) {
  const confirmar = useConfirmar();
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
  const confirmarAtividades = useMutation({ mutationFn: () => san.confirmarAtividades(projeto.id, projeto.versao), onSuccess: aoConcluir("Atividades confirmadas. A importação e as análises estão liberadas."), onError: aoFalhar });
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
      descricao: "Importação e análises voltam a ficar bloqueadas até nova confirmação.\nAs células de Grupos e finalidade, Tratamento tributário e Impacto nas obrigações já trabalhadas ficam marcadas \"revisar\". Nenhuma decisão é apagada.",
    });
    if (ok) reabrir.mutate();
  };

  const atividades = projeto.atividades || [];
  return (
    <div className="space-y-6">
      {msg && <Aviso tom={msg.tom === "erro" || msg.tom === "alerta" ? msg.tom : "ok"}>{msg.texto}</Aviso>}

      <SecaoForm titulo="Dados do projeto" nivel="h2" idTitulo="san-cfg-dados">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><SeletorErp id="san-cfg-erp" rotulo="ERP (do cadastro do cliente; pode trocar para este trabalho)" registro={form} aoMudar={(v) => setForm((f) => ({ ...f, erp_id: v.erp_id, erp: f.erp || v.erp || "" }))} /></div>
          <label className="block"><Rotulo>Versão do ERP</Rotulo>{erpEscolhido?.versoes?.length
            ? <select className={campoCls} value={form.erp_versao} onChange={set("erp_versao")}><option value="">Selecione a versão</option>{[...erpEscolhido.versoes, ...(form.erp_versao && !erpEscolhido.versoes.includes(form.erp_versao) ? [form.erp_versao] : [])].map((v) => <option key={v} value={v}>{v}</option>)}</select>
            : <input className={campoCls} value={form.erp_versao} onChange={set("erp_versao")} />}</label>
          <label className="block"><Rotulo>Responsável</Rotulo><input className={campoCls} value={form.responsavel} onChange={set("responsavel")} /></label>
          <div><Rotulo>Data-base</Rotulo><p className="py-1.5 text-sm">{fmtData(projeto.data_base) || "—"}</p><p className="text-xs text-foreground/75">Vem do projeto de consultoria.</p></div>
          <label className="block sm:col-span-2"><Rotulo>Estabelecimentos (um por linha; vazio = um só)</Rotulo>
            <textarea className={`${campoCls} min-h-[72px]`} value={form.estabelecimentos} onChange={set("estabelecimentos")} />
          </label>
          <div>
            <div className="flex items-center gap-2">
              <label htmlFor="san-cfg-corte" className="block"><Rotulo className="mb-0">Corte de movimentação (itens sem movimento desde esta data)</Rotulo></label>
              <BotaoInfo id="san-cfg-corte-info" rotulo="Corte de movimentação" aberto={infoAberta === "corte"} aoAlternar={() => setInfoAberta(infoAberta === "corte" ? null : "corte")} />
            </div>
            <input id="san-cfg-corte" type="date" className={`${campoCls} mt-1`} value={form.corte} onChange={set("corte")} />
            {infoAberta === "corte" && (
              <p id="san-cfg-corte-info" className="mt-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                Item ativo cuja última movimentação (coluna importada do cadastro) é anterior a esta data é candidato a inativação, na camada Qualidade, por grupo. Sem saldo: propõe inativar. Com saldo: pede regularizar o saldo antes, sem propor inativar. O código que fica numa unificação de códigos não é proposto. Item sem data é tratado à parte. Vazio: o critério não é aplicado, e a Cobertura e o relatório dizem isso. Depois de mudar a data, rode a Qualidade de novo.
              </p>
            )}
          </div>
          <label className="block"><Rotulo>Última competência de escrituração já entregue (SPED)</Rotulo>
            <input type="month" className={campoCls} value={form.competenciaEntregue} onChange={set("competenciaEntregue")} placeholder="aaaa-mm" />
            <span className="mt-1 block text-xs text-foreground/75">Ajuste com início nesta competência ou antes aparece como “impacto em escrituração já entregue”. Vazio: esse impacto fica “não avaliado” no Excel e no relatório.</span>
          </label>
        </div>
        <button type="button" className={botaoPrimario} disabled={!pode || salvar.isPending} title={razao} onClick={() => salvar.mutate()}>{salvar.isPending ? "Salvando…" : "Salvar configuração"}</button>
      </SecaoForm>

      <SecaoForm titulo="Atividades do cliente" nivel="h2" idTitulo="san-cfg-ativ" acoes={atividades.length > 0 ? botaoBuscarCnpj : null}>
        <p className="text-sm text-foreground/75">Vêm do CNAE principal e dos secundários do CNPJ. Mantenha as que o cliente realmente exerce, exclua as outras e acrescente as que faltam. Sem esta confirmação não há importação nem análise. “Buscar atividades pelo CNPJ” consulta a Receita agora e acrescenta os CNAEs que faltam, sem apagar nada.</p>
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
                    <Tag tom={a.origem === "CNPJ" ? "info" : "neutro"}>{a.origem === "CNPJ" ? "CNPJ" : "Manual"}</Tag>
                    {a.origem === "CNPJ" && projeto.cliente?.cnaePrincipal && <span className="ml-1 text-xs text-foreground/75">{String(projeto.cliente.cnaePrincipal) === String(a.codigo) ? "principal" : "secundário"}</span>}
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
      </SecaoForm>

      <SecaoForm titulo="Módulos opcionais" nivel="h2" idTitulo="san-cfg-mod">
        <p className="text-sm text-foreground/75">Ainda não estão disponíveis nesta versão do serviço: ficam desligados.</p>
        <ul className="divide-y divide-foreground/20 border border-foreground/30 bg-card px-3">
          {MODULOS_OPCIONAIS.map((m) => {
            const id = `san-mod-${m.id}`;
            const aberto = infoAberta === m.id;
            return (
              <li key={m.id} className="py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">{m.titulo}</span>
                  <Tag tom="info">a desenvolver</Tag>
                  <span className="text-xs text-muted-foreground">Desligado</span>
                  <BotaoInfo id={id} rotulo={m.titulo} aberto={aberto} aoAlternar={() => setInfoAberta(aberto ? null : m.id)} />
                </div>
                {aberto && (
                  <dl id={id} className="mt-2 space-y-1 border-l-2 border-border pl-3 text-sm">
                    <div><dt className="inline font-semibold">O que é: </dt><dd className="inline">{m.oQueE}</dd></div>
                    <div><dt className="inline font-semibold">Dados que exige: </dt><dd className="inline">{m.exige}</dd></div>
                    <div><dt className="inline font-semibold">O que muda ao ligar: </dt><dd className="inline">{m.oQueMuda}</dd></div>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      </SecaoForm>
    </div>
  );
}
