# Crédito do estoque na transição (crédito presumido de CBS sobre o estoque de abertura)

Guia do consultor para o saneamento de estoques, Fase 2. O cálculo está em
`backend/src/saneamento-estoques/fiscal/credito-estoque/` (módulo de cálculo, ainda não ligado às telas).

## Fontes lidas (27/11/2026)

- **LC nº 214/2025**, arts. 57, 381, 382 e 383: texto compilado do Planalto
  (https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm). O art. 381 não tem alteração posterior.
- **Decreto nº 12.955/2026**, arts. 605 a 613: Planalto
  (https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm).
- A cópia da base legal do InTAX, capturada em 25/09/2026, é **idêntica** ao Planalto nesses artigos.

**Divergência no próprio Decreto:** o art. 613 (prazo de 5 anos) remete entre parênteses ao "Art. 382 da LC 214",
mas o conteúdo é o do **art. 383** da LC 214. O art. 382 trata de outro assunto: a preferência na compensação.
Nos papéis, cite LC 214, art. 383, e Decreto 12.955, art. 613.

## Quem tem direito

| Regra | Dispositivo |
|---|---|
| Só o contribuinte que estiver no **regime regular da CBS** em 2027. | LC 214, art. 381, caput; Decreto, art. 605, caput |
| **Hipótese I.** Empresa no **regime cumulativo** de PIS/Cofins (Lei 9.718/1998) em **31/12/2026**: vale para os bens em estoque sem crédito de PIS/Cofins por causa desse regime. | LC 214, art. 381, I; Decreto, art. 605, I |
| **Hipótese II.** Em qualquer regime: bens sujeitos, **na aquisição**, ao monofásico ou à substituição tributária das leis listadas: Lei 10.147/2000, art. 1º, I; Lei 10.485/2002, art. 1º, art. 3º, II, e art. 5º; MP 2.158-35/2001, art. 43; Lei 9.532/1997, art. 53; Lei 12.402/2011, art. 6º, II. | LC 214, art. 381, II, "a" a "e"; Decreto, art. 605, II |
| **Hipótese III.** Empresa no não cumulativo com vedação parcial de crédito (receitas também no cumulativo, Leis 10.637 e 10.833, art. 3º, §§ 7º a 9º): vale só para a **parcela** do valor que ficou sem crédito. | LC 214, art. 381, III; Decreto, art. 605, III |

Empresa no não cumulativo "puro" só tem o crédito nos itens da hipótese II.

## Quais bens entram

| Regra | Dispositivo |
|---|---|
| Só **bens novos**, comprados de **pessoa jurídica no País** ou **importados**. | LC 214, art. 381, § 1º, I; Decreto, art. 607, caput |
| Destinação: **revenda**, **produção de bens para venda** ou **prestação de serviços a terceiros**. | idem |
| O estoque de abertura reúne mercadorias, produtos acabados, produtos em processo, matérias-primas e materiais de embalagem **próprios**. Bens de terceiros ficam fora. | Decreto, art. 606, § 1º |

## Exclusões

| Fica fora | Dispositivo |
|---|---|
| Bem comprado com **alíquota zero, isenção, suspensão ou não incidência** de PIS/Cofins | LC 214, art. 381, § 1º, II; Decreto, art. 607, § 1º |
| Bem de **uso e consumo pessoal** (lista do art. 57 da LC 214) | LC 214, art. 381, § 1º, III |
| **Ativo imobilizado**, inclusive ativo de contrato, intangível ou financeiro de concessionária de serviço público | LC 214, art. 381, § 1º, IV, "a", e § 5º; Decreto, art. 607, §§ 1º e 2º |
| **Imóveis** | LC 214, art. 381, § 1º, IV, "b" |
| Bem **usado**, bem nacional comprado de **pessoa física** (por exemplo, produtor rural pessoa física), material de uso e consumo do estabelecimento | LC 214, art. 381, § 1º, I (a contrario) |
| Item sem **documentação fiscal idônea** | Decreto, art. 606, § 2º |

## Valor do crédito

| Regra | Dispositivo |
|---|---|
| **Bens nacionais: 9,25%** sobre o valor do estoque. Confirmado no texto da LC e do Decreto. | LC 214, art. 381, § 3º, I; Decreto, art. 607, § 3º, I |
| **Bens importados:** o PIS-Importação e a Cofins-Importação **efetivamente pagos**, **sem o adicional** da Cofins-Importação (Lei 10.865, art. 8º, § 21). Os 9,25% não se aplicam aqui. | LC 214, art. 381, § 3º, II; Decreto, art. 607, § 3º, II |
| Base: o estoque em 31/12/2026 pelo **custo de aquisição**, pelos critérios do **IRPJ**, com ajuste do valor unitário a esses critérios. | Decreto, art. 609, caput e § 3º |
| **Produtos acabados e em processo:** só o custo de aquisição das **matérias-primas e embalagens** (sem mão de obra nem custos indiretos). | Decreto, art. 609, § 2º |
| Inventário **segregando** bens nacionais e importados. | Decreto, art. 609, § 1º |

Na hipótese III, a base é só a parcela vedada: valor × percentual sem crédito × 9,25%.

## Prazos e utilização

| Regra | Dispositivo |
|---|---|
| Inventário **exclusivamente em 31/12/2026**. 1º/01/2027 não serve. É responsabilidade do contribuinte e é feito uma única vez. | Decreto, art. 608, caput, §§ 1º e 2º; art. 606, caput |
| Registrar o estoque de abertura no **Livro de Inventário** com quantidade, valor unitário, classificação fiscal (NCM), descrição e demais especificações. | Decreto, art. 610 |
| **Apurar e apropriar até 30/06/2027.** Depois disso, o direito se perde. | LC 214, art. 381, § 4º, I; Decreto, art. 607, § 4º, I |
| Utilização em **12 parcelas mensais iguais e sucessivas**, a partir do mês seguinte ao da apropriação. | LC 214, art. 381, § 4º, II |
| **Só compensa CBS.** Não compensa outros tributos e não gera ressarcimento. | LC 214, art. 381, § 4º, III |
| Na compensação, tem **preferência** sobre os créditos de CBS do art. 53. | LC 214, art. 382; Decreto, art. 612 |
| O direito de utilização **extingue-se em 5 anos**, contados do último dia do período de apuração da apropriação. Exemplo: apropriado em março/2027, o direito acaba em 31/03/2032. | LC 214, art. 383; Decreto, art. 613 |
| **Devolução**, a partir de 1º/01/2027, de bem do estoque de abertura: **estornar** o crédito. | Decreto, art. 611 |
| Guardar a documentação por no mínimo **5 anos** a partir do inventário. | Decreto, art. 606, § 3º |

### Efeito de 31/12/2026 e 1º/01/2027 no trabalho

- O que conta é o **estoque físico próprio em 31/12/2026**. O saneamento precisa estar concluído antes dessa data:
  NCM, tipo do item, unidade, duplicidades e custo. Corrigir depois não muda o inventário daquele dia.
- O **regime de PIS/Cofins em 31/12/2026** decide a hipótese. Uma mudança de regime para 2026 muda o direito.
- Inventário ruim (sem custo de aquisição, sem NCM ou sem nota idônea) significa crédito perdido no item.

## Dados necessários

**Do saneamento (por item)**

- Tipo do item no registro 0200 (TIPO_ITEM): 00 revenda; 01 e 02 matéria-prima e embalagem; 03 e 04 em processo e acabado; 07 uso e consumo (fora); 08 imobilizado (fora); 09 serviço (fora).
- NCM, descrição e unidade, para o Livro de Inventário (art. 610).
- Quantidade e custo de aquisição em 31/12/2026, pelos critérios do IRPJ.
- Propriedade no registro H010 (IND_PROP): 0 e 1 são próprios e entram; 2 é de terceiros e fica fora.

**Do cliente**

- Regime de PIS/Cofins em 31/12/2026 e confirmação do regime regular da CBS em 2027.
- No regime misto: o percentual do valor sem crédito pela vedação parcial, pelo método que a empresa já usa na EFD-Contribuições (apropriação direta ou rateio).
- Por item ou grupo:
  - origem (nacional ou importado);
  - fornecedor pessoa jurídica (sim ou não);
  - bem novo (sim ou não);
  - tratamento de PIS/Cofins na compra (tributada, alíquota zero, isenção, suspensão ou não incidência; o CST de entrada ajuda);
  - se é monofásico ou ST das leis da hipótese II;
  - se houve crédito de PIS/Cofins na compra.
- Produtos acabados e em processo: o custo de matérias-primas e embalagens incorporado.
- Importados: o PIS e a Cofins-Importação pagos na DI ou DUIMP, com o adicional separado.
- Notas fiscais idôneas de todos os itens.

## O que NÃO está confirmado

Nestes casos o módulo não soma valor: o item aparece em "premissas não confirmadas".

1. **Optante pelo Simples Nacional em 31/12/2026.** A hipótese I fala do regime cumulativo "estabelecido precipuamente pela Lei 9.718/1998". A norma não diz se o Simples Nacional entra.
2. **Monofásico comprado com alíquota zero.** É o caso do varejo que compra de distribuidor. A hipótese II inclui esses bens, mas o § 1º, II, exclui compras com alíquota zero. A norma não resolve o conflito.
3. **Monofásico ou ST com crédito já tomado na compra.** A hipótese II não trata desse caso.
4. **Produto intermediário (06), subproduto (05) e outros insumos (10).** O Decreto (art. 606, § 1º) não os lista no estoque de abertura. A LC fala em bens "para utilização na produção".
5. **Importado na hipótese III.** A norma não diz como aplicar a parcela vedada ao PIS e à Cofins-Importação pagos.
6. **Forma de apropriação e declaração** (registro ou campo na apuração da CBS): depende de ato da RFB não localizado nas fontes lidas.
7. **Centavos das 12 parcelas.** A norma exige parcelas iguais e não trata do resíduo. O módulo lança a diferença na 12ª parcela e sinaliza.
8. **Alcance de produtos de cada lei da hipótese II.** Só os dispositivos foram conferidos. A lista de produtos de cada lei deve ser conferida no texto da própria lei antes de marcar o item.
9. **Estorno por devolução** (art. 611): a regra está confirmada, mas o valor não é calculado pelo módulo.
