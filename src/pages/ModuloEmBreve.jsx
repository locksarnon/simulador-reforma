import { Link, Navigate, useParams } from "react-router-dom";
import { Clock } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ListaDePrevistas from "@/components/ListaDePrevistas";
import { areaPorId, caminhoDaArea, MODULOS, SITUACAO } from "@/lib/navegacao";

/** O que já existe hoje e cobre parte de cada módulo "em breve" (para ninguém achar que não há nada). */
const JA_EXISTE = {
  monitoramento: "A Captura de XML já guarda os XML dos clientes, captura NF-e, CT-e e NFS-e da SEFAZ e cuida do certificado A1 de cada empresa.",
  procuracoes: "O cofre de certificado A1 já existe na Captura de XML, com aviso de vencimento por e-mail.",
  "analise-risco": "O Painel executivo e o resumo executivo por IA já existem no Início.",
  "portal-contratos": "A Newsletter e os Leads já cobrem parte do relacionamento com o cliente.",
  "pessoas-fisicas": "Produtor rural pessoa física já pode ser cadastrado como empresa em Cadastro de clientes.",
};

/**
 * Página de um módulo que ainda não está pronto: diz para que serve, o que falta e o que já existe. Só administradores
 * veem o link no menu; quem chegar por endereço direto também encontra a explicação, em vez de uma tela vazia.
 */
export default function ModuloEmBreve() {
  const { moduloId } = useParams();
  const modulo = MODULOS.find((m) => m.id === moduloId);
  if (!modulo) {
    return (
      <div className="p-8">
        <p role="alert">Módulo não encontrado. <Link to="/inicio" className="text-primary hover:underline">Voltar ao Início</Link>.</p>
      </div>
    );
  }
  // Módulo que ficou pronto: o endereço antigo de "em breve" leva direto à tela dele.
  if (modulo.situacao !== SITUACAO.EM_BREVE && !modulo.to.startsWith("/em-breve/")) return <Navigate to={modulo.to} replace />;
  const area = areaPorId(modulo.area);
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: area.titulo, to: caminhoDaArea(area.id) }, { label: modulo.titulo }]}
        title={modulo.titulo}
        subtitle={modulo.descricao}
      />
      <div className="px-6 lg:px-8 py-6 max-w-3xl space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-2 text-sm">
            <p className="font-medium">Este módulo ainda não está pronto.</p>
            {modulo.quando && <p className="text-muted-foreground">O que falta: {modulo.quando}</p>}
            {JA_EXISTE[modulo.id] && <p className="text-muted-foreground">O que já existe: {JA_EXISTE[modulo.id]}</p>}
          </div>
        </div>
        <ListaDePrevistas moduloId={modulo.id} />
        <p className="text-xs text-muted-foreground">
          Quando for liberado, ele aparece no menu de {area.titulo} para todos os usuários. A lista completa do que está previsto fica em <code>docs/mapa-completo-veri-intax.md</code>.
        </p>
        <Link to={caminhoDaArea(area.id)} className="inline-block text-sm text-primary hover:underline">← Voltar a {area.titulo}</Link>
      </div>
    </div>
  );
}
