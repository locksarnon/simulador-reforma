/**
 * FAQ do Saneamento de Estoques e Cadastro de Produtos (serviço da Consultoria Tributária) e do botão Analisar com IA.
 * Os textos de abas, botões e situações são os reais das telas. Passo a passo: POP-CON-09 a POP-CON-20 e, na Administração, POP-ADM-26 (Biblioteca de diretrizes).
 */
export const SECAO_SANEAMENTO = {
  titulo: "Saneamento de estoques e cadastro de produtos (consultoria)",
  nota: "O serviço de consultoria que limpa o cadastro de itens do cliente e prepara o tratamento tributário de IBS e CBS, com revisão por camada. Abre pelo projeto, em Consultoria Tributária > Projetos.",
  itens: [
    {
      p: "O que são as Diretrizes do saneamento?",
      r: "São as regras do cliente, por aspecto e por grupo, que comandam as análises e, aprovadas, formam a política de cadastro e estoques. Ficam na aba Diretrizes, entre a Importação e as análises, e podem ser abertas a qualquer momento (antes da importação, só para Todos os grupos). São 5 aspectos, cada regra com um código: Padrão de nomes (N01…), Atributos técnicos (A01…), Unidades e embalagens (U01…), Limites de caracteres (L01…) e Classificação fiscal (F01…). Cada grupo tem no máximo uma regra por aspecto: Todos os grupos é o padrão, e a regra de um grupo é a exceção. O quadro Grupos sem regra mostra o que falta (POP-CON-19).",
    },
    {
      p: "Aplicar uma regra muda o cadastro na hora?",
      r: "Não. Aplicar e reanalisar sempre mostra antes a prévia: os grupos, quantos itens serão analisados de novo, quais análises serão refeitas e se algum grupo está em outra regra do mesmo aspecto (nesse caso, é preciso marcar a transferência). Só depois de Confirmar e aplicar as análises rodam, e só para os itens afetados. Com muitas regras (por exemplo, depois de aplicar um modelo), use Aplicar todas as regras: uma prévia só, somando as regras, e uma reanálise só, em vez de abrir regra por regra. O resultado são casos para revisar, como sempre: nada é gravado no cadastro sem a sua aprovação. Alterar uma regra já aprovada a devolve a Rascunho e marca “revisar” no que depende dela. Ao reaplicar, o caso ainda proposto passa a mostrar a proposta da regra nova; o caso que você já editou ou decidiu não é alterado e ganha “revisar”.",
    },
    {
      p: "Para que serve a Biblioteca de diretrizes?",
      r: "É o cadastro único das regras-modelo FAL, em Administração > Configuração e ERPs > aba Biblioteca de diretrizes (só o administrador altera). No projeto, Partir de uma regra da biblioteca carrega o conteúdo e você ajusta só o que é diferente para o cliente; Aplicar modelo da biblioteca cria de uma vez as regras de um modelo, em rascunho, sem duplicar. Quando a regra-modelo ganha versão nova, a regra do projeto mostra “Regra atualizada na biblioteca” e o botão Adotar: nada muda sozinho (POP-ADM-26).",
    },
    {
      p: "Qual limite de caracteres vale quando o leiaute oficial, o ERP e o cliente dizem números diferentes?",
      r: "Vale o menor limite confirmado. O leiaute oficial (Guia Prático do SPED, MOC da NF-e), com referência e versão, é o teto; depois vem o ERP e, por fim, o limite próprio do cliente. Limite sem número fica não confirmado (pendente), nunca um número genérico. Se o ERP aceitar mais caracteres que o leiaute oficial, a regra avisa. As linhas do ERP vêm do Cadastro de ERPs pelo ERP escolhido no projeto; trocar o ERP muda o rascunho da regra, e a análise só muda quando você aplica. O texto nunca é cortado: o excesso gera proposta com abreviação aprovada ou pedido de revisão, conforme a linha.",
    },
    {
      p: "Como uso uma decisão de um caso como regra para os outros itens?",
      r: "No detalhe do caso, clique em Transformar em regra. O aspecto, o nome e os grupos vêm preenchidos pelo caso; escolha se a regra fica neste projeto ou na biblioteca (só o administrador) e clique em Criar a regra. Ela nasce em Rascunho (com Na biblioteca, a regra-modelo é criada sem códigos de item do cliente e o projeto ganha a regra que parte dela, com as exceções do caso); abra-a nas Diretrizes, complete e use Aplicar e reanalisar, com a prévia. A decisão isolada nunca muda uma regra sozinha (POP-CON-20).",
    },
    {
      p: "Onde baixo a política de cadastro e estoques?",
      r: "No botão Política (PDF), na aba Diretrizes e na aba Versões. Sem versão, sai a política de agora, marcada Rascunho enquanto houver regra não aprovada; na linha de uma versão liberada, sai a política daquela versão, sempre igual. A política traz a identificação, as regras por aspecto com o código e os grupos, os procedimentos com fluxograma, os controles internos, a seção fiscal, o quadro de consulta por grupo e as pendências (regras não aprovadas e grupos sem regra) em seção própria.",
    },
    {
      p: "O que muda no saneamento quando o ERP do cliente tem perfil no Cadastro de ERPs?",
      r: "O projeto abre com o ERP do cadastro do cliente (dá para trocar na Configuração, só para este trabalho). Com o perfil do ERP: a Importação mostra as consultas de extração com o botão Copiar e já reconhece as colunas do export (no SAP Business One, o NCM vem de ONCM.NcmCode pelo JOIN, nunca da chave interna OITM.NCMCode); o detalhe do caso e a aba Impacto nas obrigações mostram as restrições do ERP para o tipo de ajuste, com grau e fonte; a coluna Ação no ERP das Unificações e do Excel usa o procedimento do ERP (no SAP Business One, a unificação é saída de mercadoria OIGE do código que sai, entrada OIGN no que fica e inativação do que sai); e o relatório PDF traz a seção “Particularidades do ERP (nome)”. ERP com perfil a desenvolver ou Outro ERP (sem perfil) usa só as regras gerais, sem alertas específicos.",
    },
    {
      p: "As tabelas de Casos e de Unificações funcionam como a aba Tabela?",
      r: "Sim, no Saneamento de estoques as três têm o mesmo layout: contador no topo, cabeçalho e colunas da esquerda fixos ao rolar (Código nos Casos; as duas primeiras de cada lista nas Unificações), linhas baixas com zebra, selos de situação e textos longos numa linha só (passe o mouse ou clique para ler inteiro). Nos Casos e nas Unificações também há Buscar nesta lista, Filtros por coluna, ordenação pelo título da coluna, Colunas (ocultar e reordenar) e Exportar, sobre o que está carregado na tela. Nos Casos, a lista carrega mais ao rolar até o fim; nas Unificações, as páginas de 100 linhas seguem em Anterior e Próxima (POP-CON-14 e POP-CON-18).",
    },
    {
      p: "Como sei quais códigos vão deixar de existir e para onde vai o saldo de cada um?",
      r: "Na aba Unificações, em três listas: Unificações (abre nela), Inativações e Equivalências, cada uma com as colunas que usa. Em Unificações, cada linha é um código que sai: a descrição, a unidade e o saldo dele; o código que fica, com o saldo atual; o saldo que entra e o saldo consolidado; a situação (Proposta ou Aprovada); a ação no ERP (por exemplo, “Transferir o saldo de Y para X e inativar Y”; sem saldo no código que sai, só “Inativar o código que sai”); o início da vigência e a justificativa. Em Inativações ficam os códigos só inativados, com a origem (sem movimentação ou duplicidade); em Equivalências, os códigos relacionados que continuam ativos. Quando as unidades são diferentes sem fator de conversão aprovado (ou o fator não diz de qual unidade para qual), ou falta saldo na base, a coluna Alerta de coerência avisa e o saldo não é somado. Base com saldo multiplicado por 1.000.000 aparece já dividida. Filtre por situação e código e clique em Baixar listas (Excel) para mandar a quem faz os ajustes: uma aba por lista e a aba Conflitos. A mesma informação sai na aba De para e equivalências do Excel da entrega; na versão liberada, só o aprovado (POP-CON-18).",
    },
    {
      p: "O que é o quadro vermelho de conflitos na aba Unificações?",
      r: "É o par unificação × inativação que não pode seguir assim: o código que fica numa unificação também tem inativação (proposta ou aprovada) ou já está inativo no cadastro. O quadro mostra cada par, por exemplo “200 → 100 (unificação proposta) × inativação aprovada de 100, sem movimentação”. Rejeite ou reabra um dos dois casos antes de ajustar o ERP. A tela mostra até 20 pares; o Excel das listas traz todos na aba Conflitos (POP-CON-18).",
    },
    {
      p: "O sistema aponta itens sem movimentação há muito tempo para limpar a base?",
      r: "Sim, na camada Qualidade, se a importação trouxer a coluna da última movimentação e o Corte de movimentação estiver informado na Configuração. Item ativo (ou de situação não informada) cuja última movimentação é anterior ao corte entra num caso por grupo. Sem saldo, o caso propõe inativar; aprovar inativa os itens, eles entram na aba Unificações com a ação “Inativar” e o checklist do SPED ganha o ajuste “Inativou código”, só com o 0200 (o código deixa de ser apresentado quando não for referenciado nos demais blocos e não pode ser reutilizado) e o H010 (código inativado não pode ter saldo no inventário). Os registros de troca de código (0205, 0221 e C170) ficam só na consolidação (unificação). Com saldo, o caso não propõe inativar: pede regularizar o saldo antes. O código que fica numa unificação não é proposto; se a Qualidade rodou antes, propor ou aprovar a unificação marca a Qualidade como “revisar” e a aba Unificações mostra o conflito. Sem o corte, o critério não é aplicado, e a Cobertura e o relatório dizem isso.",
    },
    {
      p: "O que é a finalidade e o enquadramento legal de um item?",
      r: "A finalidade diz para que o cliente usa o item: Revenda, Matéria-prima, Insumo de produção, Embalagem, Uso e consumo, Manutenção, Imobilizado ou Material de terceiros. O enquadramento legal é o texto da lei e o artigo que sustentam o tratamento tributário (cClassTrib e CST) do item, e depende do NCM e da finalidade. Ambos saem na aba Cenários tributários do Excel. O sistema sugere, o consultor confirma: o texto da lei prevalece sobre qualquer sugestão.",
    },
    {
      p: "As Atividades do cliente vieram vazias. O que faço?",
      r: "Leia o aviso “Nenhuma atividade na lista”. Se o cliente é empresa, o cadastro não tinha CNAE e a consulta ao CNPJ não trouxe atividades (ou falhou ao abrir o projeto): clique em Buscar atividades pelo CNPJ, que consulta a Receita, atualiza os dados públicos do cliente e acrescenta os CNAEs. Se é pessoa física, escolha as atividades em Da lista de atividades e clique em Acrescentar. O mesmo botão, ao lado do título, atualiza a lista a qualquer momento sem apagar nada; com as atividades confirmadas, ele só avisa o que falta e mostra “Revisar atividades”. Passo a passo: POP-CON-10.",
    },
    {
      p: "Como apresento ao cliente as etapas do saneamento?",
      r: "Pelo botão Roteiro do projeto, no alto da página do saneamento. Ele mostra as fases (Saneamento de estoques, Tributário e Reforma, Fechamento), as etapas de cada uma e a situação real da Fase 1 no projeto. Clicando numa etapa, aparece o que é feito, o que o cliente fornece e o que recebe. O Modo apresentação esconde os números internos, e Imprimir ou salvar em PDF gera o roteiro completo para levar à reunião (POP-CON-09).",
    },
    {
      p: "Como o sistema sugere a finalidade de cada grupo na camada Finalidade?",
      r: "A finalidade é da Fase 2 (Tributário e Reforma): sai da camada Grupos, que na Fase 1 só organiza a estrutura de grupos. O sistema lê o nome do grupo e do item (no singular ou no plural) e as atividades confirmadas nas Premissas da Fase 2. Fertilizantes, corretivos, defensivos, sementes, mudas e nutrição, vacinas e medicamentos da pecuária são insumo agropecuário: Insumo de produção para quem produz, Revenda para quem revende insumos. Combustíveis e lubrificantes são Insumo de produção quando o cliente tem atividade que os consome. Peças, filtros, pneus, parafusos, ferramentas e materiais de oficina vão para Manutenção; EPI, uniformes, limpeza, copa, expediente, informática e medicamentos de saúde ocupacional, para Uso e consumo. Grupos que dependem do uso (materiais de construção, lonas e plásticos, beneficiamento ou industrialização) recebem sugestão de confiança baixa com as alternativas no caso. Plantel, Produção, serviços, taxas e grupos genéricos ficam sem sugestão, com o motivo, e vão para confirmar com o cliente: o sistema nunca inventa a finalidade. Na aba Tabela, a finalidade proposta aparece como “sugerida” até o caso ser aprovado em Casos, e o botão “i” no título da coluna Finalidade mostra esta regra.",
    },
    {
      p: "Por que preciso confirmar as atividades do cliente?",
      r: "Porque a finalidade e o tratamento tributário, que são da Fase 2, dependem do que o cliente realmente faz. As atividades vêm do CNAE principal e dos secundários do CNPJ; na Configuração, em Premissas da Fase 2, você mantém as que valem, exclui as outras e acrescenta as que faltam. A importação e toda a Fase 1 seguem sem essa confirmação. Enquanto não clicar em Confirmo as atividades, só as análises da Fase 2 ficam bloqueadas. Reabrir para alterar bloqueia de novo a Fase 2 e marca como “revisar” o que já tinha sido trabalhado, sem apagar nenhuma decisão.",
    },
    {
      p: "O que falta para começar a Fase 2 (Tributário e Reforma)?",
      r: "Três passos, nesta ordem: liberar uma versão da Fase 1 (Cadastro saneado) na aba Versões; informar o regime do cliente no IBS e na CBS; e confirmar as atividades do cliente. Os dois últimos ficam na aba Configuração, em Premissas da Fase 2. Na Cobertura das camadas, o bloco da Fase 2 mostra o aviso “Fase 2 ainda não liberada” com o que falta e um botão que leva à aba certa; até lá, os botões da Fase 2 ficam apagados. A Fase 1 nunca fica bloqueada (POP-CON-09 e POP-CON-10).",
    },
    {
      p: "Como fica a Cobertura das camadas agora que o trabalho é em fases?",
      r: "Ela mostra dois blocos. Fase 1 · Saneamento de estoques: Identificação, Qualidade, Duplicidades, Grupos, Nomes e unidades, Validar NCM e Impacto no SPED. Fase 2 · Tributário e Reforma: Finalidade, Classificação NCM (reclassificação: NCM incompatível com a descrição, informação insuficiente ou diferente entre itens iguais), Tratamento tributário e Impacto no SPED. Cada bloco tem o botão Analisar a fase (na ordem) e cada camada o seu botão Analisar. Impacto no SPED aparece nas duas fases porque roda no fim de cada uma.",
    },
    {
      p: "Qual a diferença entre exportação para revisão e entrega liberada?",
      r: "A exportação para revisão (quadro Para revisão, na aba Versões) é a base de agora, com o que ainda está proposto ou pendente marcado no Excel; serve para conferir o trabalho e não vai ao cliente. A entrega liberada vem de uma versão liberada: é uma foto da base que não muda depois e leva só os dados aprovados, informando o que ficou de fora e as pendências.",
    },
    {
      p: "O que significa a marca “revisar”?",
      r: "Significa que algo de que aquela decisão depende mudou depois dela, por exemplo a finalidade, o NCM, a unidade ou as atividades do cliente. A decisão anterior não é apagada: a marca só pede que você confira se ela ainda vale. Na tabela, o filtro Só marcadas “revisar” junta o que precisa dessa conferência.",
    },
    {
      p: "O que são conjunto e exceção?",
      r: "Conjunto é o grupo de itens com o mesmo NCM e a mesma finalidade: o tratamento tributário é decidido uma vez para ele, e cada item herda o resultado (etiqueta “herdado do conjunto”). Exceção é o item que não segue o conjunto ou o grupo: você a registra na visão focada, com motivo obrigatório, e ela abre um caso individual que precisa ser aprovado (etiqueta “exceção”). O trabalho é por conjunto, mas o resultado e o Excel são por item. Na finalidade, os itens que fogem da do grupo já vêm num caso próprio de exceção, que exige o motivo na Justificativa; a finalidade informada pelo cliente também passa pela confirmação. O Cadastro saneado traz a Origem da finalidade: herdada do grupo, exceção ao grupo (com o motivo), informada pelo cliente e confirmada no grupo, ou informada no cadastro e não confirmada.",
    },
    {
      p: "Por que um caso de unidade traz centenas de itens?",
      r: "Porque o trabalho é por conjunto: itens com a mesma unidade escrita e a mesma proposta (por exemplo, todos os “KGS” que viram “KG”, ou todas as “TONELADA” com fator 1.000) formam um só caso. Ao aprovar, a mudança é aplicada item a item e cada item ganha o seu histórico. Se um item tiver conteúdo diferente (outro fator), registre a exceção dele na visão focada antes de aprovar o conjunto: o conjunto não mexe no item que tem exceção.",
    },
    {
      p: "Na reimportação com milhares de diferenças, preciso marcar item por item?",
      r: "Não. Em O que incorporar, escolha Todos os alterados (campos protegidos ficam como estão) ou Só os alterados sem campo protegido: vale para todas as diferenças do arquivo, não só para a página na tela. Os totais (inclusive os itens com campo protegido) são sempre do arquivo inteiro, e a lista de diferenças vem em páginas.",
    },
    {
      p: "Por que não consigo aprovar uma duplicidade com a decisão “solicitar informação”?",
      r: "Porque aprovar essa decisão não muda nada: falta a informação do cliente. Use Pedir informação… (o caso passa a Aguardando informação) ou escolha outra decisão na lista Decisão da proposta e então aprove. Ao aprovar em lote, esses casos ficam de fora, com o motivo na prévia.",
    },
    {
      p: "Como decido milhares de casos de uma vez, inclusive os que não têm proposta?",
      r: "Na aba Casos, filtre (por exemplo, Tipo “NCM inexistente”), não marque nada e clique em Decidir em lote…: o lote vale para todos os casos em aberto do filtro, não só os carregados na tela. Escolha Aprovar, Pedir informação ou Rejeitar, escreva o texto comum (obrigatório para pedir informação e rejeitar), veja a prévia e confirme. O InTAX decide em rodadas de até 2.000 casos sozinho, mostrando o progresso; se algum caso ficar para depois, a tela diz quantos e oferece Continuar. As exceções aparecem com o código e a descrição do item (POP-CON-14).",
    },
    {
      p: "Por que a aba Casos mostra grupos em vez de um caso por linha?",
      r: "Porque a caixa Agrupar casos iguais vem marcada: casos da mesma camada, do mesmo tipo, de itens do mesmo grupo de produtos e com a mesma proposta viram uma linha só, com quantos Casos e quantos Itens ela junta (o contador no alto diz “N grupo(s) (M caso(s))”). Caso de conjunto, que já reúne vários itens, fica numa linha sozinho. Clique na linha para ver o que os casos têm em comum e a lista deles (clique num caso para abri-lo; Voltar ao grupo retorna). O botão Decidir os N caso(s) do grupo em lote… abre o lote de sempre com todos os casos do grupo, com a prévia e as mesmas exceções; marcar várias linhas e clicar em Decidir em lote… junta os casos dos grupos marcados. Nada muda nos casos: desmarque a caixa para voltar à lista de um caso por linha (POP-CON-14).",
    },
    {
      p: "Como decidir os casos no Excel?",
      r: "Na aba Casos, escolha a Camada, clique em Planilha de decisão e em Baixar planilha da camada. Em cada linha (um caso), escolha a Decisão na lista (Aprovar, Rejeitar ou Pedir informação), escreva o Motivo quando for rejeitar, pedir informação ou aprovar exceção, e use Valor corrigido só se discordar da proposta, no campo indicado (NCM, descrição ou unidade). As outras colunas ficam travadas. Depois, em Planilha de decisão > Reimportar, veja a prévia: ela conta o que será feito e lista as linhas recusadas com o motivo (por exemplo, caso que mudou depois que a planilha foi baixada ou NCM que não existe). Só então clique em Aplicar as decisões. Cada decisão fica no histórico com quem, quando e a marca do arquivo; reimportar o mesmo arquivo não decide de novo (POP-CON-14).",
    },
    {
      p: "O caso de NCM inexistente não traz proposta. Como corrijo o NCM?",
      r: "Abra o caso: o quadro Item mostra o código, a descrição, o grupo, o NCM, a unidade, o saldo e a última movimentação, e em Dados e proposta o NCM fica editável mesmo sem proposta. Digite o NCM certo e clique em Aprovar. Vale igual para a descrição e a unidade nos casos de um item de Nomes e unidades e de Qualidade (POP-CON-14).",
    },
    {
      p: "O que significa cada situação da tabela?",
      r: "Pendente: ainda não foi revisado. Sem problema: a camada foi analisada e não há o que ajustar. Proposto: existe uma proposta esperando a decisão do consultor. Aprovado: a decisão foi tomada e registrada. Aguardando informação: falta um dado do cliente. “Revisar” não é uma situação: é uma marca que pode aparecer em qualquer uma delas. Nos casos, as situações são Proposto, Rascunho, Aprovado, Rejeitado e Aguardando informação.",
    },
    {
      p: "Quando a IA entra no saneamento e quando não entra?",
      r: "A regra decide o que é claro (por exemplo, uma duplicidade exata). A IA entra só na borda, quando a regra não decide, e apenas se você clicar em Pedir parecer da IA num caso: ela devolve recomendação, confiança, argumentos a favor e contra, o que confirmar e as fontes, e rotula a “prática de mercado” como tal, nunca como norma. Ela não roda nos milhares de itens, nunca grava a decisão e, se estiver fora do ar, o caso segue sem parecer. Quem decide é o consultor.",
    },
    {
      p: "O que é a base antes e depois do Cadastro saneado?",
      r: "É a aba Cadastro saneado do Excel: todas as colunas que vieram do ERP, inclusive as que o saneamento não usa. Quando algum item teve a coluna alterada, ela aparece em par, “(como era)” e “(como ficou)”, e a célula alterada fica em verde claro; a coluna Camada que alterou diz qual análise mudou o item. O item inativado ou unificado continua na lista, com a Situação do item (“Inativado” ou “Unificado em outro código”) e o Código de destino. Assim o cliente confere, item a item, o que mudou no cadastro (POP-CON-16).",
    },
    {
      p: "O que muda na entrega da Fase 1?",
      r: "A entrega da Fase 1 é só o saneamento do cadastro. O Excel sai com 5 abas (sem Cenários tributários), sem a finalidade e sem as colunas da parte tributária, e sem os impactos de tratamento tributário, de bem do imobilizado e de reclassificação de NCM. O Resumo do Excel e o relatório em PDF dizem, numa linha, que a parte tributária é entregue em separado, na Fase 2. A versão liberada como Fase 1 tem o selo “Fase 1 · Saneamento”; no quadro Para revisão, marque “Só a Fase 1 (sem a parte tributária)” para conferir o mesmo recorte. Versões liberadas antes das fases saem completas, como antes (POP-CON-16).",
    },
    {
      p: "Como marco que um ajuste já foi feito no ERP?",
      r: "Na aba Unificações, na coluna Executado no ERP (logo depois da Ação no ERP), marque a caixa da linha. Só a linha aprovada tem a caixa; a proposta mostra um traço. Ficam registrados a data, a hora e quem marcou, e acima da tabela aparece “X de Y ações executadas no ERP”, contando a lista inteira. Desmarque se marcou por engano. O Excel das listas e o Excel da entrega trazem as colunas Executado no ERP, Executado em e Executado por (POP-CON-18).",
    },
    {
      p: "O que o Excel e o relatório em PDF trazem?",
      r: "O Excel tem 6 abas (5 na entrega da Fase 1, sem Cenários tributários): Resumo da entrega, Cadastro saneado (a base antes e depois, com a Finalidade), De para e equivalências (com a marca de executado no ERP), Cenários tributários (enquadramento legal, CST e cClassTrib), Impactos no SPED e Pendências e histórico. Preserva zeros à esquerda, filtros e identificadores. O relatório de fechamento em PDF traz o resumo, os itens recebidos e analisados, os ajustes por categoria, as revisões feitas, o comentário de cada aspecto tratado, as pendências e limitações, a versão liberada e o impacto nas obrigações.",
    },
    {
      p: "De onde vêm os registros do impacto no SPED e a regra de crédito de uso e consumo?",
      r: "Os registros e campos do checklist foram conferidos em 26/11/2026 nas fontes oficiais do portal gov.br/sped: Guia Prático da EFD ICMS/IPI 3.2.4 (Ato COTEPE/ICMS 86/2026; leiaute 020 em 2026 e 021 a partir de 01/01/2027, pela NT 2026.001 e Ato COTEPE/ICMS 69/2026), Guia Prático da EFD-Contribuições 1.35 com as NT 11/2026 e 13/2026 (o código de versão do leiaute de 2026 não foi confirmado) e NT 2025.002-RTC v1.53 da NF-e (grupo IBSCBS, com CST e cClassTrib). A troca de código vai no registro 0205 (o COD_ANT_ITEM do 0200 não é preenchido), a EFD ICMS/IPI não tem CST de IBS/CBS e, no ativo imobilizado, a movimentação do bem é o G125 e o G110 é a apuração do CIAP. A coluna Leiaute traz 020 nas linhas da EFD ICMS/IPI com competência em 2026 e 021 nas de 2027; nas demais obrigações e anos fica “não confirmado”, porque a versão vale por competência e ainda não foi conferida. Na EFD-Contribuições, a partir de 01/2027 não há apuração de novos fatos geradores de PIS/Cofins (NT 11/2026). A inativação pura (“Inativou código”) traz só o 0200 e o H010 (Guia Prático 3.2.4: no 0200 “somente devem ser apresentados itens referenciados nos demais blocos”; o H010 discrimina os itens existentes no estoque); o 0205, o 0221 e o C170 ficam na consolidação de código. Quando o ajuste muda o inventário (consolidação de código, unidade ou conversão), há um alerta, sem valores, no F150: estoque de abertura de 01/01/2027 para o crédito presumido de CBS do art. 381 da LC 214/2025, com o inventário de 31/12/2026 por item (H010) e a memória de cálculo a conferir (NT 13/2026, alterações previstas). No crédito, vale o art. 47 da LC 214/2025: o contribuinte do regime regular apropria o crédito quando extinto o débito da operação e comprovado por documento fiscal eletrônico idôneo; o valor é o imposto destacado e extinto ou o crédito presumido (caput, § 1º, II, e § 2º), exceto bens e serviços de uso ou consumo pessoal, cujo crédito é vedado (art. 57, § 5º; conceito no caput e exceções no § 3º, redação da LC 227/2026). Classe com redução de 100% (alíquota zero) sai “a verificar”, porque não há imposto destacado. Na venda, o débito segue o CST e o cClassTrib da linha. Na devolução, base e alíquota são as da operação original (art. 12, § 7º, e art. 17), e o efeito no crédito ou no débito segue o art. 47, § 12, I e II (incluído pela LC 227/2026), com procedimento a definir em regulamento (regulamento não confirmado nesta base).",
    },
    {
      p: "Quando o impacto no SPED é “escrituração já entregue”?",
      r: "Quando o início do ajuste (a data-base do projeto) cai na Última competência de escrituração já entregue, informada na aba Configuração, ou antes dela. Sem essa competência, o Excel e o relatório dizem “não avaliado (competência entregue não informada)”, e não “nenhuma linha”. A retificação e a transmissão continuam fora do serviço.",
    },
    {
      p: "Dá para voltar a base de trabalho a uma versão liberada e continuar dali?",
      r: "Sim. Na aba Versões, clique em Continuar a partir desta versão na linha da versão. A Prévia mostra quantos itens e campos voltam aos valores dela, quantos casos aprovados depois voltam a proposto e quais camadas ficam marcadas “revisar”. Com a Justificativa preenchida (ao menos 10 caracteres), clique em Restaurar e continuar. Nada é apagado: cada campo grava uma decisão no histórico do item; o caso aprovado depois cujo valor deixa de valer volta a proposto (com a célula e o impacto no SPED), e dá para aprovar de novo ou rejeitar; itens importados depois da versão ficam como estão. Para voltar atrás, use Desfazer restauração, embaixo do rótulo da versão: os valores e os casos aprovados voltam. Se outra pessoa alterar a base depois da prévia, a restauração é recusada e é preciso refazer a prévia.",
    },
    {
      p: "Como sei o que vai na versão liberada antes de liberar?",
      r: "A confirmação de Liberar versão mostra a conta: “Entram: N casos aprovados”, com o que eles fazem no cadastro (itens inativados, unificações, itens com finalidade, descrições padronizadas, unidades, NCMs, tratamento tributário), e “Ficam fora: N pendentes de decisão, N aguardando informação”. Só o aprovado entra na versão; o resto aparece no relatório como pendência (POP-CON-16).",
    },
    {
      p: "O que quer dizer o selo “desatualizada” na Cobertura das camadas?",
      r: "Que uma decisão de que a camada depende mudou depois da última análise completa dela. Hoje vale para o Tratamento tributário, que usa a Finalidade, o NCM e a Classificação NCM: aprovar, desfazer, reimportar ou restaurar esses campos depois de analisar o tributário marca a camada. Passe o mouse no selo para ver de onde veio a mudança e desde quando, e use o botão de analisar da camada (ou Analisar a fase). Na nova análise, os casos em Aguardando informação que o próprio sistema abriu (por exemplo, por falta de finalidade ou de NCM) e que deixaram de existir saem dos casos em aberto, da aba Pendências e do relatório; os que você pôs em Aguardando informação com Pedir informação… continuam. A Cobertura fica no alto de todas as abas, com um botão de analisar em cada camada (POP-CON-09). A análise roda no servidor e continua mesmo que você mude de tela ou feche o sistema.",
    },
    {
      p: "O que acontece na reimportação do cadastro?",
      r: "A prévia mostra o que mudou desde a última importação: itens Novos, Alterados, Inalterados e Ausentes do arquivo. Os novos entram sozinhos, os ausentes nunca são removidos e, nos alterados, você escolhe o que trazer. Campos que já têm decisão aparecem como “Protegido (decisão)” e não são sobrescritos. Decisões e rascunhos são preservados. Se o separador decimal da coluna de saldo mudou desde a última importação (por exemplo, de vírgula para ponto), o aviso “Separador decimal mudou” aparece junto do botão de confirmar, com quantos saldos mudam só por isso.",
    },
    {
      p: "Por que o caso aberto pela Visão geral avisa que tem itens de outros grupos?",
      r: "Casos de conjunto (por exemplo, a mesma conversão de unidade TON → KG, o mesmo NCM ou o mesmo tratamento tributário) juntam todos os itens do cadastro com a mesma situação, de qualquer grupo. Quando você abre o caso a partir de uma célula da Visão geral (um grupo numa camada), o detalhe mostra o aviso “Itens de outros grupos” com quantos são e de quais grupos, porque aprovar altera todos os itens do conjunto, não só os do grupo do recorte. Se algum item deve ficar diferente, registre uma exceção para ele antes de aprovar.",
    },
    {
      p: "Onde ficam os módulos opcionais (Conciliação de estoque, Blocos K e G do SPED, Arquivo para o ERP)?",
      r: "Ainda não estão disponíveis nesta versão do serviço, por isso não aparecem na Configuração. Quando existirem, aparecem lá para ligar.",
    },
    {
      p: "A prévia avisa “Saldos muito altos”. O que fazer?",
      r: "Alguns exports de ERP (do SAP Business One, por exemplo) exportam a quantidade sem a vírgula das casas decimais: 24 vira 24.000.000 e 9,07 vira 9.070.000. O aviso aparece quando todo saldo não zerado tem 1.000.000 ou mais (ou é múltiplo de 1.000, 10.000 ou 100.000) e mostra um exemplo. Confira com um item que você conhece e, se for o caso, marque Dividir os saldos por 1.000.000: a prévia é atualizada e a confirmação grava os saldos divididos. Nada é dividido sem a sua marcação, a escolha fica registrada na importação e as análises não dividem de novo. Na reimportação, o aviso lembra o divisor usado na vez anterior: use o mesmo, senão todos os saldos aparecem como alterados.",
    },
    {
      p: "Por que a importação sugere a coluna do código da unidade e não a do nome?",
      r: "O leiaute oficial aceita unidade de até 6 caracteres (registro 0190 do SPED e unidade comercial e tributável da NF-e). Quando o arquivo traz o código (“UN”, “KG”) e o nome (“UNIDADE”, “QUILOGRAMA”), vem o código; o nome entra como campo adicional. Com o nome, cada item virava um caso de limite de caracteres. A coluna Exemplos mostra 3 valores da coluna escolhida para você conferir; trocando a coluna, o selo de certeza some.",
    },
    {
      p: "O que o botão Analisar com IA faz e o que ele envia?",
      r: "Em qualquer projeto de serviço de consultoria, monta um rascunho de parecer no roteiro do serviço, com o contexto do projeto (serviço, período ou data-base, regime, setor, UF, porte, CNAE, situação dos documentos e achados) e os trechos da base legal do InTAX. Não envia nome, CNPJ, CPF, e-mail nem endereço do cliente e não muda o projeto: só o último rascunho fica guardado, e o consultor copia, revisa, confere as fontes e assume o texto. O rascunho rápido fica pronto em até um minuto.",
    },
    {
      p: "A IA sabe o que o ERP do cliente permite?",
      r: "Sim, pelo Cadastro de ERPs. O Analisar com IA e o parecer da IA do saneamento recebem o ERP do cliente com as restrições e as ações no ERP do perfil: as confirmadas como fato, citando o Cadastro de ERPs, e as não confirmadas como “a confirmar”. A IA é orientada a não recomendar o que contraria uma restrição confirmada. ERP sem perfil: valem só as regras gerais.",
    },
    {
      p: "O que muda no Excel da versão liberada em relação ao Excel para revisão?",
      r: "O da versão liberada é o que vai ao cliente: sem colunas vazias e sem identificador interno; Cenários tributários só com os itens de enquadramento concluído (os que ainda não têm aparecem no Resumo, contados por motivo, como “Finalidade não confirmada”) e a linha “Devolução” só quando o tratamento difere do da aquisição; Pendências e histórico com uma linha por tipo de pendência e grupo (quantos casos, quantos itens e exemplos de código) e só as alterações aprovadas; percentuais e milhares formatados. O Excel para revisão continua completo, para o trabalho interno: um caso por linha, todo o histórico e o identificador interno (POP-CON-16).",
    },
    {
      p: "Por que o relatório de fechamento abre com itens e não com casos?",
      r: "Porque o cliente lê o resultado: o relatório abre com o Resultado da entrega (itens a inativar, unificações, finalidade definida, descrições padronizadas, unidades e NCM ajustados, enquadramentos) e com as Pendências em itens, por tipo, com quantos grupos cada tipo atinge e quantos itens aguardam o cliente. As restrições do ERP vão no fim, num anexo, com a fonte como link curto (POP-CON-16).",
    },
    {
      p: "Como a política de estoques fica organizada e com que nome o arquivo baixa?",
      r: "1. Identificação; 2. Quadro de consulta por grupo (a regra que vale para cada grupo em cada aspecto, logo no começo); 3. Regras por aspecto, com a regra padrão inteira e as demais só com o que difere dela; 4. Procedimentos; 5. Controles internos (quem faz, quando, como e o que guardar como prova em cada controle: responsáveis, separação de funções, pedido e aprovação de item novo, consulta de duplicidade, alteração, bloqueio por falta de movimento, inativação, unificação, retirada de material, inventário, conferência periódica, indicadores e treinamento); 6. Seção fiscal (sem a Fase 2, uma linha avisa que a parte tributária vem com ela); 7. Versão e pendências; e o Anexo com as abreviações aprovadas e os termos que não podem ser usados, uma vez só para todas as regras de nomes. O arquivo baixa como politica-estoques_(cliente)_v(número).pdf; sem versão liberada, com “revisao” e a data de hoje (POP-CON-16 e POP-CON-19).",
    },
    {
      p: "Por que as datas e os nomes nos arquivos do saneamento mudaram?",
      r: "Excel, relatório e política usam uma regra só: data no fuso de São Paulo, em dd/mm/aaaa (com a hora quando é o momento de uma liberação ou decisão). Uma decisão às 23h50 sai com o dia em que foi feita. Quem decidiu, aprovou ou confirmou aparece pelo nome do cadastro de usuários; sem nome cadastrado, fica o e-mail. Os arquivos baixam com o nome do cliente e a versão (ou a data, na revisão) (POP-CON-16).",
    },
    {
      p: "Qual a diferença entre Analisar com IA e Aprofundar com pesquisa externa?",
      r: "Analisar com IA é o rascunho rápido: usa só o contexto do projeto e a base legal do InTAX, sem web, e leva até um minuto. Aprofundar com pesquisa externa também pesquisa na web (vigência, regulamentação, prazos) e leva até 3 minutos. Nos dois casos o pedido roda no servidor: você pode sair da página, e ao voltar o rascunho está em Último rascunho, com a data, o modo e o motor usados. Se passar do prazo, o pedido é encerrado e aparece Tentar de novo.",
    },
  ],
};
