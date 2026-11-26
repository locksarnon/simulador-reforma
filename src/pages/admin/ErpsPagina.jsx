import { useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import { chavesErps, RotuloGrau, useErps } from "@/components/erps/erps";
import { CAMPOS_SANEAMENTO, GRAUS, SITUACOES_ERP, TIPOS_AJUSTE_ERP, TIPOS_CONHECIMENTO } from "@/lib/erps";

const CRUMBS = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Configuração e ERPs", to: "/configuracao" }];
const campo = "mt-1 w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background text-foreground";
const botao = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";
const botaoPrimario = "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const erroDe = (e) => e?.response?.data?.message || e?.message || "Não foi possível salvar.";
const dataHora = (s) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Abas do módulo Configuração e ERPs (o menu da Administração tem no máximo 7 itens: o cadastro de ERPs é uma aba). */
export function AbasConfiguracao() {
  const cls = ({ isActive }) => `border-b-2 px-3 py-2 text-sm ${isActive ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`;
  return (
    <nav aria-label="Abas da configuração" className="flex gap-1 border-b border-border px-6 lg:px-8">
      <NavLink to="/configuracao" end className={cls}>Motor de cálculo</NavLink>
      <NavLink to="/admin/erps" className={cls}>Cadastro de ERPs</NavLink>
    </nav>
  );
}

const COLUNAS_LISTA = [
  { chave: "nome", rotulo: "ERP", render: (e) => <Link to={`/admin/erps/${e.id}`} className="font-medium text-primary underline">{e.nome}</Link> },
  { chave: "fabricante", rotulo: "Fabricante" },
  { chave: "produto", rotulo: "Produto ou edição" },
  { chave: "versoes", rotulo: "Versões", valor: (e) => (e.versoes || []).join(", ") },
  { chave: "situacao", rotulo: "Perfil", valor: (e) => SITUACOES_ERP[e.situacao] || e.situacao },
  { chave: "itens", rotulo: "Itens de conhecimento", tipo: "numero" },
  { chave: "confirmados", rotulo: "Confirmados", tipo: "numero" },
  { chave: "restricoes", rotulo: "Restrições", tipo: "numero" },
  { chave: "ativo", rotulo: "Situação", valor: (e) => (e.ativo === false ? "Inativo" : "Ativo") },
  { chave: "updatedAt", rotulo: "Atualizado em", tipo: "data" },
];

function FormErp({ inicial, aoSalvar, aoCancelar, salvando, erro }) {
  const [f, setF] = useState(() => ({ nome: "", fabricante: "", produto: "", versoes: "", situacao: "A_DESENVOLVER", ativo: true, ...inicial, versoes: (inicial?.versoes || []).join(", ") }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <form aria-label="Dados do ERP" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); aoSalvar({ ...f, versoes: f.versoes.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean) }); }}>
      <label className="text-xs font-medium">Nome<input className={campo} value={f.nome} onChange={set("nome")} required /></label>
      <label className="text-xs font-medium">Fabricante<input className={campo} value={f.fabricante} onChange={set("fabricante")} required /></label>
      <label className="text-xs font-medium">Produto ou edição (opcional)<input className={campo} value={f.produto || ""} onChange={set("produto")} /></label>
      <label className="text-xs font-medium">Versões (separadas por vírgula)<input className={campo} value={f.versoes} onChange={set("versoes")} /></label>
      <label className="text-xs font-medium">Situação do perfil
        <select className={campo} value={f.situacao} onChange={set("situacao")}>{Object.entries(SITUACOES_ERP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="flex items-center gap-2 text-sm sm:mt-5"><input type="checkbox" checked={f.ativo !== false} onChange={set("ativo")} />Ativo (aparece na lista das telas)</label>
      {erro && <p role="alert" className="text-sm text-destructive sm:col-span-2">{erro}</p>}
      <div className="flex gap-2 sm:col-span-2"><button type="submit" className={botaoPrimario} disabled={salvando}>Salvar</button><button type="button" className={botao} onClick={aoCancelar}>Cancelar</button></div>
    </form>
  );
}

/** Administração > Configuração e ERPs > Cadastro de ERPs: a lista. Só o administrador cria e altera; todos os perfis de acesso que veem a tela leem. */
export default function ErpsPagina() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const qc = useQueryClient();
  const navegar = useNavigate();
  const q = useErps();
  const [novo, setNovo] = useState(false);
  const criar = useMutation({ mutationFn: (d) => api.post("/erps", d), onSuccess: (e) => { qc.invalidateQueries({ queryKey: chavesErps.lista }); setNovo(false); navegar(`/admin/erps/${e.id}`); } });
  return (
    <div>
      <PageHeader crumbs={[...CRUMBS, { label: "Cadastro de ERPs" }]} title="Configuração e ERPs" />
      <AbasConfiguracao />
      <div className="space-y-4 px-6 py-6 lg:px-8">
        <p className="text-sm text-muted-foreground">O conhecimento de cada ERP (colunas do export, consultas de extração, restrições, ação no ERP, modelos de carga e observações) que todas as telas usam quando o ERP é selecionado. Só fonte oficial: o que não tem fonte fica "Não confirmado". Perfil "A desenvolver" usa só as regras gerais.</p>
        {admin && !novo && <button type="button" className={botaoPrimario} onClick={() => setNovo(true)}>Novo ERP</button>}
        {admin && novo && <FormErp aoSalvar={(d) => criar.mutate(d)} aoCancelar={() => setNovo(false)} salvando={criar.isPending} erro={criar.error && erroDe(criar.error)} />}
        {q.error && <p role="alert" className="text-sm">Não foi possível carregar o cadastro de ERPs.</p>}
        <TabelaPadrao id="cadastro-erps" titulo="ERPs" ariaLabel="Cadastro de ERPs" colunas={COLUNAS_LISTA} linhas={q.data || []} vazio={q.isLoading ? "Carregando…" : "Nenhum ERP cadastrado."} aoClicarLinha={(e) => navegar(`/admin/erps/${e.id}`)} />
      </div>
    </div>
  );
}

const ITEM_VAZIO = { tipo: "RESTRICAO", tipo_ajuste: "", chave: "", texto: "", campo_erp: "", fonte_url: "", grau: "NAO_CONFIRMADO", ordem: 0, ativo: true };

function FormItem({ inicial, aoSalvar, aoCancelar, salvando, erro }) {
  const [f, setF] = useState(() => ({ ...ITEM_VAZIO, ...inicial, tipo_ajuste: inicial?.tipo_ajuste || "", campo_erp: inicial?.campo_erp || "", fonte_url: inicial?.fonte_url || "" }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const coluna = f.tipo === "COLUNA_EXPORT";
  return (
    <form aria-label="Item de conhecimento" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); aoSalvar({ ...f, ordem: Number(f.ordem) || 0, tipo_ajuste: f.tipo_ajuste || null }); }}>
      <label className="text-xs font-medium">Tipo<select className={campo} value={f.tipo} onChange={set("tipo")}>{Object.entries(TIPOS_CONHECIMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-xs font-medium">Tipo de ajuste (vazio = vale para o ERP todo)
        <select className={campo} value={f.tipo_ajuste} onChange={set("tipo_ajuste")}><option value="">—</option>{Object.entries(TIPOS_AJUSTE_ERP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      {coluna
        ? <label className="text-xs font-medium">Campo do saneamento<select className={campo} value={f.chave} onChange={set("chave")} required><option value="">Selecione</option>{Object.entries(CAMPOS_SANEAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        : <label className="text-xs font-medium">Rótulo<input className={campo} value={f.chave} onChange={set("chave")} required /></label>}
      <label className="text-xs font-medium">{coluna ? "Cabeçalho da coluna no export" : "Campo ou tabela do ERP (opcional)"}<input className={campo} value={f.campo_erp} onChange={set("campo_erp")} /></label>
      <label className="text-xs font-medium sm:col-span-2">Texto{f.tipo === "ACAO_NO_ERP" ? " (use {sai} e {fica} para os códigos)" : ""}<textarea className={`${campo} min-h-[80px] font-mono`} value={f.texto} onChange={set("texto")} required /></label>
      <label className="text-xs font-medium">Fonte oficial (endereço)<input className={campo} value={f.fonte_url} onChange={set("fonte_url")} placeholder="https://" /></label>
      <label className="text-xs font-medium">Grau<select className={campo} value={f.grau} onChange={set("grau")}>{Object.entries(GRAUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-xs font-medium">Ordem<input type="number" className={campo} value={f.ordem} onChange={set("ordem")} /></label>
      <label className="flex items-center gap-2 text-sm sm:mt-5"><input type="checkbox" checked={f.ativo !== false} onChange={set("ativo")} />Ativo (as telas usam)</label>
      {erro && <p role="alert" className="text-sm text-destructive sm:col-span-2">{erro}</p>}
      <div className="flex gap-2 sm:col-span-2"><button type="submit" className={botaoPrimario} disabled={salvando}>Salvar</button><button type="button" className={botao} onClick={aoCancelar}>Cancelar</button></div>
    </form>
  );
}

const colunasDoTipo = (tipo, admin, editar) => [
  ...(tipo === "COLUNA_EXPORT" ? [{ chave: "chave", rotulo: "Campo do saneamento", valor: (i) => CAMPOS_SANEAMENTO[i.chave] || i.chave }, { chave: "campo_erp", rotulo: "Coluna no export" }]
    : [{ chave: "chave", rotulo: "Rótulo" }, ...(tipo === "RESTRICAO" || tipo === "ACAO_NO_ERP" ? [{ chave: "tipo_ajuste", rotulo: "Tipo de ajuste", valor: (i) => (i.tipo_ajuste ? TIPOS_AJUSTE_ERP[i.tipo_ajuste] || i.tipo_ajuste : "Todos") }] : []), { chave: "campo_erp", rotulo: "Campo ou tabela" }]),
  { chave: "texto", rotulo: "Texto", quebrar: true, render: (i) => (tipo === "CONSULTA_EXTRACAO" ? <pre className="max-h-40 max-w-[36rem] overflow-auto whitespace-pre-wrap text-xs">{i.texto}</pre> : <span className="text-sm">{i.texto}</span>) },
  { chave: "grau", rotulo: "Grau", valor: (i) => GRAUS[i.grau] || i.grau, render: (i) => <RotuloGrau grau={i.grau} /> },
  { chave: "fonte_url", rotulo: "Fonte", filtravel: false, render: (i) => (i.fonte_url ? <a href={i.fonte_url} target="_blank" rel="noreferrer" className="text-primary underline" onClick={(e) => e.stopPropagation()}>Fonte oficial</a> : "—") },
  { chave: "ativo", rotulo: "Situação", valor: (i) => (i.ativo === false ? "Inativo" : "Ativo") },
  ...(admin ? [{ chave: "editar", rotulo: "", ordenavel: false, filtravel: false, render: (i) => <button type="button" className="text-xs text-primary underline" onClick={() => editar(i)}>Editar</button> }] : []),
];

const COLUNAS_HISTORICO = [
  { chave: "createdAt", rotulo: "Quando", valor: (h) => h.createdAt, render: (h) => dataHora(h.createdAt) },
  { chave: "usuario", rotulo: "Quem" },
  { chave: "acao", rotulo: "Ação", valor: (h) => ({ CRIOU: "Criou", ALTEROU: "Alterou", CARGA: "Carga inicial" }[h.acao] || h.acao) },
  { chave: "item", rotulo: "Item", valor: (h) => (h.conhecimento_id ? String(h.depois?.chave ?? h.antes?.chave ?? h.conhecimento_id) : "Dados do ERP") },
  { chave: "mudou", rotulo: "Antes → depois", quebrar: true, valor: (h) => diferencas(h), render: (h) => <span className="text-xs">{diferencas(h)}</span> },
];

/** O que mudou entre o antes e o depois (campo: antes → depois), curto. */
export function diferencas(h) {
  const a = h.antes || {}; const d = h.depois || {};
  const ROTULOS = { ...GRAUS, ...SITUACOES_ERP, ...TIPOS_CONHECIMENTO, ...TIPOS_AJUSTE_ERP };
  const curto = (v) => { if (typeof v === "string" && ROTULOS[v]) return ROTULOS[v]; if (typeof v === "boolean") return v ? "sim" : "não"; const s = Array.isArray(v) ? v.join(", ") : v === null || v === undefined || v === "" ? "—" : String(v); return s.length > 80 ? `${s.slice(0, 80)}…` : s; };
  const campos = [...new Set([...Object.keys(a), ...Object.keys(d)])].filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null));
  if (!h.antes) return "Criado";
  return campos.map((k) => `${k}: ${curto(a[k])} → ${curto(d[k])}`).join("; ") || "Sem mudança";
}

/** Ficha do ERP: dados, conhecimento por tipo (seções) e o histórico de alterações. */
export function ErpFicha() {
  const { id } = useParams();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const qc = useQueryClient();
  const q = useQuery({ queryKey: chavesErps.ficha(id), queryFn: () => api.get(`/erps/${id}`), enabled: !!id });
  const [editandoErp, setEditandoErp] = useState(false);
  const [item, setItem] = useState(null); // null | {} (novo) | item
  const depois = () => { qc.invalidateQueries({ queryKey: ["erps"] }); };
  const salvarErp = useMutation({ mutationFn: (d) => api.put(`/erps/${id}`, d), onSuccess: () => { setEditandoErp(false); depois(); } });
  const salvarItem = useMutation({
    mutationFn: (d) => (d.id ? api.put(`/erps/${id}/conhecimentos/${d.id}`, d) : api.post(`/erps/${id}/conhecimentos`, d)),
    onSuccess: () => { setItem(null); depois(); },
  });
  const e = q.data;
  const itens = e?.conhecimentos || [];
  return (
    <div>
      <PageHeader crumbs={[...CRUMBS, { label: "Cadastro de ERPs", to: "/admin/erps" }, { label: e?.nome || "ERP" }]} title={e?.nome || "ERP"} />
      <AbasConfiguracao />
      <div className="space-y-6 px-6 py-6 lg:px-8">
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {q.error && <p role="alert" className="text-sm">ERP não encontrado.</p>}
        {e && (
          <>
            <section aria-label="Dados do ERP" className="space-y-2">
              <p className="text-sm"><b>Fabricante:</b> {e.fabricante} · <b>Produto ou edição:</b> {e.produto || "—"} · <b>Versões:</b> {(e.versoes || []).join(", ") || "—"} · <b>Perfil:</b> {SITUACOES_ERP[e.situacao] || e.situacao} · <b>{e.ativo === false ? "Inativo" : "Ativo"}</b></p>
              {e.situacao === "A_DESENVOLVER" && <p className="text-sm text-muted-foreground">Perfil a desenvolver: as telas usam só as regras gerais, sem alertas específicos deste ERP.</p>}
              {!admin && <p className="text-xs text-muted-foreground">Somente administradores alteram o cadastro.</p>}
              {admin && !editandoErp && <div className="flex gap-2"><button type="button" className={botao} onClick={() => setEditandoErp(true)}>Editar dados do ERP</button><button type="button" className={botao} onClick={() => setItem({})}>Novo item de conhecimento</button></div>}
              {admin && editandoErp && <FormErp inicial={e} aoSalvar={(d) => salvarErp.mutate(d)} aoCancelar={() => setEditandoErp(false)} salvando={salvarErp.isPending} erro={salvarErp.error && erroDe(salvarErp.error)} />}
              {admin && item && <FormItem key={item.id || "novo"} inicial={item} aoSalvar={(d) => salvarItem.mutate({ ...d, id: item.id })} aoCancelar={() => setItem(null)} salvando={salvarItem.isPending} erro={salvarItem.error && erroDe(salvarItem.error)} />}
            </section>
            {Object.entries(TIPOS_CONHECIMENTO).map(([tipo, rotulo]) => {
              const linhas = itens.filter((i) => i.tipo === tipo);
              return (
                <section key={tipo} aria-label={rotulo} className="space-y-2">
                  <h2 className="font-semibold">{rotulo} ({linhas.length})</h2>
                  <TabelaPadrao id={`erp-${tipo.toLowerCase()}`} ariaLabel={`${rotulo} do ${e.nome}`} colunas={colunasDoTipo(tipo, admin, setItem)} linhas={linhas} ordemInicial={null} tamanhoInicial={10} vazio="Nada cadastrado para este tipo." />
                </section>
              );
            })}
            <section aria-label="Histórico de alterações" className="space-y-2">
              <h2 className="font-semibold">Histórico de alterações</h2>
              <TabelaPadrao id="erp-historico" ariaLabel="Histórico de alterações do ERP" colunas={COLUNAS_HISTORICO} linhas={e.historico || []} ordemInicial={{ chave: "createdAt", dir: -1 }} tamanhoInicial={10} vazio="Sem alterações registradas." />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
