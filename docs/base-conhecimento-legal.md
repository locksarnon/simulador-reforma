# Bases legais (InTAX): base de conhecimento da legislação

Menu: **Consultas fiscais > Bases legais** (`/base-legal`). No topo fica a barra **Consultar as bases legais** (busca o texto em todas as normas e, com a IA ligada, responde com o artigo citado). A página tem três abas: **Normas e assistente**, **Novidades e revogações** e **Revisão semanal**.

## Consulta (barra no alto da página)

A barra **Consultar as bases legais** (`ConsultaBasesLegais.jsx`) faz, com a mesma pergunta, a busca no texto de **todas** as normas (`GET /base-legal/busca`, índice GIN `DispositivoLegal_texto_fts`; dá para restringir a uma norma) e, com "Resposta com IA" ligada, a pergunta ao assistente (`POST /base-legal/perguntar`, ou `perguntar-aprofundado` com a pesquisa aprofundada). As respostas já revisadas pela equipe (`/base-legal/cartoes/busca`) chegam antes. Busca por número de artigo ("art 164") não chama a IA. A busca devolve também `revogado`, `parcialmente_revogado` e a situação da norma: o revogado vem marcado e por último. A resposta da IA fica no cache da sessão (mesma pergunta e mesma chave de pesquisa aprofundada não perguntam de novo ao voltar da leitura de um artigo); o endereço guarda a consulta (`?q=`).

## O que a base guarda

- **Texto oficial por dispositivo** (artigo ou anexo) de cerca de 70 normas, em seis blocos: fundamentos, reforma do consumo, tributação federal atual, agro, ICMS/ISS e benefícios estaduais, obrigações e documentos fiscais. Catálogo em `backend/src/base-legal/fontes.ts` (só URLs oficiais conferidas).
- **Norma editada ou revogada**, lida do próprio texto oficial a cada captura:
  - o que o site mostra **riscado** (redação antiga, dispositivo revogado) nunca entra como texto vigente: vai para `redacoes_anteriores`;
  - `alteracoes`: notas oficiais ("Redação dada pela Lei Complementar nº 227, de 2026", "Incluído...", "Revogado...", "Vide...");
  - `revogado`, `parcialmente_revogado`, `revogado_por` (ato ou `veto`) e `alterado_em` por dispositivo;
  - `situacao` da norma (`vigente`, `parcialmente_revogada`, `revogada`), `revogada_por`, `atualizada_em` e `atos_modificadores` (quais atos mexeram nela e em quantos dispositivos);
  - versões anteriores do texto (`DispositivoLegalVersao`) quando o texto muda;
  - remissões entre normas (`ReferenciaLegal`: "(Art. 38 da LC 214/2025)" no Regulamento do IBS) e temas por dispositivo.
- **Formatos**: HTML do Planalto e PDF (Regulamento do IBS e resoluções do CGIBS, via `pdfjs-dist`). Normas que o órgão só publica em página que o servidor não lê (Normas RFB, Confaz, TIPI) ficam como `formato: externo`: só o catálogo e o link.
- **Novidades** (`NovidadeLegal`): tudo o que a revisão e as atualizações descobrem. Tipos: `alteracao`, `revogacao`, `inclusao`, `norma_revogada`, `nova_norma`, `regulamentacao`, `aplicacao`, `interpretacao`, `fonte_atualizada`, `estrutura_suspeita`, `nao_consolidada`, `reprocessada`. Situação: `nova`, `vista`, `descartada`, `resolvida`. Origem: `texto_oficial`, `api_oficial`, `busca_web`, `fonte_monitorada`, `remissao`.

## Revisão semanal

`RevisaoSemanalService` (`@Cron('0 5 * * 1', America/Sao_Paulo)`, antes do Radar das 6h). Disparo manual: aba Revisão semanal (administrador) ou `node scripts/revisao-semanal.js` no container. Uma rodada por vez; rodada "executando" há mais de 3 horas é encerrada como falha na seguinte; limite de 2 horas por rodada. Cada etapa roda isolada (erro em uma não derruba as outras) e a rodada termina `concluida`, `parcial` (com erros) ou `falhou`.

1. **Normas**: relê o texto oficial de cada norma monitorada e grava o que mudou, guardando a redação anterior. Norma do catálogo ainda sem texto é carregada. Trava: se a página oficial perder mais de 30% dos dispositivos (a partir de 20), nada é gravado, nasce uma novidade `estrutura_suspeita` e o administrador confere. O que cita o dispositivo alterado entra na fila de revisão (cartões voltam para rascunho, notas do cálculo e marcos da agenda ficam com aviso) **antes** de o texto novo ser gravado.
2. **Legislação federal nova**: API de dados abertos da legislação do Senado (`legis.senado.leg.br/dadosabertos/legislacao/lista?tipo=LCP|EMC|MPV|LEI|DEC&ano=AAAA`). A ementa diz quais normas da base o ato altera, revoga ou regulamenta: nasce uma novidade por norma atingida e, para o que importa (cita norma da base; LC, EC e MP de tributo; lei e decreto de tributo de peso), o texto é carregado do Planalto. Crédito orçamentário, homenagem e afins são ignorados. Na primeira leitura só valem os atos dos últimos 45 dias; o que ainda não tem texto no Planalto é tentado de novo por 60 dias.
3. **Alterações ainda não consolidadas**: lê os artigos "passa a vigorar com as seguintes alterações" e as cláusulas de revogação das normas da base e compara com as notas do texto compilado da norma alterada. Se nenhuma nota cita o ato, registra `nao_consolidada` (com os artigos atingidos), que aparece na aba Novidades, no leitor e nas ressalvas do assistente, e é dada como `resolvida` sozinha quando o Planalto atualiza o compilado.
4. **Portais oficiais** (`fontes-monitoradas.ts`: CGIBS, legislação e notícias do portal da NF-e/SVRS, NFS-e, eSocial, convênios e atos Cotepe do Confaz no ano corrente, CARF): guarda a lista de links de cada página e avisa os documentos novos (link de órgão oficial que é arquivo, ou página cujo texto nomeia um tipo de ato com número; na página de notícias, qualquer link novo). A lista do Confaz muda de endereço na virada do ano e recomeça o ponto de partida. A primeira leitura só guarda o ponto de partida. Ato do CGIBS em PDF que muda a regra do IBS/CBS é carregado como norma. Se a página trouxer menos da metade dos links da leitura anterior, a lista guardada é mantida e o erro é registrado.
5. **Pesquisa na web** (só com motor de IA configurado e `BASE_LEGAL_BUSCA_WEB` não desligada): um prompt por bloco de normas, só fonte oficial, resposta em formato rígido. Cada item precisa de endereço oficial que abre (o servidor confere), não repete o que a base já tem e entra **a confirmar**: não altera texto de norma e o assistente não o usa até um administrador confirmar.
6. **Aplicações**: regulamentos que citam artigos que mudaram na rodada viram uma novidade `aplicacao`, para serem relidos.

No fim, um e-mail por rodada para `NOTIFY_EMAIL`, só quando há novidade ou erro.

## Leitor novo e reprocessamento

`LEITOR_VERSAO` (em `base-legal.parser.ts`) marca com que leitor o texto de cada norma foi gravado (`NormaLegal.leitor_versao`). Norma gravada por leitor anterior é relida mesmo com o texto idêntico (os campos derivados não existiam) e a diferença entre o texto gravado e o de agora **não** é tratada como mudança da lei: nasce uma novidade `reprocessada` ("Texto reprocessado"), os dispositivos não ganham a data de "texto alterado" nem a norma a de "texto mudou em", e a rodada só anota a releitura. A fila de revisão continua sendo alimentada: cartão, nota do cálculo ou marco que citava texto riscado ou revogado volta para revisão. Ao mudar o jeito de ler o texto, aumente `LEITOR_VERSAO`.

## Assistente

Recebe, por dispositivo: situação (em vigor, revogado, parcialmente revogado, norma revogada), notas oficiais de alteração, data da última mudança, redação anterior (marcada como não vigente) e avisos de alteração não consolidada. Dispositivo revogado só entra quando a pergunta o cita pelo número. As ressalvas da resposta ganham, automaticamente, o aviso de revogação, de alteração nos últimos 120 dias e de alteração não consolidada, mesmo que o modelo não os diga.

## Variáveis de ambiente

| Variável | Efeito |
|---|---|
| `BASE_LEGAL_REVISAO_SEMANAL=false` | desliga a rotina agendada |
| `BASE_LEGAL_APLICAR_AUTOMATICO=false` | o texto oficial que mudou vira aviso para aprovação (modo antigo); normas ainda sem texto continuam sendo carregadas |
| `BASE_LEGAL_BUSCA_WEB=false` | dispensa a pesquisa na web |

## API

`GET /base-legal/novidades` (filtros: `status`, `tipo`, `norma`, `origem`, `confirmada`, `busca`, `pagina`, `limite`), `GET /base-legal/novidades/resumo`, `POST /base-legal/novidades/:id/{visto|confirmar|descartar|reabrir}` (administrador), `GET /base-legal/normas/:chave/novidades`, `GET /base-legal/revisao-semanal`, `GET /base-legal/revisao-semanal/fontes`, `GET /base-legal/revisao-semanal/:id`, `POST /base-legal/revisao-semanal/executar` (administrador). O leitor do dispositivo (`GET /base-legal/normas/:chave/dispositivos/:caminho`) devolve também `citado_por`, `cita` e `avisos`.

## Limites conhecidos

- Instruções normativas da Receita (Normas RFB), convênios do Confaz e a TIPI não têm texto por artigo: só referência e acompanhamento do portal. `nfe.fazenda.gov.br` e `sped.rfb.gov.br` falham no TLS a partir do servidor e não são lidos.
- Leis e decretos estaduais e municipais (ICMS e ISS de cada ente) não estão na base.
- A pesquisa na web depende do motor de IA configurado e nunca vale sem confirmação de um administrador.
- O cruzamento de alterações não consolidadas é por ato (nenhuma nota do compilado cita o ato), para não confundir imprecisão da leitura com texto desatualizado; texto original de lei (não compilado) sempre aparecerá como "não consolidado" para atos posteriores, o que é correto.

## Testes

`backend/src/base-legal/*.spec.ts` (leitor de texto riscado e revogado, marcas, PDF, importador, rotina semanal, legislação federal, consolidação, pesquisa, assistente) e `src/components/base-legal/NovidadesLegais.test.jsx`, `src/lib/novidadesLegais.test.js`. O leitor foi validado contra as páginas reais do Planalto e do CGIBS (LC 214 compilada, LC 224, LC 227, LC 235, LC 239, Lei 9.430, RIPI, DL 1.598, Res. CGIBS 6) e a relevância dos atos contra a lista real de 2026 do Senado.
