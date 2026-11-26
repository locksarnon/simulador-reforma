import { createContext, useContext, useState } from "react";
import { semFuncao } from "@/lib/permissoes";
import { AlertTriangle, Check, CheckCircle2, Circle, Clock, Diamond, Info, Loader2, Lock, RefreshCw, Square } from "lucide-react";
import { formaDaSituacao, mensagemDeErro, SITUACOES, textoDaCelula } from "./logica";

export const campoCls = "w-full border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export const botaoPrimario = "inline-flex items-center gap-1.5 bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const botaoSecundario = "inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const botaoPerigo = "inline-flex items-center gap-1.5 border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const ICONES = { circulo: Circle, visto: Check, losango: Diamond, quadrado: Square, relogio: Clock };
const COR_DA_SITUACAO = {
  PENDENTE: "border-border bg-background text-foreground",
  SEM_PROBLEMA: "border-emerald-600/50 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  PROPOSTO: "border-amber-600/60 bg-amber-500/15 text-amber-900 dark:text-amber-200",
  APROVADO: "border-emerald-700 bg-emerald-700 text-white",
  AGUARDANDO_INFORMACAO: "border-sky-600/60 border-dashed bg-sky-500/10 text-sky-900 dark:text-sky-200",
};

/** Situação da célula: ícone de forma própria + texto (não depende só da cor) + a marca "revisar". */
export function SeloSituacao({ situacao, revisar = false, curto = false, className = "" }) {
  const forma = formaDaSituacao(situacao);
  const Icone = ICONES[forma] || Circle;
  const rotulo = SITUACOES[situacao] ? (curto ? SITUACOES[situacao].curto : SITUACOES[situacao].rotulo) : "Sem dados";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-xs ${COR_DA_SITUACAO[situacao] || "border-border text-muted-foreground"} ${className}`} title={textoDaCelula({ situacao, revisar })}>
      <Icone className={`h-3 w-3 shrink-0 ${forma === "quadrado" || forma === "losango" ? "fill-current" : ""}`} aria-hidden="true" />
      <span>{rotulo}</span>
      {revisar && <MarcaRevisar />}
    </span>
  );
}

export function MarcaRevisar({ causa }) {
  return (
    <span className="ml-0.5 inline-flex items-center gap-0.5 border border-orange-600/60 bg-orange-500/15 px-1 text-[10px] font-semibold uppercase text-orange-900 dark:text-orange-200" title={causa || "Revisar: algo de que esta decisão depende mudou."}>
      <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />revisar
    </span>
  );
}

/** Tag pequena de texto (origem, etiqueta de enquadramento, selo "a desenvolver"). */
export function Tag({ children, tom = "neutro", className = "" }) {
  const cor = tom === "alerta" ? "border-orange-600/50 bg-orange-500/10 text-orange-900 dark:text-orange-200"
    : tom === "ok" ? "border-emerald-600/50 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
      : tom === "info" ? "border-sky-600/50 bg-sky-500/10 text-sky-900 dark:text-sky-200" : "border-border bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center whitespace-nowrap border px-1.5 py-0.5 text-[11px] ${cor} ${className}`}>{children}</span>;
}

export function Aviso({ tom = "info", titulo, children, acao, className = "" }) {
  const cor = tom === "erro" ? "border-destructive/60 bg-destructive/10" : tom === "alerta" ? "border-amber-600/60 bg-amber-500/10" : tom === "ok" ? "border-emerald-600/50 bg-emerald-600/10" : "border-border bg-muted/50";
  const Icone = tom === "ok" ? CheckCircle2 : tom === "bloqueio" ? Lock : AlertTriangle;
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={`flex flex-wrap items-start gap-2 border p-3 text-sm ${cor} ${className}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{titulo && <p className="font-semibold">{titulo}</p>}<div>{children}</div></div>
      {acao}
    </div>
  );
}

/** Mensagem de trava: aparece onde uma ação depende das atividades confirmadas. */
export function AvisoDeTrava({ mensagem, aoConfirmar }) {
  return (
    <Aviso tom="bloqueio" titulo={mensagem} acao={aoConfirmar && <button type="button" className={botaoSecundario} onClick={aoConfirmar}>Ir para a Configuração</button>}>
      A importação e as análises ficam bloqueadas até o consultor revisar e confirmar as atividades do cliente.
    </Aviso>
  );
}

export function EstadoCarregando({ texto = "Carregando…" }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 border border-border bg-card p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{texto}
    </div>
  );
}

export function EstadoErro({ erro, aoTentar, texto }) {
  return (
    <Aviso tom="erro" titulo={texto || "Não foi possível carregar."} acao={aoTentar && <button type="button" className={botaoSecundario} onClick={aoTentar}>Tentar de novo</button>}>
      {mensagemDeErro(erro, "Verifique a conexão e tente de novo.")}
    </Aviso>
  );
}

export function EstadoVazio({ titulo, children }) {
  return (
    <div className="border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {titulo && <p className="mb-1 font-semibold text-foreground">{titulo}</p>}
      <div>{children}</div>
    </div>
  );
}

/**
 * Casca de carregamento: mostra "carregando", o erro (com "tentar de novo") ou o vazio; senão, desenha o conteúdo.
 * `consulta` é o resultado de useQuery; `vazio(dados)` decide se está vazio e devolve o texto do estado vazio.
 */
export function Carregar({ consulta, vazio, tituloVazio, textoCarregando, textoErro, children }) {
  if (consulta.isError) return <EstadoErro erro={consulta.error} aoTentar={() => consulta.refetch()} texto={textoErro} />;
  if (consulta.data === undefined) return <EstadoCarregando texto={textoCarregando} />;
  const textoVazio = vazio ? vazio(consulta.data) : null;
  if (textoVazio) return <EstadoVazio titulo={tituloVazio}>{textoVazio}</EstadoVazio>;
  return children(consulta.data);
}

/** Botão "i": quem o usa mostra a explicação (com o mesmo id) quando `aberto`. Teclado e leitor de tela: aria-expanded e aria-controls. */
export function BotaoInfo({ id, rotulo, aberto, aoAlternar }) {
  return (
    <button type="button" aria-expanded={aberto} aria-controls={id} aria-label={`Sobre: ${rotulo}`} title={`Sobre: ${rotulo}`} onClick={aoAlternar}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * Texto longo numa célula de tabela densa: uma linha só, cortada com reticências, com o texto inteiro no título (passar o mouse) e ao clicar
 * (alterna entre cortado e inteiro). Mantém as linhas da tabela baixas.
 */
export function TextoLongo({ texto, largura = "max-w-[18rem]" }) {
  const [aberto, setAberto] = useState(false);
  const t = String(texto ?? "");
  if (!t) return null;
  return (
    <button type="button" title={t} aria-expanded={aberto} onClick={(e) => { e.stopPropagation(); setAberto((x) => !x); }}
      className={`block text-left ${largura} ${aberto ? "whitespace-normal break-words" : "truncate"}`}>{t}</button>
  );
}

export const Rotulo = ({ children, className = "" }) => <span className={`mb-1 block text-xs text-muted-foreground ${className}`}>{children}</span>;

/** Quem pode alterar dados (função "alterar"). A página informa; sem provedor (testes), vale como permitido. */
export const PermissaoContext = createContext({ podeAlterar: true });
export function usePodeAlterar() {
  const { podeAlterar } = useContext(PermissaoContext);
  return { pode: podeAlterar, razao: podeAlterar ? undefined : semFuncao("alterar") };
}
