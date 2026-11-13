import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ADDONS, conhecimentoDaEmpresa } from '@/lib/conhecimentoSistemas';
import EmpresaFormDialog from '@/components/empresas/EmpresaFormDialog';
import TabelaPadrao from '@/components/TabelaPadrao';

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
          {regras.length ? (
            <TabelaPadrao simples id="conhecimento-sistemas" ariaLabel="Orientações dos sistemas da empresa" linhas={regras}
              colunas={[
                { chave: 'sistema', rotulo: 'Sistema', valor: (r) => ADDONS.find((a) => a.id === r.addon)?.nome || r.addon },
                { chave: 'linha', rotulo: 'Escopo', valor: (r) => r.linha || 'API v1' },
                { chave: 'erp', rotulo: 'ERP', valor: (r) => r.erp || '' },
                { chave: 'titulo', rotulo: 'Título', render: (r) => <span className="font-medium">{r.titulo}</span> },
                { chave: 'orientacao', rotulo: 'Orientação', quebrar: true, render: (r) => <span className="text-muted-foreground">{r.orientacao}</span> },
                { chave: 'campos', rotulo: 'Campos', valor: (r) => r.campos.join(' · '), render: (r) => <span className="text-xs font-mono">{r.campos.join(' · ')}</span> },
                { chave: 'versaoFonte', rotulo: 'Revisão da fonte', render: (r) => <span className="text-xs text-muted-foreground">{r.versaoFonte}</span> },
                { chave: 'fonte', rotulo: 'Fonte', ordenavel: false, filtravel: false, render: (r) => <a href={r.fonte} target="_blank" rel="noreferrer" className="text-primary underline">Documentação do fornecedor</a> },
                { chave: 'situacao', rotulo: 'Situação', valor: () => 'Validar na instalação', render: () => <span className="inline-block rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-xs">Validar na instalação</span> },
              ]}
            />
          ) : <p className="text-sm text-muted-foreground">Vincule PIMS ou FARMBOX para ver as referências.</p>}
        </div>)}
      {editar && <EmpresaFormDialog open={aberto} onOpenChange={setAberto} editing={empresa} grupoNumero={empresa?.grupo} />}
    </section>
  );
}
