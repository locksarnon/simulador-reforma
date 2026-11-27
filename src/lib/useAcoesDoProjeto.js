import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";

/**
 * Ações de um projeto (salvar dados e situação, excluir, pedir ou recusar a exclusão): as mesmas na página do projeto e nos dados do
 * projeto que abrem dentro da ferramenta (Saneamento de estoques), para as regras de exclusão serem uma só.
 */
export function useAcoesDoProjeto(p, { aoSalvar } = {}) {
  const id = p?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const pendente = Boolean(p?.exclusao_solicitada_em);
  const acaoExclusao = admin ? (pendente ? "Aprovar e excluir" : "Excluir projeto") : "Solicitar exclusão";
  const atualizar = (novo) => {
    qc.setQueryData(["projetos-diagnostico", id], novo);
    qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] });
  };

  const salvar = useMutation({
    mutationFn: (dados) => api.put(`/projetos-diagnostico/${id}`, dados),
    onSuccess: (novo) => {
      atualizar(novo);
      qc.invalidateQueries({ queryKey: ["servicos-contratados"] });
      aoSalvar?.(novo);
      toast({ title: p?.servico_consultoria ? "Projeto atualizado" : "Diagnóstico atualizado" });
    },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });

  const exclusao = useMutation({
    mutationFn: (recusar) => {
      if (!recusar && admin && pendente) return api.post(`/projetos-diagnostico/${id}/solicitacao-exclusao/aprovar`, {});
      return api.delete(`/projetos-diagnostico/${id}${recusar ? "/solicitacao-exclusao" : ""}`);
    },
    onSuccess: (resposta, recusar) => {
      if (recusar || resposta.pendente) {
        atualizar(recusar ? resposta : resposta.projeto);
        toast({ title: recusar ? "Solicitação recusada" : "Solicitação enviada ao administrador" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] });
      navigate(p.servico_consultoria ? "/consultoria/projetos" : "/diagnostico");
    },
    onError: (e) => toast({ title: "Não foi possível concluir a ação", description: e.message, variant: "destructive" }),
  });

  const excluir = async () => {
    if (await confirmar({
      titulo: `${acaoExclusao}: ${p.nome}?`,
      descricao: admin ? "O projeto será excluído. Os trabalhos das empresas permanecem disponíveis." : "O projeto permanece ativo até um administrador autorizar a exclusão.",
      rotulo: acaoExclusao,
    })) exclusao.mutate(false);
  };

  return { admin, pendente, acaoExclusao, salvar, exclusao, excluir };
}
