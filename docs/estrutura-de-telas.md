# Estrutura de telas e separação de conteúdo do InTAX

Aprovada e implantada em 11/11/2026: as fases 0, 1 e 2 estão no ar, e as fases 3 e 4 aparecem como "Em breve", com a dependência de cada uma (situação função a função em `docs/mapa-completo-veri-intax.md`, seção 1-A). O Início abre em /inicio e o endereço / continua sendo Grupos e empresas. Serve de regra para todo módulo novo: antes de criar uma tela, ela precisa caber aqui. O controle de que nada se perde está em `docs/mapa-completo-veri-intax.md` (e no `.csv`): cada função do Veri tem número, destino e fase, e cada rota do InTAX de hoje tem destino.

## 1. Por que

O menu de hoje tem 7 seções e cerca de 20 entradas, e já mistura assuntos: "Bases Técnicas" junta simulação (Cenários, Transição), referência (Catálogos) e configuração; "Consultas e cálculos" tem 2 itens; "Inteligência de mercado" junta base legal, agenda e newsletter; "Trabalho" é só uma lista. Com os cerca de 33 módulos novos do mapa de 11/11/2026 o menu passaria de 60 entradas. A estrutura abaixo separa por **o que a pessoa está fazendo**, e não pelo tipo técnico da tela.

## 2. Regras (o que impede o "lixão")

1. **Uma área por finalidade, um módulo em uma só área.** Pode haver atalho para outra área, nunca duas cópias.
2. **Teste de decisão para uma tela nova:**
   - é dado mestre (cliente, usuário, tag)? Clientes ou Administração;
   - é rotina recorrente do escritório sobre a carteira (XML, situação fiscal, obrigações, tarefas, arquivos)? BPO Fiscal;
   - é projeto pontual com entregável para um cliente? Diagnóstico e Serviços;
   - calcula ou simula a Reforma? Reforma Tributária;
   - é texto de referência (lei, notícia, catálogo)? Conhecimento;
   - é venda ou comunicação com cliente? Comercial e relacionamento;
   - é configuração, acesso ou integração? Administração.
3. **Menu enxuto:** no máximo 10 áreas (hoje 9), no máximo 7 itens por área. O que passar disso vira **abas dentro do módulo**, não item de menu. Uma barra de abas tem no máximo 8 abas; acima disso, vira submódulo.
4. **Cadastro mestre único.** Empresas, grupos, pessoas físicas, usuários, tags e procurações moram em Clientes e Administração. Nenhum módulo tem lista própria de empresas nem seletor próprio: todos usam o mesmo.
5. **Portfólio primeiro, empresa depois.** Todo módulo que trabalha por empresa abre numa lista da carteira (com filtros e totais) e daí entra na empresa (modelo do Repositório de XML). Tela que agrega várias empresas é "painel" do módulo; tela de uma empresa é "detalhe".
6. **Cinco moldes de tela**, sempre os mesmos (seção 5). Tela que não cabe num molde é discutida antes de ser feita.
7. **A navegação é dado, não código solto:** cada módulo declara um manifesto e o menu, a busca e as rotas saem dele (seção 7). Módulo sem manifesto não aparece.
8. **Ninguém mexe no menu à mão sem passar pelo manifesto**, e mudança de URL leva redirecionamento (lição do 404 de 10/11/2026).
9. **Conteúdo público e conteúdo interno ficam em cascas separadas** (público fora do menu interno; portal do cliente com casca própria).

## 3. Mapa do menu (alvo)

Os números entre `#` são os itens do mapa de lacunas de 11/11/2026. `[existe]` já está no InTAX.

**1. Início**
- Painel do escritório: vencimentos da semana, tarefas atrasadas, empresas em risco, avisos (#8, #17). É o único painel geral; o BPO Fiscal não tem painel duplicado.
- Painel da carteira: BI feito só com o cadastro (saúde, regime, porte, mapa por município, CNAE), que não espera a Receita (V059–V061). Parte do Painel executivo que já existe em `/cockpit`.
- Sino de notificações no topo de todas as telas, com a central de notificações (#18); não é item de menu.

**2. Clientes** (cadastro mestre)
- Grupos e empresas [existe]
- Serviços contratados por empresa: BPO fiscal ou diagnóstico pontual, situação, datas, responsável e módulos do BPO ligados; separa as duas carteiras sem duplicar o cadastro (seção 12)
- Pessoas físicas (#6)
- Procurações e certificados: situação por empresa; usa o cofre A1 [existe] (#7)
- Carteira e colaboradores: vínculo de empresas por colaborador, "empresa por colaborador" e "sem colaborador" (#28)
- Tags e filtros salvos (#29)
- Importação e exportação de cadastro (#30)

**3. BPO Fiscal** (a rotina do escritório sobre a carteira: acompanhar, receber, cumprir e controlar; reúne o que antes eram "BPO Fiscal" e "Escritório")
- Monitoramento fiscal, com 8 abas: Situação (diagnóstico e-CAC, sublimite, ausências, exclusão, dívida ativa, e-processos), Declarações e guias (PGDAS-D, DEFIS, DCTFWeb, MIT, DAS, DARF, comprovantes, faturamento, Fator R), Mensagens (e-CAC, malha, termos), Certidões, Parcelamentos, MEI, Pessoa física, Procurações e certificados (V001–V051, exceto V045, do mapa completo)
- Captura de XML: repositório, certificado, captura automática, tipos de documento, resumos e eventos, relatórios [existe]
- Obrigações e agenda: agenda de obrigações (V069); **calendário geral com eventos próprios e tipos de evento**, que também mostra obrigações, tarefas e datas da Reforma (V070); parâmetros de consulta e envio de guias (fase 3)
- Processos e tarefas, com modelos e recorrência (V071–V072); qualquer área cria uma tarefa por um botão padrão, e a tarefa mora aqui
- Análise de risco: Gestão à Vista 360°, top 5 em risco, calculadora de multas, Radar de CND, fila de prioridade, auditoria cross-check, indicadores, Raio-X Fiscal, Health Score, análise e assistente por IA (V053–V058, V062–V064, V066–V067)
- Arquivos e documentos: arquivos por empresa e por pessoa física, tipos de documento, documentos com validade e alerta, meus downloads (V052, V074–V077)

**4. Diagnóstico e Serviços** (projetos por cliente; o atual workroom)
- Grupos e empresas → empresa: Operações, Importação de XML, Importação de planilha, Saneamento de estoques, Classificação de serviços, Validador NFS-e, Validador de cadastro, Histórico, Painel, Agenda, Serviços e lista de solicitações [existem]

**5. Reforma Tributária** (planejar e calcular)
- Simulador da empresa, com "onde cada regime vence" e atalhos de crédito [existe; evoluir] (#14, #15)
- Cenários, Transição 2026–2033, Catálogos IBS/CBS [existem]
- Crédito presumido de estoque, Guia do art. 11 [existem]
- Ferramentas avulsas: Consulta NCM, Classificação, Validadores [existem]

**6. Conhecimento**
- Base legal, Agenda da Reforma, Radar de Novidades, Acervo de Notícias [existem]

**7. Comercial e relacionamento**
- Prospecção: Leads [existe]; Pré-análise por CNPJ (#12)
- Propostas: orçamento e honorários (#21)
- Contratos e assinatura (#26); Cobrança (#27)
- Comunicação: Newsletter [existe]; Comunicados por e-mail e WhatsApp (#22); Solicitações dos clientes
- Portal do cliente e App: configuração (#24, #25)

**8. Administração**
- Usuários e acessos (#28); Registro de acesso e IPs permitidos (#31)
- Parâmetros e rotinas automáticas
- Integrações: Serpro Integra Contador (certificado do escritório), WhatsApp (Meta), Asaas, assinatura eletrônica, e-mail; mostra o estado, nunca o segredo
- Logs de envio (e-mail e WhatsApp)
- Configuração [existe]
- Plano e uso (#33), só se o InTAX for oferecido a terceiros

**9. Suporte**
- FAQ e Manual, Roteiro de testes, Arquitetura [existem]

**Fora do menu interno:** páginas públicas (calculadora, Simples híbrido, Consulta NCM e validador públicos) e o portal do cliente (`/portal`, casca própria, papel "cliente").

## 4. Onde cada item de hoje vai

Na fase 0 só o agrupamento do menu muda; as URLs ficam como estão. Quando uma URL mudar numa fase posterior, ela ganha redirecionamento.

| Hoje (seção do menu) | Item | Vai para |
|---|---|---|
| Trabalho | Grupos e empresas (`/`) | Clientes (e o Diagnóstico e Serviços continua dentro da empresa) |
| BPO fiscal | Repositório de XML | BPO Fiscal > Captura de XML |
| Consultas e cálculos | Consulta NCM, Crédito presumido de estoque | Reforma Tributária |
| Inteligência de mercado | Base legal, Agenda da Reforma, Radar, Notícias | Conhecimento |
| Inteligência de mercado | Newsletter | Comercial e relacionamento |
| Comercial | Leads, Calculadora pública | Comercial e relacionamento |
| Bases Técnicas | Cenários, Transição, Catálogos | Reforma Tributária |
| Bases Técnicas | Configuração | Administração |
| Suporte | Roteiro, FAQ e Manual, Arquitetura | Suporte (sem mudança) |

## 5. Moldes de tela

1. **Painel:** de 3 a 6 cartões de número no topo; abaixo, gráficos e tabelas; filtros de período e de empresa.
2. **Lista:** busca, filtros, escolha de colunas, exportação (Excel, PDF, CSV), paginação 10/50/100/500/todos, ações em lote, estado vazio que diz o próximo passo.
3. **Detalhe com abas:** cabeçalho (nome, CNPJ, grupo, situação) e uma barra de abas por assunto; a aba aberta em destaque na cor da marca (modelo do Repositório de XML).
4. **Assistente:** passos numerados, resumo visível, botão final explícito.
5. **Configuração:** formulário agrupado, aviso ao salvar e trilha de auditoria para o que for sensível.

Comum a todos: migalhas (Área > Módulo > Tela), `PageHeader`, estados de carregando, vazio e erro, selo de situação do módulo (em breve, beta), texto de ajuda que remete ao FAQ do módulo.

## 6. Contexto e papéis

- **Empresa em foco:** seletor global opcional no topo (como o do Veri, sem copiar a tela). Quando escolhida, os painéis filtram por ela e os módulos abrem direto na empresa. Fase 1.
- **Papéis:** `admin` (tudo), `consultor` (tudo, menos Administração, exceto o que o admin liberar) e, no futuro, `cliente` (só o portal, só da própria empresa). O menu mostra só o que o papel pode usar.
- Hoje a mudança de papel é só por SQL; a tela de Usuários e acessos (#28) corrige isso na fase 1.

## 7. Organização do código

- **Navegação como dado.** `src/lib/navegacao.js` junta os manifestos e entrega ao `Layout` (menu), à busca rápida de módulo (Ctrl+K), às migalhas e ao controle de papéis. O `sections` de `Layout.jsx` passa a ser gerado, não escrito.
- **Manifesto por módulo:** `src/modulos/<modulo>/manifest.js` com `id`, `area`, `titulo`, `icone`, `rotas`, `papeis`, `situacao` (`em-breve`, `beta`, `ativo`), `faq` e `roteiro`.
- **Módulos novos nascem em `src/modulos/<modulo>/`** (`paginas/`, `componentes/`, `lib/`, testes). Os atuais (`src/pages/`, `src/components/<modulo>/`) migram quando forem tocados, sem refatoração em massa.
- **Backend:** um módulo Nest por domínio, rotas `/api/v1/<modulo>/...`. Um módulo só lê dado de outro pelo serviço exportado dele.
- **FAQ e roteiro de testes saem do manifesto**, como já é no Repositório de XML.
- **URLs:** `/<area>/<modulo>/<tela>` em português, minúsculas, com hífen. Exemplos: `/bpo/monitoramento/certidoes`, `/escritorio/tarefas`, `/admin/usuarios`.

## 8. Separação do conteúdo e dos dados

| Tipo | Exemplos | Regra |
|---|---|---|
| Mestre | Grupo, Empresa, Pessoa física, Colaborador, Tag, Filtro salvo, Procuração, Serviço contratado | Um módulo dono (Clientes/Administração); os demais só leem |
| Operacional | Documento XML, situação fiscal, certidão, parcelamento, tarefa, proposta, contrato, cobrança, envio | Cada módulo é dono das suas tabelas |
| Referência | Base legal, catálogos, Agenda da Reforma, notícias | Fonte oficial e data em cada registro; edição só por admin |
| Configuração | Parâmetros, rotinas, planos | Só em Administração |
| Integração e segredo | Tokens, certificados, chaves | Só no `.env` ou no cofre; a tela mostra o estado, nunca o valor |
| Dado de cliente no portal | Guias, arquivos, solicitações | Isolado por empresa; papel `cliente` só vê o que é da própria empresa |

## 9. Ciclo de vida e "pronto"

Situação do módulo: `em-breve` (só admin vê, com selo), `beta` (selo), `ativo`, `descontinuado` (redireciona). Um módulo só é dado como pronto quando tem: manifesto e rotas, testes, FAQ e roteiro, papéis definidos, estados de vazio, erro e carregando, exportação no padrão, QA no navegador, redirecionamento se a URL mudou e nenhuma página fora do manifesto.

## 10. Roteiro em fases

As estimativas são grosseiras e assumem agentes em paralelo; o que depende de contrato ou conta externa não tem data própria.

| Fase | Conteúdo | Depende de |
|---|---|---|
| 0. Estrutura | `navegacao.js`, manifestos dos módulos que existem, menu novo em 9 áreas, busca de módulo, selos "em breve", este documento | nada; cabe em um dia |
| 1. Núcleo | Serviços contratados (separa BPO e diagnóstico), usuários e acessos, perfil do usuário, carteira, tags e filtros, notificações, meus downloads, registro de acesso e IPs, painel da carteira (BI cadastral), calendário geral; simulador "onde cada regime vence"; honorários; processos e tarefas | nada; alguns dias |
| 2. Obrigações e arquivos | Agenda de obrigações (federais principais, com data de fonte oficial), arquivos, comunicados por e-mail | pesquisa de datas oficiais; alguns dias |
| 3. Receita | Integrações (Serpro), modelo de dados do monitoramento, monitoramento fiscal, análise de risco, envio de guias | contrato do Integra Contador e procuração dos clientes; 1 a 2 semanas depois do contrato |
| 4. Relacionamento | Portal do cliente, App, contratos e assinatura, cobrança, WhatsApp | conta Meta, conta Asaas, provedor de assinatura; 2 semanas ou mais |

## 11. Decisões assumidas (mude se discordar)

1. As 9 áreas acima, com a Captura de XML dentro de BPO Fiscal e o antigo "Escritório" unificado a ele (pedidos de 11/11/2026).
2. Novos módulos em `src/modulos/<modulo>`; os atuais migram quando tocados.
3. URLs atuais mantidas; o que mudar de URL ganha redirecionamento.
4. "Empresa em foco" entra na fase 1.
5. Portal do cliente em casca separada (`/portal`), papel `cliente`, sem menu interno.
6. Nenhum módulo sem manifesto, FAQ e roteiro.
7. A fase 3 só começa depois de decidido o contrato do Integra Contador.
8. Cadastro único; as carteiras de BPO e de diagnóstico pontual se separam pelo serviço contratado da empresa (seção 12).
9. O mapa completo (`docs/mapa-completo-veri-intax.md` e `.csv`) é a lista de controle: nada sai sem decisão registrada.

## 12. Cadastro único e duas carteiras

A base cadastral é uma só (Clientes). A separação entre **diagnóstico pontual** (projeto com início, fim e entregável) e **BPO** (rotina mensal) é feita pelo **serviço contratado** da empresa: tipo, situação, datas, responsável e módulos do BPO ligados. Cada área abre filtrada pela sua carteira, com a opção "todas as empresas". Uma empresa pode estar nas duas, e os dados operacionais de cada mundo ficam separados; a passagem entre eles é por ação explícita. O detalhe está na seção 3 de `docs/mapa-completo-veri-intax.md`.
