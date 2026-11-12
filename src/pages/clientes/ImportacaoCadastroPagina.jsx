import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import BotaoExportar from "@/components/BotaoExportar";
import { exportarLista } from "@/lib/exportarLista";
import { analisarImportacao, analisarVinculos, CAMPOS, EXEMPLO_MODELO, lerPlanilha, valorParaPlanilha } from "@/lib/importacaoCadastro";
import { useColaboradores } from "@/lib/useTags";
import ListaDePrevistas from "@/components/ListaDePrevistas";
import { plural, palavra } from "@/lib/plural";

function EscolherArquivo({ rotulo, aoLer }) {
  const [lendo, setLendo] = useState(false);
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
      {lendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />} {rotulo}
      <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setLendo(true);
        try { aoLer(await lerPlanilha(f), f.name); } catch (err) { toast({ title: "Não foi possível ler a planilha", description: err.message, variant: "destructive" }); } finally { setLendo(false); }
      }} />
    </label>
  );
}

function Erros({ erros }) {
  if (!erros.length) return null;
  return (
    <div className="rounded-md border border-red-400/60 p-3 text-xs">
      <p className="mb-1 font-medium text-red-700 dark:text-red-400">{plural(erros.length, "linha com erro", "linhas com erro")} (ficam de fora):</p>
      <ul className="max-h-40 overflow-y-auto space-y-0.5">{erros.map((e) => <li key={`${e.linha}-${e.motivo}`}>Linha {e.linha}: {e.motivo}</li>)}</ul>
    </div>
  );
}

function AbaEmpresas({ empresas, grupos, ehAdmin }) {
  const qc = useQueryClient();
  const [analise, setAnalise] = useState(null);
  const aplicar = useMutation({
    mutationFn: async () => {
      if (analise.novas.length) await api.entities.Empresa.bulkCreate(analise.novas.map((n) => n.dados));
      if (analise.atualizar.length) await api.entities.Empresa.bulkUpdate(analise.atualizar.map((a) => ({ id: a.id, ...a.mudancas })));
      return { novas: analise.novas.length, atualizadas: analise.atualizar.length };
    },
    onSuccess: (r) => { toast({ title: "Cadastro importado", description: `Novas: ${r.novas}. Atualizadas: ${r.atualizadas}.` }); setAnalise(null); qc.invalidateQueries({ queryKey: ["empresas"] }); },
    onError: (e) => toast({ title: "A importação parou", description: e.message, variant: "destructive" }),
  });
  const colunasExport = CAMPOS.map((c) => ({ chave: c.campo, rotulo: c.rotulo, valor: (l) => valorParaPlanilha(c.campo, l[c.campo]) }));
  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h2 className="font-heading text-sm font-semibold">Exportar o cadastro</h2>
        <p className="text-muted-foreground">{plural(empresas.length, "empresa", "empresas")}.</p>
        <BotaoExportar titulo="Cadastro de empresas" linhas={empresas} colunas={colunasExport} />
      </section>
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-heading text-sm font-semibold">Importar empresas de uma planilha</h2>
        <p className="text-muted-foreground">Excel (.xlsx) ou CSV no formato do modelo. Célula vazia não apaga o cadastro.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => exportarLista({ titulo: "Modelo de importação de empresas", colunas: colunasExport, linhas: [{ ...EXEMPLO_MODELO, grupo: grupos[0]?.numero || "001" }], formato: "xlsx" })} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Baixar o modelo</button>
          {ehAdmin ? <EscolherArquivo rotulo="Escolher a planilha" aoLer={(linhas) => setAnalise(analisarImportacao(linhas, empresas, grupos))} /> : <p className="text-xs text-muted-foreground">Só administradores importam.</p>}
        </div>
        {analise && (
          <div className="space-y-3">
            <p role="status"><strong>{analise.novas.length}</strong> {palavra(analise.novas.length, "nova", "novas")}, <strong>{analise.atualizar.length}</strong> a atualizar, {analise.sem_mudanca} sem mudança, <strong>{analise.erros.length}</strong> com erro.</p>
            {analise.atualizar.length > 0 && <ul className="max-h-40 overflow-y-auto text-xs divide-y divide-border/50">{analise.atualizar.map((a) => <li key={a.linha} className="py-1"><span className="font-medium">{a.razao_social}</span>: {Object.entries(a.mudancas).map(([k, v]) => `${CAMPOS.find((c) => c.campo === k)?.rotulo || k} → ${valorParaPlanilha(k, v)}`).join("; ")}</li>)}</ul>}
            {analise.novas.length > 0 && <ul className="max-h-32 overflow-y-auto text-xs">{analise.novas.map((n) => <li key={n.linha}>Nova: {n.dados.razao_social} (grupo {n.dados.grupo})</li>)}</ul>}
            <Erros erros={analise.erros} />
            <div className="flex gap-2">
              <button type="button" onClick={() => aplicar.mutate()} disabled={(!analise.novas.length && !analise.atualizar.length) || aplicar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{aplicar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Importar</button>
              <button type="button" onClick={() => setAnalise(null)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function AbaVinculos({ empresas, ehAdmin }) {
  const qc = useQueryClient();
  const { data: colaboradores = [] } = useColaboradores();
  const [analise, setAnalise] = useState(null);
  const aplicar = useMutation({
    mutationFn: async () => { let n = 0; for (const g of analise.porColaborador) n += (await api.post("/carteira/vinculos", { user_id: g.user_id, empresa_ids: g.empresa_ids, modo: "adicionar" })).adicionadas; return n; },
    onSuccess: (n) => { toast({ title: "Vínculos importados", description: `${plural(n, "vínculo novo", "vínculos novos")}.` }); setAnalise(null); qc.invalidateQueries({ queryKey: ["carteira"] }); },
    onError: (e) => toast({ title: "A importação parou", description: e.message, variant: "destructive" }),
  });
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
      <h2 className="font-heading text-sm font-semibold">Importar a carteira por colaborador</h2>
      <p className="text-muted-foreground">Colunas "CNPJ/CPF" e "E-mail do colaborador". Vínculos existentes não saem.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => exportarLista({ titulo: "Modelo de vínculos", colunas: [{ chave: "doc", rotulo: "CNPJ/CPF" }, { chave: "email", rotulo: "E-mail do colaborador" }], linhas: [{ doc: empresas[0]?.cnpj_cpf || "00.000.000/0001-00", email: colaboradores[0]?.email || "colaborador@fal" }], formato: "xlsx" })} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Baixar o modelo</button>
        {ehAdmin ? <EscolherArquivo rotulo="Escolher a planilha" aoLer={(linhas) => setAnalise(analisarVinculos(linhas, empresas, colaboradores))} /> : <p className="text-xs text-muted-foreground">Só administradores importam.</p>}
      </div>
      {analise && (
        <div className="space-y-2">
          <ul className="text-xs">{analise.porColaborador.map((g) => <li key={g.user_id}>{g.nome}: {plural(g.empresa_ids.length, "empresa", "empresas")}</li>)}</ul>
          <Erros erros={analise.erros} />
          <div className="flex gap-2">
            <button type="button" onClick={() => aplicar.mutate()} disabled={!analise.porColaborador.length || aplicar.isPending} className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">Importar vínculos</button>
            <button type="button" onClick={() => setAnalise(null)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Clientes > Importação e exportação: o cadastro de empresas e a carteira por colaborador, por planilha. */
export default function ImportacaoCadastroPagina() {
  const { user } = useAuth();
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const grp = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list() });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  const ehAdmin = user?.role === "admin";
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Planilha cadastral" }]} title="Planilha cadastral" />
      <div className="px-6 lg:px-8 py-6 max-w-4xl">
        {(emp.isLoading || grp.isLoading) ? <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p> : (
          <Tabs defaultValue="empresas" className="space-y-4">
            <TabsList><TabsTrigger value="empresas">Empresas</TabsTrigger><TabsTrigger value="vinculos">Carteira por colaborador</TabsTrigger></TabsList>
            <TabsContent value="empresas"><AbaEmpresas empresas={empresas} grupos={grp.data || []} ehAdmin={ehAdmin} /></TabsContent>
            <TabsContent value="vinculos"><AbaVinculos empresas={empresas} ehAdmin={ehAdmin} /></TabsContent>
          </Tabs>
        )}
        <div className="mt-6"><ListaDePrevistas moduloId="grupos-empresas" /></div>
      </div>
    </div>
  );
}
