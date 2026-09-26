# Conferência: tabela NCM × anexos (CorrelacaoNcm) contra o texto da LC 214/2025

Feita em 27/09/2026 comparando `CorrelacaoNcm` (542 linhas) com o texto integral dos anexos carregado na Base legal.

## Cobertura por anexo

| Anexo | Assunto | Situação |
|---|---|---|
| I | Alimentos (alíquota zero) | Coberto. **Faltava o item 26** (fórmulas dietoterápicas, NCM 2106.9090) — incluído. |
| II | Serviços de educação (NBS) | Não é NCM — fica na tabela de serviços (NBS). |
| III | Serviços de saúde (NBS) | Não é NCM — idem. |
| IV, V, VI, VII, VIII, XII, XIII | Dispositivos médicos, acessibilidade, medicamentos, etc. | Cobertos. |
| IX | Insumos agropecuários (60%) | Coberto, exceto **itens 3 (Capítulo 25) e 19 (Capítulos 10, 11 e 12)**, que são capítulos inteiros e/ou dependem da destinação (ração/fertilizante). **Não incluídos de propósito**: um prefixo de 2 dígitos geraria sugestões erradas. Decisão do especialista. |
| X | Produções artísticas/culturais (NBS/NCM) | Predominantemente NBS; sem NCM de produto a completar. |
| XI | Bens e serviços de soberania e segurança nacional (60%) | **Não coberto** (30 NCMs/posições). Depende de decisão do especialista sobre o cClassTrib aplicável (o catálogo só traz o 200043, de fornecimento à administração pública). |
| XV | Hortícolas, frutas e ovos (alíquota zero) | Coberto. **Faltava o item 4 (Capítulo 6, floricultura)** — incluído. |
| XVI | Limite inferior da alíquota própria (tabela por ano) | Não é NCM. |
| XVII | Imposto Seletivo (veículos, bebidas, minerais…) | **Não coberto**: o motor ainda não trata o Imposto Seletivo (fora do escopo desta conferência). |
| XVIII–XXIII | Sub-anexos das regras de transição | Não são NCM. |

## Efeito prático
- O NCM 2106.9090 passou a ser **ambíguo** (aparece no Anexo I e no VI): a lei dá tratamentos diferentes conforme o produto, e o sistema agora avisa em vez de escolher um.
- Reaplicar: `docker exec reforma-backend node scripts/completar-correlacao-anexos.js` (idempotente).
