import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Play } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base, fmtDataHora, UFS, UFS_FOCO } from "./formatos";

const TIPOS = {
  NFE: "NF-e (notas em que o cliente é destinatário)",
  CTE: "CT-e (conhecimentos de transporte em que o cliente é remetente, destinatário, expedidor, recebedor ou tomador)",
  NFSE: "NFS-e Nacional (notas de serviço em que o cliente é prestador, tomador ou intermediário)",
};
const ROTULO = { NFE: "NF-e", CTE: "CT-e", NFSE: "NFS-e" };
const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

function Requisito({ ok, texto }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" /> : <CircleDashed className="w-4 h-4 text-amber-600" aria-hidden="true" />}
      <span className={ok ? "" : "text-amber-800 dark:text-amber-300"}>{texto}</span>
    </li>
  );
}

/** Captura automática dos XML pela Distribuição de DF-e da SEFAZ, com o certificado do cliente. Configuração só para administradores. */
export default function CapturaXml({ empresaId }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  const [ativando, setAtivando] = useState(null);
  const [semConcorrente, setSemConcorrente] = useState(false);
  const [ativandoCiencia, setAtivandoCiencia] = useState(false);
  const [confirmoCiencia, setConfirmoCiencia] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["repo-xml-captura", empresaId], queryFn: () => api.get(`${base(empresaId)}/captura`), refetchInterval: 30000 });
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["repo-xml-captura", empresaId] }); qc.invalidateQueries({ queryKey: ["repo-xml-docs", empresaId] }); qc.invalidateQueries({ queryKey: ["repo-xml-resumo", empresaId] }); };

  const configurar = useMutation({
    mutationFn: ({ tipo, ativo }) => api.put(`${base(empresaId)}/captura/tipos/${tipo}`, { ativo, sem_consumidor_concorrente: ativo ? semConcorrente : undefined }),
    onSuccess: (_r, v) => { setAtivando(null); setSemConcorrente(false); atualizar(); toast({ title: v.ativo ? "Captura ativada" : "Captura desativada" }); },
    onError: (e) => toast({ title: "Não foi possível alterar a captura", description: e.message, variant: "destructive" }),
  });
  const executar = useMutation({
    mutationFn: (tipo) => api.post(`${base(empresaId)}/captura/tipos/${tipo}/executar`),
    onSuccess: (r) => { atualizar(); toast({ title: "Captura executada", description: r.mensagem }); },
    onError: (e) => { atualizar(); toast({ title: "Não foi possível capturar agora", description: e.message, variant: "destructive" }); },
  });
  const ciencia = useMutation({
    mutationFn: ({ ativo }) => api.put(`${base(empresaId)}/captura/ciencia`, { ativo, confirmo: ativo ? confirmoCiencia : undefined }),
    onSuccess: (_r, v) => { setAtivandoCiencia(false); setConfirmoCiencia(false); atualizar(); toast({ title: v.ativo ? "Ciência da Operação automática ativada" : "Ciência da Operação automática desativada" }); },
    onError: (e) => toast({ title: "Não foi possível alterar a Ciência", description: e.message, variant: "destructive" }),
  });
  const ambiente = useMutation({
    mutationFn: (v) => api.put(`${base(empresaId)}/captura/ambiente`, v),
    onSuccess: () => { atualizar(); toast({ title: "Ambiente atualizado" }); },
    onError: (e) => toast({ title: "Não foi possível alterar", description: e.message, variant: "destructive" }),
  });
  const periodo = useMutation({
    mutationFn: (valor) => api.put(`${base(empresaId)}/captura/periodo`, { periodo: valor }),
    onSuccess: () => { atualizar(); toast({ title: "Período da busca automática atualizado" }); },
    onError: (e) => toast({ title: "Não foi possível alterar o período", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</p>;
  const documentosOk = data?.requisitos?.certificado_ativo && data?.requisitos?.termo_registrado;
  // A NFS-e Nacional (ADN) não usa a UF do interessado; a NF-e e o CT-e usam.
  const prontoPara = (tipo) => !!documentosOk && (tipo === "NFSE" || !!data?.uf_autor);

  return (
    <div className="space-y-4">
      {data && data.agendador_ativo === false && (
        <div role="note" className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
          <p>O agendador da captura está desligado neste servidor (variável <code>CAPTURA_XML_AGENDADOR</code>): a captura só roda pelo botão "Capturar agora". Em produção ele deve estar ligado, e só nela, para dois sistemas não consultarem o mesmo CNPJ.</p>
        </div>
      )}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Antes de ativar</h3>
        <ul className="space-y-1.5">
          <Requisito ok={data?.requisitos?.certificado_ativo} texto="Certificado digital A1 do cliente guardado e dentro da validade (aba Certificado e autorização)" />
          <Requisito ok={data?.requisitos?.termo_registrado} texto="Termo de autorização do cliente registrado" />
          <Requisito ok={!!data?.uf_autor} texto={data?.uf_autor ? `UF do interessado: ${UFS[data.uf_autor] || data.uf_autor} (${data.uf_autor})` : "UF do interessado definida (cadastro da empresa ou campo abaixo); necessária para NF-e e CT-e, não para NFS-e"} />
        </ul>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Ambiente da SEFAZ</span>
            <select className={campo} disabled={!admin || ambiente.isPending} value={data?.ambiente || "PRODUCAO"} onChange={async (e) => { const novo = e.target.value; if (await confirmar({ titulo: "Trocar o ambiente da SEFAZ?", descricao: "Cada ambiente tem a sua numeração (NSU): trocar zera o NSU desta empresa e desativa a captura.", rotulo: "Trocar", perigoso: false })) ambiente.mutate({ ambiente: novo }); }}>
              <option value="PRODUCAO">Produção (notas reais)</option><option value="HOMOLOGACAO">Homologação (teste)</option>
            </select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">UF do interessado</span>
            <select className={campo} disabled={!admin || ambiente.isPending} value={data?.uf_autor || ""} onChange={(e) => ambiente.mutate({ ambiente: data?.ambiente || "PRODUCAO", uf_autor: e.target.value })}>
              <option value="">Escolha…</option>
              <optgroup label="Estados atendidos">{UFS_FOCO.map((cod) => <option key={cod} value={cod}>{UFS[cod]} ({cod})</option>)}</optgroup>
              <optgroup label="Outros estados">{Object.entries(UFS).filter(([cod]) => !UFS_FOCO.includes(cod)).map(([cod, sigla]) => <option key={cod} value={cod}>{sigla} ({cod})</option>)}</optgroup>
            </select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Período da busca automática</span>
            <select className={campo} disabled={!admin || periodo.isPending} value={data?.periodo?.atual || "NOTURNO"} onChange={(e) => periodo.mutate(e.target.value)}>
              {(data?.periodo?.opcoes || [{ valor: "NOTURNO", texto: "Noturno, das 18:00 às 05:59 (horário de Brasília)" }, { valor: "DIURNO", texto: "Diurno, das 06:00 às 17:59 (horário de Brasília)" }]).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select></label>
        </div>
        <p className="text-xs text-muted-foreground">A busca automática só consulta esta empresa dentro do período escolhido (a cada 10 minutos, respeitando a espera de 1 hora da SEFAZ). O botão "Capturar agora" funciona a qualquer hora.</p>
      </section>

      {(data?.tipos || []).map((t) => {
        const aguarda = t.liberado_em && new Date(t.liberado_em).getTime() > Date.now();
        return (
          <section key={t.tipo} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold text-sm">{TIPOS[t.tipo] || t.tipo}</h3>
                <p className="text-xs text-muted-foreground">{!t.ativo ? "Captura desativada." : data?.agendador_ativo === false ? `Captura ativa, mas o agendador está desligado neste servidor: só roda pelo botão "Capturar agora".` : `Captura ativa: a rotina automática consulta ${t.tipo === "NFSE" ? "o ADN" : "a SEFAZ"} no período ${data?.periodo?.texto || "Noturno, das 18:00 às 05:59 (horário de Brasília)"}, respeitando a espera de 1 hora do serviço.`}</p></div>
              {admin && (
                <div className="flex flex-wrap gap-2">
                  {t.ativo ? (
                    <>
                      <button type="button" onClick={() => executar.mutate(t.tipo)} disabled={executar.isPending || t.em_execucao || aguarda} title={aguarda ? (t.tipo === "NFSE" ? `O ADN pede aguardar até ${fmtDataHora(t.liberado_em)} para consultar de novo` : `A SEFAZ só permite nova consulta a partir de ${fmtDataHora(t.liberado_em)}`) : undefined} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                        {executar.isPending || t.em_execucao ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Capturar agora
                      </button>
                      <button type="button" onClick={async () => { if (await confirmar({ titulo: `Desativar a captura de ${ROTULO[t.tipo] || t.tipo}?`, descricao: "Se a captura ficar desativada por mais de 60 dias, a SEFAZ para de gerar a numeração (NSU) desse CNPJ nesse intervalo e as notas desse período não voltam: precisarão entrar por envio de arquivos.", rotulo: "Desativar" })) configurar.mutate({ tipo: t.tipo, ativo: false }); }} disabled={configurar.isPending} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">Desativar</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setSemConcorrente(false); setAtivando(t.tipo); }} disabled={!prontoPara(t.tipo)} title={prontoPara(t.tipo) ? undefined : "Cumpra os requisitos acima"} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Ativar captura</button>
                  )}
                </div>
              )}
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-2"><dt className="text-muted-foreground">Último NSU recebido</dt><dd className="tabular-nums">{t.ultimo_nsu}{t.max_nsu ? ` de ${t.max_nsu}` : ""}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Última consulta</dt><dd>{fmtDataHora(t.ultima_consulta_em)}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Próxima consulta permitida</dt><dd>{aguarda ? fmtDataHora(t.liberado_em) : t.ativo ? "agora" : "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Próxima busca automática</dt><dd>{t.proxima_automatica_em ? (new Date(t.proxima_automatica_em).getTime() <= Date.now() + 60_000 ? "agora (a cada 10 minutos)" : fmtDataHora(t.proxima_automatica_em)) : "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">{t.tipo === "NFSE" ? "Retorno do ADN" : "Retorno da SEFAZ"}</dt><dd>{t.ultimo_cstat || "—"}</dd></div>
            </dl>
            {t.ultimo_motivo && <p className="text-sm text-muted-foreground">{t.ultimo_motivo}</p>}
          </section>
        );
      })}

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">Ciência da Operação (libera o XML completo das compras)</h3>
            <p className="text-xs text-muted-foreground">{data?.ciencia?.ativa ? "Ativa: o InTAX registra a Ciência, em nome do cliente, nas NF-e recebidas autorizadas há até 10 dias." : "Desativada: as NF-e recebidas ficam só com o resumo."}</p>
          </div>
          {admin && (data?.ciencia?.ativa ? (
            <button type="button" disabled={ciencia.isPending} onClick={() => ciencia.mutate({ ativo: false })} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">Desativar</button>
          ) : (
            <button type="button" disabled={!data?.requisitos?.termo_registrado} title={data?.requisitos?.termo_registrado ? undefined : "Registre antes o termo de autorização do cliente"} onClick={() => { setConfirmoCiencia(false); setAtivandoCiencia(true); }} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Ativar Ciência automática</button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">A SEFAZ entrega a NF-e recebida só em resumo até o destinatário se manifestar. A Ciência da Operação libera o XML completo, mas é um ato do cliente, assinado com o certificado dele, e gera o dever de uma manifestação conclusiva depois. O InTAX registra apenas a Ciência, nunca a Confirmação, o Desconhecimento nem a Operação não Realizada.</p>
        <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2"><dt className="text-muted-foreground">Resumos aguardando</dt><dd className="tabular-nums">{data?.ciencia?.resumos_sem_ciencia ?? 0}</dd></div>
          <div className="flex gap-2"><dt className="text-muted-foreground">Ciência registrada</dt><dd className="tabular-nums">{data?.ciencia?.registradas ?? 0}</dd></div>
          <div className="flex gap-2"><dt className="text-muted-foreground">Fora do prazo ou não aplicável</dt><dd className="tabular-nums">{data?.ciencia?.nao_aplicaveis ?? 0}</dd></div>
        </dl>
        {data?.ciencia?.ativa && data.ciencia.consentida_por && <p className="text-xs text-muted-foreground">Autorizada por {data.ciencia.consentida_por} em {fmtDataHora(data.ciencia.consentida_em)}.</p>}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-semibold text-sm">O que a captura traz, e o que não traz</h3>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>NF-e e CT-e: só o que o CNPJ do cliente recebe. Na NF-e, as notas em que ele é destinatário; no CT-e, aquelas em que ele é remetente, destinatário, expedidor, recebedor ou tomador. As notas que o próprio cliente emitiu não vêm por este serviço: envie os XML dela pela aba Documentos (ou peça para o ERP do cliente incluir o CNPJ da FAL no campo autXML).</li>
          <li>NFS-e: a captura usa o Ambiente de Dados Nacional (ADN) da NFS-e Nacional e traz as notas em que o CNPJ do cliente é prestador, tomador ou intermediário. Se o ADN entrega também as que o próprio cliente emitiu é ponto a confirmar no primeiro cliente: a documentação do ADN não é conclusiva. Só vêm as notas dos municípios que compartilham as suas NFS-e com o ambiente nacional: confirme com o primeiro cliente de cada município, principalmente nos que usam sistema próprio de emissão (Campo Grande, Sidrolândia, Rio Verde, Mineiros e Belém). O que não vier entra por envio de arquivos. O importador de XML ainda não lê NFS-e: elas ficam guardadas aqui.</li>
          <li>A SEFAZ guarda as notas por 90 dias (3 meses no CT-e). Para um CNPJ que nunca usou o serviço, a numeração (NSU) só começa no primeiro acesso: o histórico anterior não volta, e a primeira consulta devolve "nenhum documento". O que ficou para trás entra por envio de arquivos.</li>
          <li>Se a captura ficar desativada por mais de 60 dias, a SEFAZ para de gerar a numeração desse CNPJ no intervalo e as notas desse período não voltam.</li>
          <li>Para a nota recebida, a SEFAZ entrega primeiro só o resumo. O XML completo depende de o destinatário registrar uma manifestação, ato do próprio cliente (veja a Ciência da Operação acima). Enquanto isso, o resumo aparece na aba Documentos como "Só resumo", e o XML completo chega na consulta seguinte à manifestação.</li>
          <li>Se o ERP do cliente (ou outro captador) também consulta a Distribuição de DF-e do mesmo CNPJ, as consultas se atrapalham e a SEFAZ bloqueia os dois por 1 hora.</li>
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Últimas execuções</h3>
        {!data?.execucoes?.length ? <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2 pr-3">Início</th><th className="py-2 pr-3">Origem</th><th className="py-2 pr-3 text-right">Consultas</th><th className="py-2 pr-3 text-right">Recebidos</th><th className="py-2 pr-3 text-right">Novos</th><th className="py-2 pr-3">Retorno</th><th className="py-2">Resultado</th></tr></thead>
            <tbody>{data.execucoes.map((x) => (
              <tr key={x.id} className="border-b border-border/60"><td className="py-1.5 pr-3 whitespace-nowrap">{fmtDataHora(x.iniciado_em)}</td><td className="py-1.5 pr-3">{x.origem === "MANUAL" ? `Manual (${x.usuario || "—"})` : "Automática"}</td><td className="py-1.5 pr-3 text-right tabular-nums">{x.consultas}</td><td className="py-1.5 pr-3 text-right tabular-nums">{x.docs_recebidos}</td><td className="py-1.5 pr-3 text-right tabular-nums">{x.docs_novos}</td><td className="py-1.5 pr-3">{x.ultimo_cstat || "—"}</td><td className="py-1.5 text-muted-foreground">{x.mensagem || (x.finalizado_em ? "" : "em andamento")}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <Dialog open={ativandoCiencia} onOpenChange={(v) => { if (!ciencia.isPending && !v) setAtivandoCiencia(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar a Ciência da Operação automática?</DialogTitle>
            <DialogDescription>Base: Ajuste SINIEF 07/05, cláusulas 15-B e 15-C (com o Ajuste SINIEF 14/26) e a NT 2020.001 v1.60 da NF-e.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 text-sm space-y-1.5">
            <li>A Ciência da Operação é um ato do destinatário, aqui o cliente, assinado com o certificado dele. É opcional e não é a manifestação final.</li>
            <li>Registrada a Ciência, o cliente passa a ter o dever de registrar Confirmação, Desconhecimento ou Operação não Realizada em até 90 dias da autorização. Passados 90 dias sem registro conclusivo, a operação é considerada confirmada.</li>
            <li>A Confirmação da Operação impede o emitente de cancelar a nota.</li>
            <li>O InTAX registra só a Ciência. A manifestação conclusiva continua sendo do cliente, pelo ERP ou pelo portal da NF-e.</li>
            <li>Só notas autorizadas há até 10 dias aceitam Ciência; as mais antigas ficam só com o resumo.</li>
          </ul>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmoCiencia} onChange={(e) => setConfirmoCiencia(e.target.checked)} /> <span>Confirmo que o cliente autorizou o registro automático da Ciência da Operação em nome do CNPJ dele e que a manifestação conclusiva continua sendo dele.</span></label>
          <DialogFooter>
            <button type="button" disabled={ciencia.isPending} onClick={() => setAtivandoCiencia(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={ciencia.isPending || !confirmoCiencia} onClick={() => ciencia.mutate({ ativo: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {ciencia.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Ativar Ciência automática
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ativando} onOpenChange={(v) => { if (!configurar.isPending && !v) setAtivando(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar a captura de {ROTULO[ativando] || ativando}?</DialogTitle>
            <DialogDescription>O InTAX vai abrir o certificado do cliente para consultar {ativando === "NFSE" ? "o ADN (NFS-e Nacional)" : "a SEFAZ"} em nome dele e guardar os XML no repositório. Cada uso fica na auditoria do cofre.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 text-sm rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
            {ativando === "NFSE"
              ? <p>Se o sistema de NFS-e do cliente, outro captador de XML ou outro sistema já consulta a distribuição do ADN para este CNPJ, as consultas podem se atrapalhar e o ADN pode limitá-las (os limites do ADN não estão documentados). Confirme antes de ativar.</p>
              : <p>Se o ERP do cliente, outro captador de XML ou outro sistema já consulta a Distribuição de DF-e deste CNPJ, ele e o InTAX se atrapalham: a SEFAZ bloqueia as consultas por 1 hora e o NSU de cada um se perde. Confirme antes de ativar.</p>}
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={semConcorrente} onChange={(e) => setSemConcorrente(e.target.checked)} /> <span>Confirmo que nenhum outro sistema consulta a Distribuição de DF-e deste CNPJ.</span></label>
          <DialogFooter>
            <button type="button" disabled={configurar.isPending} onClick={() => setAtivando(null)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={configurar.isPending || !semConcorrente} onClick={() => configurar.mutate({ tipo: ativando, ativo: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {configurar.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Ativar captura
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
