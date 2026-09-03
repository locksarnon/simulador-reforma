import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, Plus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import GrupoCard from "@/components/GrupoCard";
import InfoTooltip from "@/components/InfoTooltip";

export default function DataHub() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState(null);
  const [form, setForm] = useState({ numero: "", nome: "", tipo: "Grupo familiar", observacao: "" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ["grupos"],
    queryFn: () => base44.entities.Grupo.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Grupo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupos"] });
      setDialogOpen(false);
      setForm({ numero: "", nome: "", tipo: "Grupo familiar", observacao: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Grupo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupos"] });
      setDialogOpen(false);
      setEditingGrupo(null);
    },
  });

  const handleDelete = async (g) => {
    if (!confirm(`Excluir o grupo "${g.nome}"? Esta ação não pode ser desfeita.`)) return;
    await base44.entities.Grupo.delete(g.id);
    queryClient.invalidateQueries({ queryKey: ["grupos"] });
  };

  const openNew = () => {
    setForm({ numero: nextNumero, nome: "", tipo: "Grupo familiar", observacao: "" });
    setEditingGrupo(null);
    setDialogOpen(true);
  };

  const openEdit = (g) => {
    setForm({ numero: g.numero || "", nome: g.nome || "", tipo: g.tipo || "Grupo familiar", observacao: g.observacao || "" });
    setEditingGrupo(g);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editingGrupo) {
      updateMutation.mutate({ id: editingGrupo.id, data: form });
    } else {
      createMutation.mutate({ ...form, ifme_consolidado: 0, ifme_meta: 3, status_ifme: "Pendente" });
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return grupos;
    return grupos.filter(g =>
      g.nome?.toLowerCase().includes(q) || g.numero?.toLowerCase().includes(q)
    );
  }, [grupos, search]);

  const nextNumero = `#${String(grupos.length + 1).padStart(3, "0")}`;

  return (
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-semibold">Hub de Grupos</h1>
            <InfoTooltip pagina="datahub" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão de grupos econômicos e diagnósticos tributários
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Grupo
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum grupo cadastrado. Clique em "Novo Grupo" para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(g => (
            <GrupoCard key={g.id} grupo={g} onClick={() => navigate(`/workroom/${g.id}`)} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGrupo ? `Editar ${editingGrupo.nome}` : "Novo Grupo Econômico"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Número <InfoTooltip pagina="datahub" chave="numero" /></Label>
              <Input value={form.numero} onChange={(e) => setForm(f => ({ ...f, numero: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do grupo <InfoTooltip pagina="datahub" chave="nome" /></Label>
              <Input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Grão Pará" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo <InfoTooltip pagina="datahub" chave="tipo" /></Label>
              <Input value={form.tipo} onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))} placeholder="Ex: Condomínio rural" />
            </div>
            <div className="space-y-1.5">
              <Label>Observação <InfoTooltip pagina="datahub" chave="observacao" /></Label>
              <Input value={form.observacao} onChange={(e) => setForm(f => ({ ...f, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!form.nome || saving} onClick={handleSave}>
              {saving ? "Salvando..." : editingGrupo ? "Salvar" : "Criar Grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}