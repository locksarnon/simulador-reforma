/**
 * Padrão visual dos títulos de tabela do InTAX (um só lugar): fundo verde-escuro e texto branco, pelo token
 * --cabecalho-tabela (src/index.css). Tabelas HTML comuns já recebem a cor pela regra base de `thead th`; estas classes
 * servem às tabelas feitas de divs (role="columnheader") e a quem precisa da cor explícita.
 * `cabecalho-tabela` também faz texto cinza/escuro e links dentro do título seguirem o branco.
 */
export const cabecalhoTabelaCls = "cabecalho-tabela bg-cabecalho text-cabecalho-foreground";

/**
 * Barra única das listas (uma linha só, lado a lado, quebrando só em tela estreita): busca, filtros, colunas, exportar e ações
 * com a mesma altura (h-8) e o mesmo texto (text-xs). Selects mostram o sentido dentro (primeira opção "Regime: todos").
 */
export const barraListaCls = "flex flex-wrap items-center gap-1.5";
export const campoBarraCls = "h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const botaoBarraCls = "botao-acao inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs hover:bg-muted";
