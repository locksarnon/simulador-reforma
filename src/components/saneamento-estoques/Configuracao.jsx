import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { san } from "./api";
import { SeletorErp, useErps } from "@/components/erps/erps";
import { erpDoRegistro, vinculoErpParaSalvar } from "@/lib/erps";
import { Aviso, BotaoInfo, botaoPrimario, botaoSecundario, campoCls, Rotulo, Tag, usePodeAlterar } from "./comuns";
import { efeitoDaAtividade, ehAtividadesConfirmadas, ehConflitoVersao, estadoDaTrava, fmtData, fmtDataHora, mensagemDeErro, MODULOS_OPCIONAIS } from "./logica";

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
      {msg && <Aviso tom={msg.tom === "erro" ? "erro" : "ok"}>{msg.texto}</Aviso>}

      <section aria-labelledby="san-cfg-dados" className="space-y-3 border border-border bg-card p-4">
        <h2 id="san-cfg-dados" className="font-semibold">Dados do projeto</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><SeletorErp id="san-cfg-erp" rotulo="ERP (do cadastro do cliente; pode trocar para este trabalho)" registro={form} aoMudar={(v) => setForm((f) => ({ ...f, erp_id: v.erp_id, erp: f.erp || v.erp || "" }))} /></div>
          <label className="block"><Rotulo>Versão do ERP</Rotulo>{erpEscolhido?.versoes?.length
            ? <select className={campoCls} value={form.erp_versao} onChange={set("erp_versao")}><option value="">Selecione a versão</option>{[...erpEscolhido.versoes, ...(form.erp_versao && !erpEscolhido.versoes.includes(form.erp_versao) ? [form.erp_versao] : [])].map((v) => <option key={v} value={v}>{v}</option>)}</select>
            : <input className={campoCls} value={form.erp_versao} onChange={set("erp_versao")} />}</label>
          <label className="block"><Rotulo>Responsável</Rotulo><input className={campoCls} value={form.responsavel} onChange={set("responsavel")} /></label>
          <div><Rotulo>Data-base</Rotulo><p className="py-1.5 text-sm">{fmtData(projeto.data_base) || "—"}</p><p className="text-xs text-muted-foreground">Vem do projeto de consultoria.</p></div>
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
            <span className="mt-1 block text-xs text-muted-foreground">Ajuste com início nesta competência ou antes aparece como “impacto em escrituração já entregue”. Vazio: esse impacto fica “não avaliado” no Excel e no relatório.</span>
          </label>
        </div>
        <button type="button" className={botaoPrimario} disabled={!pode || salvar.isPending} title={razao} onClick={() => salvar.mutate()}>{salvar.isPending ? "Salvando…" : "Salvar configuração"}</button>
      </section>

      <section aria-labelledby="san-cfg-ativ" className="space-y-3 border border-border bg-card p-4">
        <h2 id="san-cfg-ativ" className="font-semibold">Atividades do cliente</h2>
        <p className="text-sm text-muted-foreground">Vêm do CNAE principal e dos secundários do CNPJ. Mantenha as que o cliente realmente exerce, exclua as outras e acrescente as que faltam. Sem esta confirmação não há importação nem análise.</p>
        {trava.revisarAtividades && <Aviso tom="alerta" titulo="Revisar atividades">Os dados do CNPJ do cliente mudaram depois que o projeto foi aberto. Confira se as atividades abaixo ainda valem; o que já foi feito não é bloqueado.</Aviso>}
        {trava.confirmada && (
          <Aviso tom="ok" titulo="Atividades confirmadas" acao={<button type="button" className={botaoSecundario} onClick={pedirReabertura} disabled={!pode || reabrir.isPending} title={razao}>Reabrir para alterar</button>}>
            Por {projeto.atividades_confirmadas_por || "—"} em {fmtDataHora(projeto.atividades_confirmadas_em)}.
          </Aviso>
        )}
        {atividades.length === 0 ? (
          <p className="text-sm text-muted-foreground">O CNPJ não trouxe atividades. Acrescente pelo menos uma abaixo (cliente pessoa física: marque à mão).</p>
        ) : (
          <table className="w-full text-sm" aria-label="Atividades do cliente">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="w-16 py-1">Manter</th><th scope="col">Código</th><th scope="col">Descrição</th><th scope="col">Origem</th>{projeto.mapaAtividades && <th scope="col">Efeito nas sugestões</th>}</tr></thead>
            <tbody>
              {atividades.map((a) => (
                <tr key={a.id} className={`border-b border-border/60 ${a.mantida ? "" : "text-muted-foreground"}`}>
                  <td className="py-1.5">
                    <input type="checkbox" checked={!!a.mantida} disabled={!pode || !trava.editavel || alternar.isPending} title={razao} aria-label={`${a.mantida ? "Excluir" : "Manter"} a atividade ${a.codigo}`} onChange={() => alternar.mutate({ id: a.id, mantida: !a.mantida })} />
                  </td>
                  <td className="tabular-nums">{a.codigo}</td>
                  <td className={a.mantida ? "" : "line-through"}>{a.descricao}{!a.mantida && <Tag className="ml-2">excluída</Tag>}</td>
                  <td><Tag tom={a.origem === "CNPJ" ? "info" : "neutro"}>{a.origem === "CNPJ" ? "CNPJ" : "Manual"}</Tag></td>
                  {projeto.mapaAtividades && <td className="text-xs">{efeitoDaAtividade(projeto.mapaAtividades, a.codigo) || "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {trava.editavel && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); acrescentar.mutate(); }}>
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
      </section>

      <section aria-labelledby="san-cfg-mod" className="space-y-2 border border-border bg-card p-4">
        <h2 id="san-cfg-mod" className="font-semibold">Módulos opcionais</h2>
        <p className="text-sm text-muted-foreground">Ainda não estão disponíveis nesta versão do serviço: ficam desligados.</p>
        <ul className="divide-y divide-border">
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
      </section>
    </div>
  );
}
