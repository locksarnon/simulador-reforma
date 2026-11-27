import { createContext, useContext, useId, useState } from "react";
import { semFuncao } from "@/lib/permissoes";
import { AlertTriangle, Check, CheckCircle2, Circle, Clock, Diamond, Info, Loader2, Lock, RefreshCw, Square } from "lucide-react";
import { formaDaSituacao, mensagemDeErro, SITUACOES, textoDaCelula } from "./logica";

/**
 * Cores dos formulários: só tokens do tema, com contraste de pelo menos 3:1 nas bordas (WCAG AA) nos dois temas. Campo: o token --input
 * (52% de luminosidade no claro: cerca de 4:1 sobre branco e 3,5:1 sobre o fundo do quadro; no escuro, cerca de 3,6:1 sobre o fundo do
 * campo). Quadro: 50% do texto do tema (cerca de 3,3:1 no claro e 4,4:1 no escuro).
 */
export const bordaCampo = "border-input";
export const bordaQuadro = "border-foreground/50";
export const campoCls = "w-full border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export const botaoPrimario = "botao-acao inline-flex items-center gap-1.5 bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const botaoSecundario = "botao-acao inline-flex items-center gap-1.5 bg-background px-3 py-[5px] text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const botaoPerigo = "botao-acao botao-acao-perigo inline-flex items-center gap-1.5 px-3 py-[5px] text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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
export function BotaoInfo({ id, rotulo, aberto, aoAlternar, pequeno = false }) {
  return (
    <button type="button" aria-expanded={aberto} aria-controls={id} aria-label={`Sobre: ${rotulo}`} title={`Sobre: ${rotulo}`} onClick={aoAlternar}
      className={`inline-flex ${pequeno ? "h-5 w-5" : "h-6 w-6"} shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
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

/**
 * Visual das tabelas do Saneamento (o da aba Tabela): cabeçalho fixo no topo em fundo "muted", linhas de 38 px com zebra, linhas de grade
 * finas e colunas fixas à esquerda com fundo opaco. A Tabela, os Casos e as Unificações usam as mesmas classes.
 */
export const estiloTabela = {
  area: "relative overflow-auto border border-border bg-card",
  cabecalho: "sticky top-0 z-30 bg-muted",
  celula: "flex items-center overflow-hidden border-l border-border/40 px-2",
  /** Títulos: verde-escuro com texto branco (o padrão de tabela do InTAX, token --cabecalho-tabela); `relative` para a alça de largura. */
  tituloColuna: "cabecalho-tabela relative flex items-center border-l border-white/20 bg-cabecalho px-2 text-cabecalho-foreground",
  tituloFixo: "cabecalho-tabela sticky z-40 flex items-center bg-cabecalho px-2 font-medium text-cabecalho-foreground",
  linha: "flex border-b border-border/60 text-[13px]",
  /** Fundo da linha: marcada, ímpar (zebra) ou par. */
  fundoLinha: (i, marcado) => (marcado ? "bg-primary/10" : i % 2 ? "bg-muted/20" : "bg-card"),
  /** Fundo das células fixas (opaco, para o que rola por baixo não aparecer). */
  fundoFixo: (i, marcado) => (marcado ? "bg-primary/10" : i % 2 ? "bg-muted" : "bg-card"),
};

/** Situação com cor e texto (casos e linhas das unificações): o texto sempre aparece, a cor só reforça. */
const TOM_DA_SITUACAO = {
  PROPOSTO: "alerta", PROPOSTA: "alerta", RASCUNHO: "neutro", APROVADO: "ok", APROVADA: "ok", AGUARDANDO_INFORMACAO: "info", AGUARDANDO: "info", REJEITADO: "neutro", OBSOLETO: "neutro", REGISTRADA: "neutro",
};
export const SeloTexto = ({ situacao, children }) => <Tag tom={TOM_DA_SITUACAO[situacao] || "neutro"}>{children}</Tag>;

/** Rótulo do campo: texto secundário mais escuro (80% do texto do tema), peso médio e separado do valor. */
export const rotuloCls = "mb-1 block text-xs font-medium text-foreground/80";
export const Rotulo = ({ children, className = "" }) => <span className={`${rotuloCls} ${className}`}>{children}</span>;

/** Texto de apoio (dicas, "vem do projeto…"): 75% do texto do tema, legível também sobre o fundo dos quadros. */
export const textoApoioCls = "text-xs text-foreground/75";
/** Faixas e corpos do padrão (as mesmas do SecaoForm e do Quadro), para telas que montam a seção sem o componente. */
export const faixaSecaoCls = "border-b-2 border-primary bg-muted px-4 py-2";
export const faixaQuadroCls = `border-b ${bordaQuadro} bg-primary/10 px-3 py-1.5`;
/** Seção com o título como primeiro filho: `secaoCls` no contêiner (p-4) e `tituloSecaoCls` no título, que vira a faixa. */
export const secaoCls = `border ${bordaQuadro} bg-card p-4`;
export const tituloSecaoCls = `-mx-4 -mt-4 mb-3 ${faixaSecaoCls} text-sm font-semibold text-foreground`;
/** Quadro com o título como primeiro filho: `quadroCls` no contêiner (p-3) e `tituloQuadroCls` no título, que vira a faixa. */
export const quadroCls = `border ${bordaQuadro} bg-muted p-3 shadow-sm`;
export const tituloQuadroCls = `-mx-3 -mt-3 mb-2 ${faixaQuadroCls} text-sm font-semibold text-foreground`;

/**
 * Seção do formulário (Identificação, o bloco do aspecto, Ações, Dados do projeto…): borda nítida e faixa de título com a linha verde
 * embaixo, para ver onde a seção começa e termina. `nivel` é a tag do título (h2, h3…); `idTitulo` liga o aria-labelledby.
 */
export function SecaoForm({ titulo, nivel: Titulo = "h3", idTitulo, ariaLabel, acoes, children, className = "", corpoCls = "" }) {
  const gerado = useId();
  const id = idTitulo || `${gerado}-t`;
  return (
    <section aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : id} className={`border ${bordaQuadro} bg-card ${className}`}>
      <div className={`flex flex-wrap items-center gap-2 ${faixaSecaoCls}`}>
        <Titulo id={id} className="text-sm font-semibold text-foreground">{titulo}</Titulo>
        {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      <div className={`p-4 ${corpoCls || "space-y-3"}`}>{children}</div>
    </section>
  );
}

/**
 * Quadro (repetível ou de um assunto: Limite N, atributo, Componentes e ordem, Evidência…): borda nítida, faixa de cabeçalho em verde
 * suave com o título em negrito e os selos, corpo com fundo próprio (diferente do formulário em volta) e os campos em fundo de campo.
 * Em lista, use `as="li"` num contêiner com espaço visível entre os quadros (space-y-4).
 */
export function Quadro({ titulo, nivel: Titulo = "span", selos, acoes, dica, children, as: Elemento = "div", ariaLabel, className = "", corpoCls = "" }) {
  const id = useId();
  const grupo = Elemento === "li" || Elemento === "section" ? {} : { role: "group" };
  return (
    <Elemento {...grupo} aria-label={ariaLabel} aria-labelledby={!ariaLabel && titulo ? `${id}-t` : undefined} className={`border ${bordaQuadro} bg-card shadow-sm ${className}`}>
      {(titulo || selos || acoes) && (
        <div className={`flex flex-wrap items-center gap-2 ${faixaQuadroCls}`}>
          {titulo && <Titulo id={`${id}-t`} className="text-sm font-semibold text-foreground">{titulo}</Titulo>}
          {selos}
          {acoes && <div className="ml-auto flex flex-wrap items-center gap-1">{acoes}</div>}
        </div>
      )}
      <div className={`bg-muted p-3 ${corpoCls || "space-y-2"}`}>
        {dica && <p className={textoApoioCls}>{dica}</p>}
        {children}
      </div>
    </Elemento>
  );
}

/** Quem pode alterar dados (função "alterar"). A página informa; sem provedor (testes), vale como permitido. */
export const PermissaoContext = createContext({ podeAlterar: true });
export function usePodeAlterar() {
  const { podeAlterar } = useContext(PermissaoContext);
  return { pode: podeAlterar, razao: podeAlterar ? undefined : semFuncao("alterar") };
}
