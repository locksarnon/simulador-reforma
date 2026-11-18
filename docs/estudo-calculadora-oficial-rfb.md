# Calculadora oficial da Receita (GitHub) × InTAX: estudo de encaixe

Estudo de 18/11/2026. Nada foi alterado no InTAX. Repositórios lidos (sem executar) em `Desktop\estudo-calculadora-rfb`:

| Repositório | Versão lida | Tecnologia | Licença |
|---|---|---|---|
| ReceitaFederal/calculadora-rtc-regime-regular | 1.6.1 (commit 150cccb, 22/10/2026), banco V0059 de 30/09/2026 | Java 21, Spring Boot, SQLite gerado por Flyway | MIT |
| ReceitaFederal/calculadora-rtc-simples-nacional | 0.0.6 (c5b0f01, 27/10/2026) | Java 21, usa o mesmo banco do regime regular | MIT |
| ReceitaFederal/calculadora-rtc-gerador-danfse | 1.0.0 (8d79e6b, 22/10/2026) | Go (servidor) e WebAssembly (navegador) | MIT |

Publicação autorizada pela Portaria Cotec nº 342/2026. A própria Receita diz que é um componente de referência e não substitui os sistemas.

---

## 1. O que a calculadora oficial realmente faz (e o que não faz)

### Faz bem (valor alto para o InTAX)

1. **Regras de enquadramento, com vigência por data**:
   - CST × cClassTrib: quais combinações existem;
   - cClassTrib × tipo de documento: NF-e, NFC-e, CT-e, NFS-e, BP-e, NFCom etc.;
   - nomenclatura obrigatória: se a classificação exige NCM ou NBS;
   - **NCM e NBS × itens dos Anexos I a XV da LC 214**, com exceções. São cerca de 1.700 vínculos e 70 exceções, e o NCM é testado por prefixo;
   - incidência do Imposto Seletivo pelo NCM.
2. **Atributos por cClassTrib**:
   - tipo de alíquota;
   - percentual de redução por tributo;
   - diferimento;
   - indicadores de crédito do adquirente e de crédito presumido;
   - manutenção ou anulação do crédito;
   - **fundamentação legal** (texto curto e artigo da LC 214).
3. **NFS-e**: valida o indicador de operação, comparando código de tributação nacional, cIndOp, cClassTrib e NBS. Também traz o local de fornecimento e de incidência e os cClassTrib possíveis para cada NBS.
4. **Base de cálculo unificada** (art. 12) da NF-e/NFC-e e da NFS-e, com o que entra e o que sai em cada ano:
   - PIS/COFINS saem só em 2026;
   - ICMS e ISS saem até 2032;
   - o IS entra a partir de 2027.
5. **Cálculo por item de CBS, IBS-UF e IBS-Mun**: aplica redução, diferimento e compra governamental. Devolve a memória de cálculo e o grupo IBS/CBS pronto para a nota.
6. **Geração e validação do grupo IBS/CBS contra o XSD oficial**:
   - NF-e e NFC-e v1.36;
   - CT-e, BP-e e NF3e v1.14a;
   - NFS-e v1.01.03, só validação.
7. **Códigos de erro oficiais** (REG-001 a 037, CAL, VSN), cada um com título e descrição. São mensagens prontas para os nossos apontamentos.

### Não faz (o InTAX continua sendo o dono)

| Lacuna da oficial | Consequência |
|---|---|
| Não descobre o cClassTrib: exige CST e cClassTrib informados | A sugestão "NCM → cClassTrib" continua sendo do InTAX. A oficial só **confere** |
| Alíquotas de CBS/IBS de 2027 em diante foram apagadas da base (V0053); a partir de 2027 o usuário precisa informar | A tabela de transição (TransicaoAno) e os cenários de 2029 a 2033 continuam no InTAX; a oficial aplica as regras sobre as nossas alíquotas |
| Sem alíquota própria de UF ou município | Igual ao InTAX hoje |
| IS sem valores: só marca a incidência | O InTAX segue com a alíquota informada |
| Crédito presumido, devolução, transferência de crédito, estorno, ajuste de competência e ZFM: grupos sempre vazios (há TODOs no código) | O crédito presumido (catálogo cCredPres, Decreto 12.955), a devolução e o crédito de estoque continuam só no motor do InTAX |
| Monofásicos de combustíveis (CST 620), CST 8xx (exceto 820), alíquotas fixas 220xxx e 221002–221004, suspensão de hidrocarbonetos: "não implementado" | O módulo de combustíveis do InTAX (Portaria MF 3.074) continua sendo o único |
| Simples: não calcula a alíquota efetiva, a faixa, o RBT12, o Fator R nem o DAS; não trata o regime híbrido (art. 41) nem o crédito do comprador | O Simples × Híbrido do InTAX continua. A oficial traz só as regras do grupo da nota (tipo de receita, atividades, compra governamental) |
| Sem autenticação; ao subir, consulta a versão no servidor piloto da Receita | Só pode rodar na rede interna do servidor |

### Ponto de atenção sobre a "verdade" dos dados

A tabela de **cClassTrib do InTAX é mais nova** que a da calculadora. O InTAX está na v1.70, de 01/10/2026; a última carga da Receita no banco da calculadora é de 23/06/2026. Por isso a oficial **não pode sobrescrever** as nossas tabelas às cegas. O certo é **comparar e apontar divergências**, prevalecendo a fonte de data mais recente, com a origem registrada.

---

## 2. Onde encaixa no InTAX

Legenda: **Substitui** = troca código ou tabela própria pela oficial. **Confere** = os dois calculam e a divergência vira apontamento. **Alimenta** = dado oficial que o InTAX não tinha.

| # | Ponto do InTAX hoje | Como é hoje | Encaixe | Ganho de assertividade |
|---|---|---|---|---|
| 1 | Correlação NCM × anexo → cClassTrib (`CorrelacaoNcm`, `ncm-classe.ts`), usada no saneamento, no WP, na importação de XML e na "Comparação da classificação" | Carga própria por script, casamento por prefixo | **Confere e alimenta.** Os vínculos oficiais NCM_APLICAVEL e EXCECAO viram a régua: "o NCM está no anexo desse cClassTrib?" (REG-011/015) | Alto: é a base de todas as sugestões de classificação |
| 2 | Checagens do saneamento de estoques e do cadastro (`produtos.service.ts`, `checagens.js`) | Regras próprias (NCM existente ou ativo, amparo no anexo) | **Alimenta.** Novas checagens oficiais: CST × cClassTrib (REG-006), nomenclatura obrigatória (REG-033), incidência de IS pelo NCM (REG-013), com a mensagem oficial | Alto: cada apontamento passa a citar a regra da Receita |
| 3 | Importação de XML e Repositório de XML | Lê só CST, cClassTrib e crédito presumido. **Não lê** base, alíquotas nem valores de IBS/CBS da nota | **Confere: auditoria do destaque.** Ler o grupo IBS/CBS de cada item, recalcular na oficial com os mesmos componentes e apontar diferença de base, de alíquota, de redução ou de valor. Validar também o grupo contra o XSD | Muito alto: é o que o BPO vende ("sua nota saiu errada" e "o crédito que você tomou está certo") |
| 4 | Validador de NFS-e (`validador-nfse.service.ts`) | Regras escritas à mão "conforme o XSD v1.01" e Anexo VIII | **Substitui ou confere.** Validação oficial do indicador de operação, base unificada da NFS-e e XSD v1.01.03 | Alto |
| 5 | Motor do simulador, `calcIbsCbs` e `baseIbsCbs` (navegador) | Próprio; casos fixos em `taxEngine.test.js` (67 testes) | **Confere.** (a) Na construção: todos os casos de teste rodados contra a oficial, com relatório de divergência. (b) Na tela: selo "conferido com a calculadora oficial vX" nas operações que ela cobre | Alto: o motor ganha uma prova externa |
| 6 | Tabela cClassTrib (`ClassTrib`) e fundamentação | SQL manual (v1.70) e fundamentos próprios | **Confere e alimenta.** Comparação campo a campo (redução, indicadores, documentos), mais a fundamentação oficial por cClassTrib | Médio a alto: avisa quando uma das duas desatualiza |
| 7 | Simples × Híbrido e compras no Simples | Motor próprio (Anexos XVIII–XXII) | **Alimenta**, sem servidor novo. Portar para o motor as regras pequenas da NT 2026.005: 7 tipos de receita, 15 atividades, fatores de compra governamental de 2027 a 2033. O crédito do comprador passa a ser o valor destacado na nota | Médio |
| 8 | DANFSe (`danfse.ts`, próprio, NT 008) | pdfkit | **Substitui (opcional).** Leiaute oficial pelo serviço em Go ou pelo WebAssembly no navegador. Passar "cancelada" pelo evento guardado | Baixo a médio: o nosso já segue a NT 008; ganho de manutenção |
| 9 | Atualização das tabelas oficiais | Anexo VIII semanal; NCM e cClassTrib manuais | **Alimenta.** Rotina semanal que olha a versão nova da calculadora no GitHub e avisa o administrador, que reconstrói | Médio: tira a dependência de lembrar |

---

## 3. Como rodar (arquitetura)

- **Um contêiner novo, `reforma-calculadora-rfb`**, igual ao ReceitanetBX:
  - imagem própria que compila o código da Receita numa versão fixa (tag ou commit) e gera o banco SQLite no próprio build;
  - porta só na rede interna;
  - `mem_limit` de 768 MB. A VPS tem cerca de 6 GB disponíveis hoje (medido em 18/11).
- **O Simples usa o mesmo banco.** Pode ser um segundo processo na mesma imagem ou, como o ganho é pequeno, ficar só com as regras portadas para o motor (linha 7).
- **No backend:**
  - um `calculadora-rfb.cliente.ts` com URL configurável;
  - um serviço de saúde e versão em Administração > Integrações, mostrando "Calculadora oficial: versão X, banco V00xx".
- **Tabelas oficiais no Postgres do InTAX:** um importador copia do SQLite as tabelas de regra (cClassTrib, vínculos NCM/NBS, exceções, vínculos com documento, fundamentação, redução) para tabelas próprias, com a versão. Assim as checagens rodam no banco sem chamar o serviço item a item. O serviço fica para o cálculo e para o XSD.
- **Versão travada:** a atualização entra só quando o administrador aprova. Antes, roda a bateria de comparação (seção 4) e mostra o que mudou.

---

## 4. Plano por fases

Nenhuma fase toca a produção antes de a anterior estar validada.

| Fase | Entrega | Produção? |
|---|---|---|
| **0. Prova local** | Subir a calculadora localmente. Rodar (a) todos os casos de teste do motor e (b) a base do art. 12 de 2026 a 2033 contra ela. Comparar as tabelas (nossa cClassTrib v1.70 × banco da Receita; CorrelacaoNcm × NCM_APLICAVEL). **Relatório de divergências**, cada uma classificada como erro nosso, desatualização deles ou diferença de premissa | Não |
| 1. Serviço e tabelas | Contêiner interno, importador das tabelas oficiais com versão, tela de versão e saúde, rotina de "versão nova disponível" | Sim |
| 2. Auditoria das notas | Leitor do grupo IBS/CBS por item (NF-e, NFC-e, CT-e, NFS-e). Recálculo e XSD em lote no Repositório de XML; aba "Divergências IBS/CBS" por cliente com Excel; alerta no monitoramento | Sim |
| 3. Checagens oficiais | Saneamento, WP, importação e validador de NFS-e passam a usar as regras oficiais, com o código e a mensagem da Receita | Sim |
| 4. Motor conferido | Selo de conferência no simulador; regras do Simples (NT 2026.005) no motor; troca do DANFSe | Sim |

Cada fase atualiza o POP e o FAQ no mesmo commit.

---

## 5. Riscos e cuidados

1. **Base mais antiga que a nossa em partes:** cClassTrib de junho × nosso v1.70 de outubro. A regra é comparar, nunca sobrescrever, e mostrar a origem de cada dado.
2. **Cálculo de 2027 em diante é "simulado" pela própria Receita** (aviso `x-warning-dados-simulados` = 6), porque as alíquotas vêm de nós. A conferência vale para a regra (base, redução, diferimento), não para a alíquota.
3. **Partes não implementadas** (crédito presumido, monofásicos, ZFM): a oficial responde "não implementado". O InTAX não pode tratar isso como "conferido".
4. **Sem autenticação**: o serviço só pode ficar na rede interna, nunca publicado no Traefik.
5. **Atualizações frequentes** (a Release 16 está prevista): por isso a versão travada, a atualização aprovada pelo administrador e a bateria de comparação antes.
6. **Licença MIT**: manter o aviso de copyright da Receita na imagem e numa página "Sobre" ou de créditos.
