/**
 * Padrão visual dos títulos de tabela do InTAX (um só lugar): fundo verde-escuro e texto branco, pelo token
 * --cabecalho-tabela (src/index.css). Tabelas HTML comuns já recebem a cor pela regra base de `thead th`; estas classes
 * servem às tabelas feitas de divs (role="columnheader") e a quem precisa da cor explícita.
 * `cabecalho-tabela` também faz texto cinza/escuro e links dentro do título seguirem o branco.
 */
export const cabecalhoTabelaCls = "cabecalho-tabela bg-cabecalho text-cabecalho-foreground";
