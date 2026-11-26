# Diretrizes do Saneamento — plano (para revisão; nada implementado)

Princípio: as **Diretrizes** são um cadastro de regras que **comanda as análises** e, aprovado, **forma a política**. Menos é mais: nada é cadastrado duas vezes.

## 1. Onde fica

- Aba **Diretrizes** no Saneamento, antes das análises (Configuração → Importação → **Diretrizes** → Análises → Unificações → Impacto → Versões). Pode ser aberta e ajustada a qualquer momento.
- **Biblioteca de diretrizes** em Administração (aba ao lado do Cadastro de ERPs): regras-modelo FAL, cadastradas uma vez e usadas por todos os projetos.

## 2. Cabeçalho das Diretrizes

Só mostra o que o projeto já tem (cliente, base importada e versão, ERP e versão do Cadastro de ERPs, data-base) e acrescenta:
- **Vigência** (data);
- **Situação**: Rascunho ou Aprovada, mais a marca "revisar".

Abaixo: regras do projeto por aspecto, **grupos sem regra** (pendências) e o botão **Adicionar regra** (nova ou trazida da biblioteca).

## 3. Aspectos e campos (5)

Comum a todos: aspecto, nome da regra, grupos abrangidos (multisseleção + "Todos os grupos"), subgrupos (quando a base trouxer a coluna; passa a ser mapeável na importação), observação.

**Abrangência:** uma regra efetiva por grupo e aspecto. "Todos os grupos" é o padrão (vale também para grupos novos); grupo com regra própria é exceção. Escolher um grupo já coberto mostra a regra atual e pede confirmação da transferência; o histórico fica.

| Aspecto | Campos | Camada que executa | O que a análise aponta |
|---|---|---|---|
| **A. Padrão de nomes** | componentes e ordem (nome, referência, marca, característica técnica, apresentação, complemento); obrigatórios; separador; capitalização; remover espaços duplicados; abreviações aprovadas (tabela); termos proibidos/substituições (tabela). Prévia da estrutura com itens reais do grupo. | Nomes e unidades | descrição fora do padrão, componente obrigatório ausente, termo proibido; proposta só reordena/normaliza o que existe — nunca inventa componente nem repete informação |
| **B. Atributos técnicos** | atributos exigidos (marca, referência, composição, princípio ativo, concentração, formulação, dimensão, material, apresentação, outros); onde devem constar (descrição, campo próprio, ambos); obrigatório ou obrigatório quando aplicável (condição) | Qualidade | atributo ausente (pendência); IA na borda sugere de onde tirar, sem preencher |
| **C. Unidades e embalagens** | critério da unidade de estoque (padrão: menor unidade prática; alternativa: unidade definida para o grupo); unidades de compra e de saída permitidas; conversões (origem, destino, fator, abrangência grupo/produto); conversão desconhecida = pendência pedindo fator | Nomes e unidades (regra atual migra para cá) | unidade fora do critério, unidade não permitida, fator ausente; ao converter, preserva quantidade × valor unitário × total onde houver valor (inventário/H010), senão pendência |
| **D. Limites de caracteres** | várias linhas: destino (leiaute oficial — SPED, NF-e —, ERP, cliente), campo, limite, origem, referência/versão, tratamento do excesso (sugerir abreviação aprovada ou pedir revisão), componentes a preservar | Nomes e unidades (o parâmetro `limites` atual migra para cá) | excesso por destino, com variante da descrição por destino; nunca corta; limite não confirmado = pendente |
| **E. Classificação fiscal** | validação de NCM (exceções justificadas); validação de cClassTrib nos cenários aplicáveis; cenários (entrada, saída, uso interno); ausência = pendência; ambíguo = revisão fiscal | NCM e Tributário (reaproveita finalidade, regime e os 4 cenários) | o que já aponta hoje, agora orientado pela regra do grupo |

**Limites — ordem de confiança:** (1) leiaute oficial (Guia Prático do SPED, MOC da NF-e) é o teto, com fonte e versão; (2) ERP, pelo Cadastro de ERPs (novo tipo de conhecimento "limite de campo"), quando menor e confirmado; (3) limite próprio do cliente. Vale o **menor confirmado**; ERP configurado acima do leiaute gera alerta. Limites oficiais entram por pesquisa nas fontes oficiais, com "não confirmado" quando faltar.

**Controles internos:** fora das Diretrizes (não há análise). Entram na política como capítulo fixo (seção 7).

## 4. Biblioteca FAL (nada em dobro)

- Regra-modelo com versão e histórico. O projeto **aponta** para a regra da biblioteca e só guarda as exceções do cliente.
- Regra da biblioteca atualizada: o projeto vê "regra atualizada na biblioteca" e decide adotar (com prévia de impacto); nada muda sozinho.
- Carga inicial: o conteúdo da política da Crestani (versão editada no Word) desdobrado em regras-modelo, complementado e objetivo.
- Limites, ERP e textos legais vêm dos cadastros existentes (Cadastro de ERPs, Bases legais).

## 5. Fluxo de trabalho

1. Configurar a regra (nova ou da biblioteca) → **Salvar rascunho**.
2. **Aplicar e reanalisar**: mostra antes quantos grupos e itens serão afetados; sobreposição do mesmo aspecto bloqueia até ser resolvida; reanalisa só os itens afetados.
3. Revisar os achados (casos, como hoje); ajustar a regra se preciso (volta ao passo 2).
4. **Aprovar** (um aprovador: o consultor responsável). A política consolidada é atualizada.
5. **Histórico** da regra (quem, quando, antes/depois).

Mudar regra aprovada: a aprovação cai, conclusões dependentes ganham "revisar", decisões e versões anteriores ficam.

**Transformar em regra:** a partir de uma decisão num item, cria regra com abrangência escolhida (projeto ou biblioteca), mostra o impacto e só então aplica. Decisão isolada nunca muda a regra sozinha.

## 6. Versões

"Liberar versão" congela **juntas** a base e a política vigente (uma numeração só). O PDF da política de uma versão é sempre reproduzível.

## 7. PDF da política

1. **Identificação:** cliente, projeto, versão, vigência, situação, aprovador, data de emissão. Marca **Rascunho** enquanto não aprovada.
2. **Regras por aspecto**, cada regra com código (N01, A01, U01, L01, F01), "Aplicável aos grupos: …" (grupos juntos, sem repetir texto) e os itens da regra em tópicos curtos.
3. **Procedimentos com fluxograma** (conteúdo efetivo, prático, sem metacomentário): cadastro de item novo, alteração, unificação, inativação e **Retirada e uso de materiais** (pedido → autorização → retirada → registro do destino; depósito, centro de custo, equipamento/OS e documento; por que: comprovar uso na atividade para sustentar o crédito de IBS/CBS — LC 214/2025, art. 57, § 3º; como fazer no ERP do cliente quando o Cadastro de ERPs tiver confirmado).
4. **Quadro de consulta por grupo:** Grupo × Nomes × Atributos × Unidades × Limites × Fiscal (códigos das regras).
5. **Pendências:** regras não aprovadas e grupos sem regra, em seção própria, nunca como vigentes.

## 8. O que muda no que já existe

- Parâmetros soltos do motor (limites de tamanho, política de unidades) passam a vir das regras; projetos atuais recebem regras equivalentes automaticamente (sem mudar resultado).
- Casos ganham a referência da regra que os gerou ("Regra N01").
- Importação passa a mapear **subgrupo** (opcional).
- Cadastro de ERPs ganha o tipo "limite de campo".

## 9. Fora desta entrega

Controles internos como análise; segundo aprovador; arquivo de movimentação.

## 10. Entrega

Uma entrega, com agentes por frente (dados/regras, motor, telas, biblioteca e carga da política Crestani, PDF com fluxogramas, pesquisa de limites oficiais), duas revisões independentes, QA com Postgres real (30 mil itens) e um deploy com backup.

**A confirmar com o usuário:** onde está o arquivo Word final da política da Crestani a usar como base (última versão editada).

## 11. Contrato técnico (para os agentes)

Tipos: `backend/src/saneamento-estoques/diretrizes/tipos.ts` (não alterar sem o integrador).

Arquivos e donos (cada agente só cria/edita o que é seu):
- **Núcleo (backend):** `backend/src/saneamento-estoques/diretrizes/*` (exceto `conteudo/`), migração Prisma, ligações em `dados/`, `motor/`, versões e permissões.
- **Telas:** `src/components/saneamento-estoques/diretrizes/*`, aba na página do saneamento, `api.js`, aba "Biblioteca de diretrizes" em Administração.
- **Conteúdo:** `backend/src/saneamento-estoques/diretrizes/conteudo/biblioteca.ts` — exporta `BIBLIOTECA_INICIAL: RegraBiblioteca[]`, `PROCEDIMENTOS: Procedimento[]`, `MODELOS: ModeloDiretrizes[]`.
- **Limites:** `backend/src/saneamento-estoques/diretrizes/conteudo/limites-oficiais.ts` — exporta `LIMITES_OFICIAIS: LinhaLimite[]`; tipo "LIMITE_CAMPO" no Cadastro de ERPs (`backend/src/erps/`).
- **PDF da política:** `backend/src/saneamento-estoques/entregaveis/politica/*` — exporta `gerarPdfPolitica(dados: DadosPolitica): Promise<Buffer>` e o tipo `DadosPolitica`.

`ModeloDiretrizes` (em `conteudo/biblioteca.ts`): `{ id, nome, descricao, atribuicoes: { aspecto, bibliotecaId, grupos: 'TODOS' | string[] }[] }` — ex.: "Modelo FAL — Revenda de insumos agro (base Crestani)".

Rotas (prefixo `/api/v1/saneamento-estoques`):
- `GET projetos/:id/diretrizes` → `{ cabecalho: { vigencia, situacao, revisar, versao }, regras: (RegraProjeto & { conteudoEfetivo })[], grupos: { grupo, subgrupos, itens }[], gruposSemRegra: { aspecto, grupos }[], atualizacoesBiblioteca: { regraId, versaoNova }[] }`
- `PUT projetos/:id/diretrizes` `{ vigencia, versao }`
- `POST projetos/:id/diretrizes/aplicar-modelo` `{ modeloId }` → cria as regras do modelo em rascunho (sem duplicar)
- `POST projetos/:id/diretrizes/regras` `{ aspecto, nome, abrangencia, observacao?, bibliotecaId?, alteracoes? }` → regra em RASCUNHO
- `PUT diretrizes/regras/:regraId` `{ versao, nome?, abrangencia?, observacao?, alteracoes? }` (aprovada volta a RASCUNHO e marca "revisar" nas conclusões dependentes)
- `GET diretrizes/regras/:regraId/previa` → `PreviaAplicacao`
- `GET diretrizes/regras/:regraId/exemplos` → itens reais do grupo com a descrição atual e como ficaria (NOMES/LIMITES)
- `POST diretrizes/regras/:regraId/aplicar` `{ versao, confirmarTransferencia? }` → reanalisa só os itens afetados; 409 se houver sobreposição sem confirmação
- `POST diretrizes/regras/:regraId/aprovar` `{ versao }`
- `GET diretrizes/regras/:regraId/historico`
- `POST diretrizes/regras/:regraId/adotar-versao` `{ versao }` (regra da biblioteca atualizada)
- `POST projetos/:id/diretrizes/transformar` `{ casoId, aspecto, nome, abrangencia, destino: 'PROJETO' | 'BIBLIOTECA' }`
- Biblioteca: `GET biblioteca`, `GET biblioteca/:id`, `POST biblioteca`, `PUT biblioteca/:id` `{ versao, ... }` (só admin; nova versão a cada alteração), `GET biblioteca/:id/historico`, `GET biblioteca/procedimentos`, `GET biblioteca/modelos`
- `GET projetos/:id/politica/pdf?versaoId=` → PDF da política (Rascunho enquanto houver regra não aprovada)
