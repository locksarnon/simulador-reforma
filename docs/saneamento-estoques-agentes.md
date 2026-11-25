# Saneamento de Estoques — agentes especialistas (versão para revisão)

Contrato de trabalho. Cada agente recebe: este quadro, `docs/saneamento-estoques.md` e o código existente. Ninguém escreve fora do próprio escopo; mudança de contrato passa pelo integrador (Claude principal).

Regras comuns a todos: português; **menos é mais**; sem funcionalidade não pedida; reaproveitar o que existe (`src/components/saneamento/*.js`, `backend/src/produtos/*`); testes junto com o código; sem commit, push nem deploy (só o integrador); lembrar das armadilhas do ambiente (Windows, `NODE_OPTIONS`, testes em lotes; 11 testes de Excel falham só no Windows); nunca guardar dados reais de cliente no repositório; **nada de IA gravando decisão**.

## Ordem

1. **Agente 1 (dados e API)** entrega o esquema e os contratos de API primeiro; o integrador congela.
2. **Agentes 2 a 7** trabalham em paralelo sobre o contrato.
3. **Integrador** une tudo e roda a suíte inteira.
4. **Agentes 9 e 10 (revisores independentes)** revisam, sem ter escrito nada.
5. **Agente 11 (QA ponta a ponta)** percorre tudo no navegador com a base real da Crestani.
6. **Agente 8 (documentação)** fecha POP e FAQ por último, com a interface pronta.

## Quadro

| # | Especialista | Escopo (arquivos) | Entrega | Pronto quando |
|---|---|---|---|---|
| 1 | **Dados e API** | `backend/prisma` (migração **aditiva**), `backend/src/saneamento/*` (novo módulo) | Tabelas: projeto, atividade, importação, item (id estável, original + trabalho), caso, decisão (por campo), conjunto, versão, impacto SPED. Endpoints: configurar, confirmar atividades, importar (prévia, confirmar, reimportar com diff), listar itens/casos, decidir, lote, versionar, comparar. Bloqueio otimista. Permissões e histórico | Migração aplica e reverte limpa em banco de teste; testes de concorrência, reimportação e trava de atividades; contrato de API documentado |
| 2 | **Importação e base** | leitura de planilha, mapeamento, prévia, relatório de linhas; usa `leitura-planilha.ts` | Leitura em fluxo (milhares de linhas), zeros à esquerda, colunas obrigatórias, relatório aceitas/rejeitadas/pendentes; coluna opcional Finalidade | 30 mil linhas sem estourar memória; teste com a estrutura da Crestani (sintética) |
| 3 | **Motor de análise** | migra para o novo módulo: qualidade, duplicidade, grupos, nomes e unidades, NCM (a partir de `checagens.js`, `conjuntos.js`, `identidade.js`, `unidades.js`, `analise.js`) | Cada camada gera casos com problema, evidência, proposta e fundamento; dependências geram a marca "revisar" | Resultados idênticos aos atuais nos testes migrados; novos testes das dependências |
| 4 | **Fiscal e SPED** | `finalidade`, `enquadramento`, `cenários`, `atividades (CNAE)`, `impacto SPED` | Sugestão de Finalidade (grupo + nome + atividades); enquadramento por NCM + finalidade com texto da lei, artigo e vigência (LC 214 carregada + cClassTrib SVRS); 4 cenários; herdado/exceção; checklist de impacto SPED (tabela do plano); alerta CNAE × CFOP | Sem base legal → "aguardando informação", nunca inventa; testes com casos do agro (insumos, revenda, consumo, devolução) |
| 5 | **Interface** | `src/components/saneamento-v2/*`, rotas, página do projeto | Configuração com trava de atividades e módulos opcionais (com "i"); tabela única com cabeçalho fixo e virtualização; visão geral por grupo; visão focada; caso (salvar, aprovar, rejeitar, pedir informação, reabrir); lote; filtros; "ir ao próximo pendente"; versões e comparação | Percurso completo no navegador; 30 mil linhas fluidas; teclado e foco corretos; padrão visual e tabelas padrão do sistema |
| 6 | **Entregáveis** | exportação | Excel de 6 abas (zeros, filtros, IDs); relatório de fechamento em PDF (padrão FAL/InTAX, `PdfService`); diferença entre revisão e liberada; exportar versão específica | Abre no Excel (conferido por COM no Windows) e no PDF; texto do relatório sem "minuta" nem metacomentário |
| 7 | **IA nas bordas** | parecer por caso; botão geral de consultoria | Parecer curto (recomendação, confiança, a favor/contra, confirmar, fontes, prática de mercado rotulada) pela ponte do Claude (Gemini de reserva); precedentes por família; roteiro por serviço | Falha da IA não bloqueia; nunca grava; limites de volume e de custo; prompt contra instruções vindas dos dados |
| 8 | **Documentação** | POPs, FAQ, manual, roteiro de testes | POP de cada tela nova e FAQ; teste que exige POP para toda tela do menu continua verde | Suíte de manual verde |
| 9 | **Revisor independente A — regra de negócio** | só lê | Confere o código contra o plano: trava, dependências, reimportação, versões, tributação, SPED | Relatório de achados classificado (crítico/alto/médio); **zero crítico aberto** |
| 10 | **Revisor independente B — código e segurança** | só lê | Concorrência, integridade, permissões, vazamento de dados para a IA, injeção, desempenho | Mesmo critério |
| 11 | **QA ponta a ponta** | navegador local | Percurso real com a base da Crestani e o caso sintético completo; reimportação; conflito; queda no meio | Todos os critérios de aceite do plano com evidência |

O **integrador** (Claude principal) congela o contrato, resolve conflitos entre agentes, roda a suíte inteira, trata os achados dos revisores, faz o commit, o push e o único deploy (com backup e migração aditiva), e atualiza a memória do projeto.

## Limites de escopo (para ninguém "melhorar" fora do combinado)

- Não mexer no saneamento atual da Crestani nem em outros serviços, exceto o botão geral de IA.
- Não criar tela de plano de ajustes (é filtro).
- Não construir conciliação, Blocos K/G nem arquivo para o ERP (ver decisão pendente).
- Não integrar Sintegra.
