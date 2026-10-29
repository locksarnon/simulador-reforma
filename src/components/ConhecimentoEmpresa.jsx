import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ADDONS, conhecimentoDaEmpresa } from '@/lib/conhecimentoSistemas';
import EmpresaFormDialog from '@/components/empresas/EmpresaFormDialog';

/** Barra compacta com o ERP e os add-ons da empresa; as orientações documentadas ficam recolhidas até serem pedidas. */
export default function ConhecimentoEmpresa({ empresa, editar = false }) {
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState(false);
  const regras = conhecimentoDaEmpresa(empresa);
  const sistemas = `${empresa?.erp || 'ERP não informado'}${empresa?.erp_versao ? ' · ' + empresa.erp_versao : ''} · ${(empresa?.addons || []).map((id) => ADDONS.find((a) => a.id === id)?.nome || id).join(', ') || 'sem add-ons vinculados'}`;
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button type="button" onClick={() => setDetalhe((d) => !d)} aria-expanded={detalhe} className="flex items-center gap-2 text-left text-sm min-w-0">
          {detalhe ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
          <span className="font-medium">Sistemas da empresa</span>
          <span className="text-muted-foreground truncate">{sistemas}</span>
          {regras.length > 0 && <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground whitespace-nowrap">{regras.length} {regras.length === 1 ? 'orientação' : 'orientações'}</span>}
        </button>
        {editar && <button type="button" onClick={() => setAberto(true)} className="border border-border rounded-md px-2.5 py-1 text-xs hover:bg-muted">Editar ERP e add-ons</button>}
      </div>
      {detalhe && (
        <div className="border-t border-border p-3 space-y-3">
          <p className="text-xs text-muted-foreground">Referências documentadas para orientar o saneamento. Confirme linha, versão e customizações da empresa antes de transformar uma orientação em regra automática. A seleção de sistemas não conecta o banco de dados.</p>
          {regras.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left bg-muted"><tr><th className="p-2">Sistema e escopo</th><th className="p-2">Orientação</th><th className="p-2">Fonte e revisão</th></tr></thead>
                <tbody>
                  {regras.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="p-2">{ADDONS.find((a) => a.id === r.addon)?.nome}<p className="text-xs text-muted-foreground">{r.linha || 'API v1'}{r.erp ? ' · ' + r.erp : ''}</p></td>
                      <td className="p-2"><p className="font-medium">{r.titulo}</p><p className="text-muted-foreground mt-1">{r.orientacao}</p>{r.campos.length > 0 && <p className="text-xs font-mono mt-2">{r.campos.join(' · ')}</p>}</td>
                      <td className="p-2 max-w-xs"><a href={r.fonte} target="_blank" rel="noreferrer" className="text-primary underline">Documentação do fornecedor</a><p className="text-xs text-muted-foreground mt-1">{r.versaoFonte}</p><span className="inline-block mt-2 rounded px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-xs">Validar na instalação</span></td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">Vincule PIMS ou FARMBOX para consultar as referências disponíveis. Para os demais sistemas, a base será ampliada conforme as fontes forem revisadas.</p>}
        </div>)}
      {editar && <EmpresaFormDialog open={aberto} onOpenChange={setAberto} editing={empresa} grupoNumero={empresa?.grupo} />}
    </section>
  );
}
