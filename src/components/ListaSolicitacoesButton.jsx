import React, { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { listaDoServico } from "@/lib/listaSolicitacoes/catalogo";
import { baixarLista, dadosDaCapa } from "@/lib/listaSolicitacoes/baixar";

const CHAVE_FAL = "intax.listaSolicitacoes.fal";

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Quem da FAL envia a lista é quase sempre a mesma pessoa: lembra o nome e o contato neste navegador.
const lerFal = () => { try { return JSON.parse(localStorage.getItem(CHAVE_FAL)) || {}; } catch { return {}; } };
const guardarFal = (v) => { try { localStorage.setItem(CHAVE_FAL, JSON.stringify(v)); } catch { /* sem armazenamento: segue sem lembrar */ } };

/**
 * Botão do cartão de cada serviço: abre uma janela curta (data-base, data de envio e contato da FAL) e baixa a lista de
 * solicitações ao cliente em Excel, com a logo da FAL Agro e os dados da empresa já preenchidos.
 */
export default function ListaSolicitacoesButton({ servico, empresa }) {
  const lista = listaDoServico(servico);
  const [aberto, setAberto] = useState(false);
  const [dataBase, setDataBase] = useState(`${new Date().getFullYear()}-12-31`);
  const [envio, setEnvio] = useState(hoje());
  const [responsavel, setResponsavel] = useState("");
  const [contatoFal, setContatoFal] = useState("");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState("");
  if (!lista) return null;

  // Lê o que foi guardado só ao abrir: outro cartão pode ter salvo o nome e o contato depois que esta tela carregou.
  const abrir = () => {
    const salvo = lerFal();
    setResponsavel((v) => v || salvo.responsavel || "");
    setContatoFal((v) => v || salvo.contatoFal || "");
    setErro("");
    setAberto(true);
  };

  const baixar = async () => {
    setExecutando(true); setErro("");
    try {
      await baixarLista(servico, dadosDaCapa(empresa, { dataBase, envio, responsavel, contatoFal }));
      guardarFal({ responsavel: responsavel.trim(), contatoFal: contatoFal.trim() });
      setAberto(false);
      toast({ title: "Lista baixada", description: `${lista.nome}: confira a Capa antes de enviar ao cliente.` });
    } catch (e) {
      setErro(e?.message || "Não foi possível gerar a lista.");
    } finally {
      setExecutando(false);
    }
  };

  const campo = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <>
      <button type="button" onClick={abrir} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" /> Lista de solicitações (Excel)
      </button>
      <Dialog open={aberto} onOpenChange={(v) => { if (!executando) setAberto(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lista de solicitações: {lista.nome}</DialogTitle>
            <DialogDescription>
              Excel com a logo da FAL Agro, para enviar ao cliente, com os documentos que o serviço precisa. Os dados de {empresa?.razao_social || "a empresa"} entram na Capa; as datas ajustam os prazos e os textos da lista.
            </DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="space-y-1"><span className="font-medium">Data-base</span><input type="date" className={campo} value={dataBase} onChange={(e) => setDataBase(e.target.value)} /></label>
            <label className="space-y-1"><span className="font-medium">Data de envio</span><input type="date" className={campo} value={envio} onChange={(e) => setEnvio(e.target.value)} /></label>
            <label className="space-y-1"><span className="font-medium">Responsável FAL</span><input type="text" className={campo} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} /></label>
            <label className="space-y-1"><span className="font-medium">Contato FAL (e-mail ou telefone)</span><input type="text" className={campo} value={contatoFal} onChange={(e) => setContatoFal(e.target.value)} /></label>
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <DialogFooter>
            <button type="button" disabled={executando} onClick={() => setAberto(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={executando} onClick={baixar} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {executando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Baixar Excel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
