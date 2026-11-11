import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Tags, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmpresaFormDialog from "@/components/empresas/EmpresaFormDialog";
import DialogoServico from "@/components/clientes/DialogoServico";
import DialogoEtiquetas from "@/components/clientes/DialogoEtiquetas";
import ChipDeServico from "@/components/clientes/ChipDeServico";
import AtalhosDoCliente from "@/components/clientes/AtalhosDoCliente";
import { EtiquetasDaEmpresa } from "@/components/clientes/TagChip";
import { useCarteiras } from "@/lib/useCarteiras";
import { useColaboradores, useTags } from "@/lib/useTags";
import { tagsDaEmpresa } from "@/lib/tags";
import { grupoVisivel, mascararDocumento, rotuloDoGrupo } from "@/lib/clientes";
import { fmtDataCurta, MODULOS_BPO, SITUACOES, TIPOS } from "@/lib/servicos";

const SITUACAO_DOC = { VENCIDO: "Vencido", A_VENCER: "Vence em breve", VALIDO: "Válido", SEM_VALIDADE: "Sem validade" };

function Cartao({ titulo, acao, children }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={titulo}>
      <div className="flex items-center justify-between gap-2"><h2 className="font-heading text-sm font-semibold">{titulo}</h2>{acao}</div>
      {children}
    </section>
  );
}

function Dado({ rotulo, valor }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{valor || <span className="text-muted-foreground">—</span>}</dd></div>;
}

/** Clientes > ficha do cliente: tudo sobre um cliente numa tela, com os atalhos para o trabalho de cada serviço. */
export default function FichaClientePagina() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { user } = useAuth();
  const { empresas, grupos, servicos, mapa, carregando } = useCarteiras();
  const { tags, porEmpresa, mapa: mapaTags } = useTags();
  const { data: colaboradores = [] } = useColaboradores();
  const [editando, setEditando] = useState(false);
  const [dialogo, setDialogo] = useState(null);
  const [etiquetando, setEtiquetando] = useState(false);
  const empresa = empresas.find((e) => e.id === empresaId);
  const docs = useQuery({ queryKey: ["documentos", "empresa", empresaId], queryFn: () => api.get(`/documentos?empresa_id=${encodeURIComponent(empresaId)}`), enabled: !!empresa });
  const pessoas = useQuery({ queryKey: ["pessoas-fisicas"], queryFn: () => api.get("/pessoas-fisicas"), enabled: !!empresa });
  const crumbs = [{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/" }, { label: empresa?.razao_social || "Cliente" }];

  if (carregando) return <div><PageHeader crumbs={crumbs} title="Cliente" /><p className="p-8 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p></div>;
  if (!empresa) return <div><PageHeader crumbs={crumbs} title="Cliente não encontrado" /><p role="alert" className="p-8 text-sm">Este cliente não existe mais. <Link to="/" className="text-primary hover:underline">Voltar para a lista</Link></p></div>;

  const porTipo = mapa.get(empresa.id) || {};
  const grupo = grupoVisivel(grupos.find((g) => g.numero === empresa.grupo), empresas);
  const equipe = colaboradores.filter((c) => (c.empresa_ids || []).includes(empresa.id)).map((c) => c.name || c.email);
  const etiquetas = tagsDaEmpresa(porEmpresa, mapaTags, empresa.id);
  const historico = servicos.filter((s) => s.empresa_id === empresa.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const docsAtencao = (docs.data || []).filter((d) => d.situacao === "VENCIDO" || d.situacao === "A_VENCER");
  const pfs = (pessoas.data || []).filter((p) => p.empresa_id === empresa.id);
  const sugestoes = [...new Set(servicos.map((s) => s.responsavel).filter(Boolean))].sort();

  const excluir = async () => {
    if (!(await confirmar({ titulo: `Excluir ${empresa.razao_social}?`, descricao: "Saem junto os serviços, vínculos, etiquetas, tarefas, documentos, arquivos, XML e certificado deste cliente. Não dá para desfazer.", rotulo: "Excluir cliente" }))) return;
    try {
      await api.entities.Empresa.delete(empresa.id);
      qc.invalidateQueries({ queryKey: ["empresas"] });
      toast({ title: "Cliente excluído", description: empresa.razao_social });
      navigate("/");
    } catch (e) { toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }); }
  };

  return (
    <div>
      <PageHeader
        crumbs={crumbs}
        title={empresa.razao_social}
        subtitle={[mascararDocumento(empresa.cnpj_cpf), empresa.regime_atual, [empresa.municipio, empresa.uf].filter(Boolean).join("/"), rotuloDoGrupo(grupo)].filter(Boolean).join(" · ")}
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"><Pencil className="h-4 w-4" aria-hidden="true" /> Editar dados</button>
            {user?.role === "admin" && <button type="button" onClick={excluir} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir</button>}
          </div>
        )}
      />
      <div className="px-6 lg:px-8 py-5 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo="Serviços contratados">
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.keys(TIPOS).map((tipo) => {
                const s = porTipo[tipo];
                return (
                  <div key={tipo} className="rounded-lg border border-border p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2"><p className="font-medium text-sm">{TIPOS[tipo]}</p><ChipDeServico empresa={empresa} tipo={tipo} servico={s} aoEditar={() => setDialogo({ servico: s, tipo })} /></div>
                    {s ? (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div><dt className="text-muted-foreground">Situação</dt><dd>{SITUACOES[s.situacao]}</dd></div>
                        <div><dt className="text-muted-foreground">Desde</dt><dd>{fmtDataCurta(s.inicio)}</dd></div>
                        <div><dt className="text-muted-foreground">Responsável</dt><dd>{s.responsavel || "—"}</dd></div>
                        {tipo === "BPO_FISCAL" && <div><dt className="text-muted-foreground">Módulos</dt><dd>{s.modulos?.length ? s.modulos.map((m) => MODULOS_BPO[m] || m).join(", ") : "Todos"}</dd></div>}
                      </dl>
                    ) : <p className="text-xs text-muted-foreground">Não contratado. Clique no “+” para ligar.</p>}
                    {s && <button type="button" onClick={() => setDialogo({ servico: s, tipo })} className="text-xs text-primary hover:underline">Mudar situação, datas ou responsável</button>}
                  </div>
                );
              })}
            </div>
            {historico.length > 2 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Histórico de serviços ({historico.length})</summary><ul className="mt-1 space-y-0.5">{historico.map((s) => <li key={s.id}>{TIPOS[s.tipo]}: {SITUACOES[s.situacao]} · {fmtDataCurta(s.inicio)} a {fmtDataCurta(s.fim)}</li>)}</ul></details>}
          </Cartao>

          <Cartao titulo="Ir para o trabalho deste cliente">
            <AtalhosDoCliente empresa={empresa} grupos={grupos} grade />
          </Cartao>

          <Cartao titulo="Dados cadastrais" acao={<button type="button" onClick={() => setEditando(true)} className="text-xs text-primary hover:underline">Editar</button>}>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Dado rotulo="CNPJ/CPF" valor={mascararDocumento(empresa.cnpj_cpf)} />
              <Dado rotulo="Regime" valor={empresa.regime_atual} />
              <Dado rotulo="Inscrição estadual" valor={empresa.inscricao_estadual} />
              <Dado rotulo="Município/UF" valor={[empresa.municipio, empresa.uf].filter(Boolean).join("/")} />
              <Dado rotulo="CNAE principal" valor={empresa.cnae_descricao ? `${empresa.cnae_principal || ""} ${empresa.cnae_descricao}`.trim() : empresa.cnae_principal} />
              <Dado rotulo="Porte" valor={empresa.porte} />
              <Dado rotulo="Setor" valor={empresa.setor} />
              <Dado rotulo="Produtor rural" valor={empresa.produtor_rural} />
              <Dado rotulo="ERP" valor={[empresa.erp, empresa.erp_versao].filter(Boolean).join(" ")} />
            </dl>
            {empresa.observacao && <p className="text-sm whitespace-pre-line">{empresa.observacao}</p>}
          </Cartao>
        </div>

        <div className="space-y-4">
          <Cartao titulo="Equipe e etiquetas" acao={<button type="button" onClick={() => setEtiquetando(true)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Tags className="h-3.5 w-3.5" aria-hidden="true" /> Etiquetas</button>}>
            <p className="text-sm">{equipe.length ? equipe.join(", ") : <span className="text-muted-foreground">Nenhum colaborador ligado.</span>}</p>
            {user?.role === "admin" && <Link to="/clientes/carteira" className="text-xs text-primary hover:underline">Definir quem atende</Link>}
            <EtiquetasDaEmpresa tags={etiquetas} />
          </Cartao>
          <Cartao titulo="Contato">
            <dl className="space-y-2">
              <Dado rotulo="E-mail" valor={empresa.email_contato && <a href={`mailto:${empresa.email_contato}`} className="text-primary hover:underline">{empresa.email_contato}</a>} />
              <Dado rotulo="WhatsApp" valor={empresa.whatsapp_contato} />
            </dl>
          </Cartao>
          <Cartao titulo="Documentos com validade" acao={<Link to="/bpo/arquivos" className="text-xs text-primary hover:underline">Ver todos</Link>}>
            {docs.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p> : (docs.data || []).length === 0 ? <p className="text-xs text-muted-foreground">Nenhum documento cadastrado.</p> : (
              <ul className="space-y-1 text-sm">
                {(docsAtencao.length ? docsAtencao : docs.data.slice(0, 5)).map((d) => <li key={d.id} className="flex justify-between gap-2"><span>{d.tipo?.nome || d.descricao || "Documento"}</span><span className={`text-xs ${d.situacao === "VENCIDO" ? "text-red-700 dark:text-red-400" : d.situacao === "A_VENCER" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{SITUACAO_DOC[d.situacao] || d.situacao}{d.validade ? ` · ${fmtDataCurta(d.validade)}` : ""}</span></li>)}
              </ul>
            )}
          </Cartao>
          <Cartao titulo="Pessoas físicas ligadas" acao={<Link to="/clientes/pessoas-fisicas" className="text-xs text-primary hover:underline">Gerenciar</Link>}>
            {pfs.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum sócio ou produtor ligado a este cliente.</p> : <ul className="space-y-1 text-sm">{pfs.map((p) => <li key={p.id}>{p.nome} <span className="text-xs text-muted-foreground">{p.cpf}</span></li>)}</ul>}
          </Cartao>
        </div>
      </div>
      <EmpresaFormDialog open={editando} onOpenChange={setEditando} editing={editando ? empresa : null} grupoNumero={empresa.grupo} />
      {dialogo && <DialogoServico aberto empresas={[empresa]} servico={dialogo.servico || null} tipoInicial={dialogo.tipo} sugestoes={sugestoes} aoFechar={() => setDialogo(null)} />}
      {etiquetando && <DialogoEtiquetas empresas={[empresa]} tags={tags} porEmpresa={porEmpresa} aoFechar={() => setEtiquetando(false)} />}
    </div>
  );
}
