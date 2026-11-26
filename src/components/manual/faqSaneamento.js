/**
 * FAQ do Saneamento de Estoques e Cadastro de Produtos (serviço da Consultoria Tributária) e do botão Analisar com IA.
 * Os textos de abas, botões e situações são os reais das telas. Passo a passo: POP-CON-09 a POP-CON-17.
 */
export const SECAO_SANEAMENTO = {
  titulo: "Saneamento de estoques e cadastro de produtos (consultoria)",
  nota: "O serviço de consultoria que limpa o cadastro de itens do cliente e prepara o tratamento tributário de IBS e CBS, com revisão por camada. Abre pelo projeto, em Consultoria Tributária > Projetos.",
  itens: [
    {
      p: "O que é a finalidade e o enquadramento legal de um item?",
      r: "A finalidade diz para que o cliente usa o item: Revenda, Matéria-prima, Insumo de produção, Embalagem, Uso e consumo, Manutenção, Imobilizado ou Material de terceiros. O enquadramento legal é o texto da lei e o artigo que sustentam o tratamento tributário (cClassTrib e CST) do item, e depende do NCM e da finalidade. Ambos saem na aba Cenários tributários do Excel. O sistema sugere, o consultor confirma: o texto da lei prevalece sobre qualquer sugestão.",
    },
    {
      p: "Por que preciso confirmar as atividades do cliente?",
      r: "Porque a finalidade e o tratamento tributário dependem do que o cliente realmente faz. As atividades vêm do CNAE principal e dos secundários do CNPJ; você mantém as que valem, exclui as outras e acrescenta as que faltam. Enquanto não clicar em Confirmo as atividades, a importação e as análises ficam bloqueadas. Reabrir para alterar bloqueia de novo e marca como “revisar” o que já tinha sido trabalhado, sem apagar nenhuma decisão.",
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
      r: "Porque aprovar essa decisão não muda nada: falta a informação do cliente. Use Pedir informação… (o caso passa a Aguardando informação) ou escolha outra decisão na proposta e então aprove. No lote, esses casos ficam de fora, com o motivo na prévia.",
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
      p: "O que o Excel e o relatório em PDF trazem?",
      r: "O Excel tem 6 abas: Resumo da entrega, Cadastro saneado (com a Finalidade), De para e equivalências, Cenários tributários (enquadramento legal, CST e cClassTrib), Impactos no SPED e Pendências e histórico. Preserva zeros à esquerda, filtros e identificadores. O relatório de fechamento em PDF traz o resumo, os itens recebidos e analisados, os ajustes por categoria, as revisões feitas, o comentário de cada aspecto tratado, as pendências e limitações, a versão liberada e o impacto nas obrigações.",
    },
    {
      p: "De onde vêm os registros do impacto no SPED e a regra de crédito de uso e consumo?",
      r: "Os registros e campos do checklist foram conferidos em 26/11/2026 nas fontes oficiais: Guia Prático da EFD ICMS/IPI 3.2.2 (leiaute 020, válido em 2026), Guia Prático da EFD-Contribuições 1.35 (o código de versão do leiaute de 2026 não foi confirmado) e NT 2025.002-RTC v1.53 da NF-e (grupo IBSCBS, com CST e cClassTrib). A troca de código vai no registro 0205 (o COD_ANT_ITEM do 0200 não é preenchido), a EFD ICMS/IPI não tem CST de IBS/CBS e, no ativo imobilizado, a movimentação do bem é o G125 e o G110 é a apuração do CIAP. A coluna Leiaute traz 020 nas linhas da EFD ICMS/IPI com competência em 2026; nas demais obrigações e anos fica “não confirmado”, porque a versão vale por competência e ainda não foi conferida. No crédito, vale o art. 47 da LC 214/2025: o contribuinte do regime regular apropria o crédito quando extinto o débito da operação e comprovado por documento fiscal eletrônico idôneo; o valor é o imposto destacado e extinto ou o crédito presumido (caput, § 1º, II, e § 2º), exceto bens e serviços de uso ou consumo pessoal, cujo crédito é vedado (art. 57, § 5º; conceito no caput e exceções no § 3º, redação da LC 227/2026). Classe com redução de 100% (alíquota zero) sai “a verificar”, porque não há imposto destacado. Na venda, o débito segue o CST e o cClassTrib da linha. Na devolução, base e alíquota são as da operação original (art. 12, § 7º, e art. 17), e o efeito no crédito ou no débito segue o art. 47, § 12, I e II (incluído pela LC 227/2026), com procedimento a definir em regulamento (regulamento não confirmado nesta base).",
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
      p: "O que acontece na reimportação do cadastro?",
      r: "A prévia mostra o que mudou desde a última importação: itens Novos, Alterados, Inalterados e Ausentes do arquivo. Os novos entram sozinhos, os ausentes nunca são removidos e, nos alterados, você escolhe o que trazer. Campos que já têm decisão aparecem como “Protegido (decisão)” e não são sobrescritos. Decisões e rascunhos são preservados.",
    },
    {
      p: "Por que os módulos opcionais aparecem desligados?",
      r: "Conciliação de estoque, Blocos K e G do SPED e Arquivo para o ERP ainda não estão disponíveis nesta versão do serviço, por isso trazem o selo “a desenvolver” e não podem ser ligados. O botão “i” de cada um explica o que é, que dados exige e o que muda quando existir.",
    },
    {
      p: "O que o botão Analisar com IA faz e o que ele envia?",
      r: "Em qualquer projeto de serviço de consultoria, monta um rascunho de parecer no roteiro do serviço, com o contexto do projeto (serviço, período ou data-base, regime, setor, UF, porte, CNAE, situação dos documentos e achados). Não envia nome, CNPJ, CPF, e-mail nem endereço do cliente e não grava nada: o consultor copia, revisa, confere as fontes e assume o texto. Pode levar um ou dois minutos.",
    },
  ],
};
