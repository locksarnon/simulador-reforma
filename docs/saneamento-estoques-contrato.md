# Saneamento de Estoques — contrato técnico (Agente 1)

Servidor = fonte da verdade. Análises rodam no servidor como funções puras (`AnalisadorCamada`, `backend/src/saneamento-estoques/tipos.ts`). Armazenamento em tabelas `San*` (migração aditiva `20261126090000_saneamento_estoques`). Independente de `SaneamentoProjeto`. Código em `backend/src/saneamento-estoques/dados/`.

## Tabelas
| Tabela | Papel |
|---|---|
| SanProjeto | 1 por `ProjetoDiagnostico` (serviço `saneamento-estoques`); data-base, erp, estabelecimentos, responsável, `modulos` {conciliacao,blocosKG,arquivoErp}=false, `parametros` {corteMovimentacao}, trava (`atividades_confirmadas_por/em`), `cnpj_versao`, `versao` |
| SanAtividade | id estável, `codigo` (CNAE ou manual), `origem` CNPJ\|MANUAL, `mantida` (false = excluída, a linha fica) |
| SanImportacao | arquivo, usuário, mapeamento, aceitas/rejeitadas/pendentes, `relatorio` |
| SanItem | id estável; chave única (projeto, estabelecimento `''`=único, código); `linha`, `importacao_id`; `original` (imutável), `lido` (última leitura, base da reimportação), `trabalho` (ItemTrabalho sem id); colunas derivadas `descricao, grupo, finalidade, tambem_usado_como, conjunto_chave (ncm\|finalidade), ativo`; `versao` |
| SanCelula | item × camada: `situacao` (5), `revisar`+`revisar_causa`, `caso_id`, `grupo` (cópia, para a visão geral) |
| SanCaso | camada, tipo, `chave` (hash camada+tipo+itens: reexecutar não duplica), `itens[]`, problema, evidência, atual, proposta, justificativa, fundamento, impactos, origem REGRA\|IA, situação, responsável, `parecer_ia`, `afeta`, `motivo`, `versao` |
| SanDecisao | histórico por campo: item, campo, antes, depois, fundamento, usuário, quando, tipo `aprovar\|rejeitar\|desfazer\|importar`. Só se acrescenta |
| SanVersao + SanVersaoSnapshot | versão liberada: número, rótulo, usuário, resumo; foto (itens+células) em JSON gzip numa tabela à parte |
| SanImpactoSped | obrigação, competência, leiaute, registro, campo, valores, motivo, evidência, início, avaliarAnteriores, responsável, tipoAjuste (CADASTRAL_FUTURO\|REGULARIZACAO_SALDO\|ESCRITURACAO_ENTREGUE), caso_id |
| SanVinculoCodigo | de → para, início, justificativa |

Índices para 30 mil itens: (projeto,código), (projeto,grupo), (projeto,conjunto_chave), células por (projeto,camada,situação) e (projeto,grupo,camada), casos por (projeto,camada,situação), decisões por (projeto,item,campo,quando).

**Snapshot no banco, não no MinIO:** a foto entra na mesma transação e no mesmo backup da base, sem depender do MinIO (que pode estar fora); 30 mil itens comprimem para poucos MB, e a tabela à parte evita carregá-la nas listas.

## Estados
- Célula: PENDENTE · SEM_PROBLEMA · PROPOSTO · APROVADO · AGUARDANDO_INFORMACAO (+ marca `revisar`).
- Caso: PROPOSTO · RASCUNHO · APROVADO · REJEITADO · AGUARDANDO_INFORMACAO. Célula acompanha: PROPOSTO/RASCUNHO→PROPOSTO; APROVADO→APROVADO; REJEITADO→SEM_PROBLEMA (o consultor mantém como está); AGUARDANDO→AGUARDANDO. Rascunho = estado do caso (não há tabela).

## Regras
1. **Trava:** importação (prévia e confirmação), `executar` e `registrar resultado` recusam com 400 `ATIVIDADES_NAO_CONFIRMADAS` até `atividades/confirmar` (exige ≥1 atividade mantida). Confirmada, as atividades não se alteram (409 `ATIVIDADES_CONFIRMADAS`). `reabrir` marca `revisar` nas células já trabalhadas de GRUPOS_FINALIDADE, TRIBUTARIO e OBRIGACOES, sem apagar decisões.
2. **Concorrência:** `versao` inteira em projeto, item e caso. Toda alteração envia a `versao` que o cliente viu (campo `versao` no corpo; 400 se faltar). Desatualizada → **409** `{codigo:'CONFLITO_VERSAO', message}`; nunca sobrescreve. Em `aprovar`, `versoesItens` {itemId: versao} opcional protege cada item. Toda gravação em transação (rollback total).
3. **Aprovar** aplica `proposta` (campo→valor) ao `trabalho` de cada item do caso, grava 1 decisão por campo que mudou (campo igual não gera linha; caso só-alerta grava 1 linha `caso:<tipo>`), atualiza colunas derivadas e `conjunto_chave`, marca células APROVADO e `revisar` nas camadas de `afeta` dos mesmos itens. **Idempotente:** caso já APROVADO devolve `{jaAplicado:true}` sem gravar nada, mesmo com versão velha. Campos fora de `CAMPOS_TOPO` vão para `trabalho.campos`. `id/codigo/estabelecimento` nunca mudam por decisão.
4. **Reabrir** de APROVADO desfaz (valor volta ao `antes`, decisão `desfazer`); se o campo mudou depois por outra decisão → 409 `CAMPO_ALTERADO_DEPOIS`.
5. **Reimportação:** compara o arquivo com `lido`; prévia mostra novos / alterados / inalterados / ausentes e marca `protegido` o campo que já tem decisão. Confirmação cria só itens novos (id estável gerado uma vez); `incorporar:[itemId]` traz as diferenças escolhidas para o `trabalho` (decisão `importar`, células afetadas viram `revisar`); campo protegido nunca é sobrescrito; itens ausentes nunca são removidos.
6. **Lote:** `lote/previa` (só lê) lista aprováveis (com `versao`), itens/campos afetados e exceções (caso não aberto, valor mudou desde a proposta, conflito entre casos do lote, parecer IA de confiança baixa, item inexistente). `lote/aprovar` exige `versoes` da prévia; cada caso numa transação; mudou depois da prévia ou conflitou → exceção, os demais seguem. Máx. 2000 casos.
7. **Execução de camada:** `executarCamada` lê os itens, chama o analisador, grava casos (dedup por `chave`), células PROPOSTO, SEM_PROBLEMA (aprovado continua aprovado, só perde `revisar`) e, se `semDados`, as células PENDENTE da camada viram AGUARDANDO_INFORMACAO (motivo em `revisar_causa`). ESTOQUE só com `modulos.conciliacao`.

## API (prefixo `/saneamento-estoques`, tela de permissão `carteira-diagnostico`)
| Rota | O que faz |
|---|---|
| POST projetos {diagnostico_id} · GET projetos/por-diagnostico/:id · GET/PUT projetos/:id | criar a partir do projeto de consultoria · obter (atividades, `atividadesConfirmadas`, `cnpjDesatualizado`) · configurar (`versao` obrigatória) |
| GET/POST projetos/:id/atividades · PUT …/:atividadeId {mantida} · POST …/confirmar {versao} · POST …/reabrir {versao} | atividades e trava |
| POST projetos/:id/importacoes/previa · POST projetos/:id/importacoes · GET …/importacoes | multipart `arquivo`, `mapeamento` (JSON), `incorporar` (JSON de ids). Prévia é POST de leitura |
| GET projetos/:id/itens?camada&situacao&revisar&grupo&busca&ordem(codigo\|grupo)&cursor&limite | lista paginada por cursor (`proximo`), `total` na 1ª página |
| GET projetos/:id/visao-geral · GET itens/:itemId · GET itens/:itemId/historico?campo | grupo×camada×situação; item completo; histórico por campo |
| GET camadas-disponiveis · POST projetos/:id/camadas/:camada/executar | camadas com analisador; roda a camada |
| POST projetos/:id/casos (ResultadoCamada) · GET projetos/:id/casos?camada&situacao&tipo&origem&item_id&cursor | criar em lote; listar |
| GET casos/:id · PUT casos/:id/rascunho · POST casos/:id/aprovar \| rejeitar \| pedir-informacao \| reabrir | decisão (todos com `versao`) |
| POST projetos/:id/casos/lote/previa · …/lote/aprovar | lote |
| POST/GET projetos/:id/versoes · GET …/versoes/comparar?a&b · GET …/versoes/:versaoId/exportar · GET projetos/:id/exportar-revisao | versões; exportação liberada (foto) × para revisão (base atual) |
| GET/POST projetos/:id/impactos-sped {linhas} · GET/POST projetos/:id/vinculos-codigo | impacto SPED (regrava as linhas dos casos citados) e vínculos antigo→novo |

## Portas (`dados/portas.ts`; tokens `SAN_IMPORTADOR`, `SAN_MOTOR`, `SAN_PARECER_IA`, `SAN_ENTREGAVEIS`)
`ImportadorPort.ler(entrada)` → `{itens: ItemImportado[], relatorio, mapeamento}` (Agente 2); `MotorPort.analisadores()` → `AnalisadorCamada[]` (Agentes 3 e 4); `ParecerIaPort.parecer(caso)` → `ParecerIa|null`, gravado por `SanCasosService.definirParecerIa` (Agente 7); `EntregaveisPort.gerarExcel/gerarRelatorioPdf(DadosEntrega)` (Agente 6; os dados vêm de `SanVersoesService.exportar/exportarAtual`). O módulo registra stubs; cada agente troca o provider. O integrador registra `SaneamentoEstoquesModule` no `AppModule`.

## Ligação real (2ª etapa)
- **Registro:** `SaneamentoEstoquesModule` está no `AppModule`. Reais: `SAN_IMPORTADOR` = `ImportadorPlanilha` (`importador.provider.ts`, usa `importacao/`), `SAN_MOTOR` = `MotorSaneamento` (`motor.provider.ts`). **Stubs a trocar pelo integrador quando `ia/` e `entregaveis/` terminarem:** em `saneamento-estoques.module.ts`, as duas linhas marcadas `TROCAR` (`SAN_PARECER_IA`, `SAN_ENTREGAVEIS`).
- **MotorPort mudou:** `camadas()` + `preparar(camada, {projetoId, itens, contexto})` → `{analisador, contexto}` (async, uma vez por execução). `motorDeAnalisadores(lista)` cria um motor sem banco.
- **Contexto:** `dataBase`, `atividades` (CNAEs confirmados convertidos para os ids de `fiscal/atividades` por `idsDeAtividades`; CNAE sem regra fica de fora), `erp`, `corteMovimentacao`, `parametros` = `SanProjeto.parametros.motor` (objeto livre, `ParametrosMotor`). NCM recebe `tabelaNcm` lida do modelo `Ncm` (vigente = status Ativo; sem sucessores; tabela vazia = não consultada). TRIBUTARIO carrega `CatalogosFiscaisPrisma.carregar()` uma vez por execução; não há exceções por item (`excecoes` vazio).
- **GRUPOS_FINALIDADE** = casos de grupos do motor + 1 caso `FINALIDADE_GRUPO` por grupo com sugestão (itens do grupo sem a finalidade dominante; proposta `{finalidade}`; evidência com a distribuição, confiança e as exceções; `afeta` TRIBUTARIO e OBRIGACOES). Item sem grupo não recebe caso; grupo sem sugestão vira `semDados`.
- **O que a aprovação aplica:** `propostaAplicavel`. Chaves só informativas (`decisao, decisoesPossiveis, tratamentoDoSaldo, manter, consolidar, arvore, subgrupos, fatorSituacao, origem, tipoImpacto, valorProposto`) não vão para o item; casos da camada OBRIGACOES nunca alteram o cadastro (só registram a ciência). `codigo` pode mudar por decisão (só no `trabalho`; a coluna `codigo` continua sendo a chave) e grava vínculo antigo→novo; consolidação de duplicidade aprovada (`decisao = PROPOR_CONSOLIDACAO`) grava `consolidar → manter`. Desfazer remove esses vínculos. Casos de tipo `AGUARDANDO*` nascem como AGUARDANDO_INFORMACAO.
- **Mapeamento caso → ajuste do checklist SPED** (`ajustes.ts`; OBRIGACOES é gerada dos casos PROPOSTO/RASCUNHO/APROVADO do projeto, um ajuste por item):

| Tipo de ajuste | Entra quando |
|---|---|
| MUDOU_CODIGO_DESCRICAO | camada IDENTIFICACAO, ou proposta com `codigo`/`descricao` |
| MUDOU_UNIDADE | proposta com `unidade`, `unidadeCompra` ou `fatorConversao` |
| CONSOLIDOU_INATIVOU | DUPLICIDADE com `decisao = PROPOR_CONSOLIDACAO`, ou proposta com `consolidar` |
| MUDOU_NCM | proposta com `ncm` |
| MUDOU_TRATAMENTO | proposta com `cClassTrib` ou `cst` |
| ITEM_ATIVO_IMOBILIZADO | proposta com `finalidade = IMOBILIZADO` |

Obrigações e versão de leiaute do cliente não são informadas (aplicabilidade "a confirmar"; leiaute "não confirmado"), como a pasta `fiscal/` já trata.

## Ajustes pedidos pela interface (3ª etapa)
- **Prévia da importação** (`POST importacoes/previa`) devolve também `colunas: [{indice, nome}]`, `sugestao: {colunas: [{indice, nome, exemplo, campo, certeza: 'ALTA'|'MEDIA'|null, motivo}]}` e `amostra` (as 10 primeiras linhas já normalizadas: `{linhaOrigem, situacao, ocorrencias, item, referencia}`), além de `mapeamento` (campo → nome da coluna), `relatorio` e a comparação da reimportação. A confirmação aceita o mesmo `mapeamento` (campo → nome).
- **`GET projetos/:id/itens`** devolve em cada item `enquadramento: {cClassTrib, cst, enquadramentoLegal, artigo, origem: 'HERDADO'|'EXCECAO', casoId, situacao} | null`: vem do caso TRIBUTARIO APROVADO, PROPOSTO ou RASCUNHO que cita o item e traz `cClassTrib`/`enquadramentoLegal` na proposta; exceção (tipo `EXCECAO*` ou `proposta.origem = 'EXCECAO'`) vale mais que o do conjunto; entre iguais, o mais recente. Custo: uma consulta por página (máx. 500 itens), com índice GIN em `SanCaso.itens`.
- **`GET projetos/:id/casos`** aceita `grupo` (casos cujas células estão no grupo, pelo índice projeto+grupo+camada; `(sem grupo)` = itens sem grupo) e `situacao` com vários valores separados por vírgula.
- **Exceção manual repetida** (`tipo = EXCECAO_MANUAL`, mesmo item e camada): `POST projetos/:id/casos` atualiza o caso aberto (proposta, atual, evidência, justificativa, `afeta`), sobe a `versao` e devolve o caso em `casosAtualizados`. Se o caso do corpo traz `versao` e ela não confere, 409 `CONFLITO_VERSAO`; sem `versao`, atualiza assim mesmo (reenvio explícito da própria tela). Se o caso existente já está APROVADO ou REJEITADO: 409 `CASO_JA_DECIDIDO` (reabrir antes).

## Revisões independentes (4ª etapa)
- **Versão liberada = foto congelada (formato 2):** o snapshot guarda projeto e atividades, itens, células (tuplas), casos, decisões, impactos, vínculos e importações NO MOMENTO da versão; `exportar` e as entregas leem só dele (a base de agora só sai por `exportarAtual`, "para revisão"). Criação em transação `RepeatableRead`, leitura em lotes (5 mil itens, 20 mil células) e `select` só dos campos usados. Estimativa de pico para 30 mil itens × 9 camadas: 150 a 200 MB (contas de tamanho, não medição). `comparar` reduz uma versão a mapas por vez. `POST versoes` devolve `aviso` {celulasRevisar, porCamada, mensagem} (aviso, não bloqueio) quando há células "revisar"; elas saem como "Aguardando revisão" no Excel e no PDF, que trazem o aviso no resumo.
- **Impacto no SPED gravado:** cada caso PROPOSTO, RASCUNHO ou APROVADO que gera ajuste (tabela de `ajustes.ts`) tem suas linhas em `SanImpactoSped` com `caso_id` (uma por tipo de ajuste e registro; a evidência traz a quantidade de itens). Regravadas ao criar/atualizar/aprovar/editar/reabrir/rejeitar (idempotente; rejeitar e reabrir deixam o caso sem linhas se ele deixa de gerar ajuste) e em `executar OBRIGACOES` (reconstrói todas). A entrega liberada só mostra impacto de caso decidido. `ENQUADRAMENTO_CONFERIDO` nunca gera ajuste.
- **Aprovar:** aceita `justificativa` (grava no caso e na decisão) e `confirmarDivergencia`; sem ela, se o valor atual do item já não é o `atual` do caso responde 409 `PROPOSTA_DESATUALIZADA` com `campos [{campo, atual, esperado}]`. 400 `FALTA_INFORMACAO` para tipo `AGUARDANDO*`, 400 `SEM_PROPOSTA` quando não há campo aplicável nem decisão de duplicidade (exceções: camada OBRIGACOES e `CODIGO_ANTIGO`), 400 `CASO_OBSOLETO`. Conversão de unidade: 400 `FATOR_AUSENTE` sem fator numérico > 0 (ou `fatorSituacao = INFORMAR`) e 400 `FATOR_A_CONFIRMAR` para `CONFIRMAR` sem `confirmarFator: true`; digitar o fator no rascunho passa a situação para `INFORMADO`. `afeta` é recalculado pela proposta (união com o do analisador). Desfazer marca as dependências como "revisar". `CODIGO_ANTIGO` aprovado grava o vínculo antigo → atual; o vínculo carrega a etiqueta de cada caso que o usa e só some quando o último deles é desfeito. `codigo` novo não pode repetir outro item do projeto (mesmo estabelecimento).
- **Forma validada (400):** proposta é objeto simples; chaves por regex segura (`campos.nome` ou nome simples; `__proto__`, `constructor`, `prototype` barrados); valores escalares até 2000 caracteres; NCM texto de 8 dígitos, `ativo` booleano, `saldo` numérico, finalidade da lista. `POST casos` valida o `ResultadoCamada` (camada, tipo, problema, itens, origem REGRA|IA, afeta); itens repetidos viram um. Query string com lista ou objeto vira 400. `EXCECAO_MANUAL`: motivo de ao menos 5 caracteres e, no tributário, cClassTrib existente e vigente na data-base e CST coerente com a classe (400 `MOTIVO_CURTO`, `CLASSE_INVALIDA`, `CST_INCOERENTE`).
- **OBSOLETO (nova situação de caso):** ao reexecutar uma camada, caso PROPOSTO (sem edição) que a nova análise não produz mais vira OBSOLETO (célula volta a PENDENTE, impactos removidos); fora das listas "em aberto" e do lote, não se aprova nem se reabre; se voltar a ser produzido, é reativado como PROPOSTO. `EXCECAO_MANUAL`, casos editados e decididos nunca ficam obsoletos. A UI trata situação desconhecida como texto.
- **Lote:** `restantes` quando passa de 60 s (cada caso na sua transação); `DUPLICIDADE_COM_SALDO`, conversão de unidade sem fator ou com fator a confirmar e caso sem proposta ficam fora, com a razão; a prévia lista `vinculos` a criar por caso.
- **Tributário:** exceções por item já aprovadas entram no `AnalisadorTributario` (o item sai do conjunto e a exceção não é reproposta); itens que já estavam certos ganham um caso `ENQUADRAMENTO_CONFERIDO` por conjunto (aprovado pelo sistema, não mexe em célula nem em cadastro) com lei, artigo, CST e crédito. Aprovar `EXCECAO_MANUAL` grava `cClassTrib` e `cst` em `trabalho.campos`.
- **Entregas:** exceção (`EXCECAO*`) tem prioridade sobre o caso do conjunto; item que mudou de NCM ou finalidade deixa de pertencer ao caso do conjunto antigo; o PDF conta as exceções aprovadas e avisa leiaute "não confirmado" também quando a linha traz esse texto.
- **Projeto:** `data_base` lida do projeto de consultoria (`SanProjetoService.dataBase`); `GET projeto` devolve `mapaAtividades {mapeadas [{codigo, atividade}], semMapeamento [codigo]}`; atividade manual só da lista fechada ou CNAE de 7 dígitos; `confirmar` grava `cnpj_versao` atual; `configurar` mescla `parametros`; ligar a conciliação depois da importação cria as células de ESTOQUE. P2002 em projeto, atividade e caso concorrente vira 409.
- **Exclusão sem órfãos:** `apagarSaneamento` (dados/exclusao.ts) é chamada dentro da transação da exclusão do projeto de consultoria (direta ou aprovada) e da Limpeza de empresas.
- **Parecer da IA:** `definirParecerIa` só grava em caso aberto, sobe a `versao` e devolve `{gravado, motivo?}`.
- **Removidos do controller:** `GET versoes/:id/exportar` e `GET projetos/:id/exportar-revisao` (nada os usa; ficam os métodos de serviço).

## QA com 30 mil itens (5ª etapa)
- **Unidades por conjunto:** NOMES_UNIDADES gera UM caso por unidade escrita (exata) + proposta idêntica: `UNIDADE_GRAFIA` (mesma grafia → mesma padrão), `UNIDADE_CONVERSAO` (mesma unidade, sugerida, medida, fator, `fatorSituacao` e evidência) e `UNIDADE_SEM_REGRA` (mesma unidade). No conjunto, `atual` traz só `unidade` (o código é de cada item); a evidência traz "Itens do conjunto" e até 5 exemplos.
- **Exceção vale mais que o conjunto (todas as camadas):** item com caso `EXCECAO_MANUAL`/`EXCECAO_ITEM` vivo (proposto, rascunho, aguardando ou aprovado) na mesma camada fica fora do caso de conjunto: aprovar/rejeitar/células/lote não o tocam (`aprovar` devolve `itensComExcecao`; todos com exceção = 400 `SO_EXCECOES`). A interface admite exceção em NOMES_UNIDADES (unidade, unidade de compra e fator).
- **Teto de casos:** `MAX_CASOS` (20 mil) vale só para `POST projetos/:id/casos` (corpo HTTP). `executar` chama `registrarResultado(..., { interno: true })`, que grava tudo em blocos numa transação.
- **Aprovar:** `proposta.decisao = SOLICITAR_INFORMACAO` → 400 `DECISAO_PEDE_INFORMACAO` (o caminho é `pedir-informacao`); o lote deixa de fora com o motivo. Decisões e marcas de histórico gravadas em bloco (sem consulta por item).
- **Lote:** id inexistente vira exceção "Caso inexistente neste projeto." (e `inexistentes` na prévia); `orcamentoMs` só número positivo (400), limitado a 60 s; o orçamento conta a requisição inteira.
- **Reimportação:** a prévia devolve `totais {novos, alterados, inalterados, ausentes, alteradosComProtegido, alteradosIncorporaveis, camposProtegidos}` do arquivo inteiro e `diferencas` paginadas (`pagina`, `limite` até 1000, `filtro` TODAS|COM_PROTEGIDO|SEM_PROTEGIDO; `paginaDiferencas`). A confirmação aceita `incorporar` como lista de ids ou `{filtro: ALTERADOS|ALTERADOS_SEM_PROTEGIDO, exceto?: [ids]}`.
- **IA em lote:** a consulta já filtra as camadas/tipos de borda (`CANDIDATOS_BORDA` em `ia/borda.ts`) e percorre tudo em páginas.
- **Impacto no SPED:** `GET impactos-sped` paginado (`cursor`, `limite` até 1000, `tipo_ajuste`) → `{linhas, proximo, total, totalGeral, porTipo}`. Registro cujo campo não guarda o valor do ajuste (C170 do NCM e do tratamento, 0220, M100/M500, 0300, G110/G125, F120/F130) sai sem valor original/proposto. O caso de OBRIGACOES mostra o valor só quando é o mesmo em todos os ajustes; senão "varia por item; ver a aba Impactos no SPED".
- **Excel de revisão:** `DadosEntrega.ultimaLiberada`; a linha Versão diz a última versão liberada (ou que não há nenhuma).
