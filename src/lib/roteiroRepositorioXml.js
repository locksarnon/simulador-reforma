/**
 * Roteiro de testes do Repositório de XML, do certificado do cliente e da captura automática (10/11/2026).
 * Entra no ROTEIRO de roteiroTestes.js logo depois da Importação de XML. Os textos de botões e campos são os reais das telas
 * (src/components/repositorio-xml). Onde há "esperado" numérico ele foi conferido no ambiente local de testes.
 */
const p = (f, e) => ({ f, e });

export const ROTEIRO_REPOSITORIO_XML = [
  {
    id: "repositorio-xml", grupo: "BPO fiscal", titulo: "Repositório de XML: envio, filtros, download e importador", rota: "/bpo/repositorio-xml",
    objetivo: "Guardar os XML de uma empresa por arquivo ou ZIP, conferir que não duplicam, achar o que precisa, baixar e mandar ao importador.",
    preparo: [
      "Empresa de teste cadastrada com CNPJ, dentro de um grupo \"TESTE-\".",
      "Dois XML de NF-e autorizadas em que o CNPJ da empresa aparece (como emitente ou destinatário), o XML de cancelamento (evento 110111) de uma delas e um ZIP com alguns XML da mesma empresa. Use dados de teste ou anonimizados.",
      "Um XML de outra empresa (CNPJ diferente), para o teste de recusa.",
      "Um XML de NFS-e Nacional em que a empresa é prestadora ou tomadora (opcional, para ver como a NFS-e fica guardada).",
    ],
    passos: [
      p("No menu lateral, em BPO fiscal, clique em \"Repositório de XML\" e, na lista, abra a empresa de teste.", "Abre a empresa com as abas Documentos, Captura e Certificado e autorização e cinco cartões: Documentos no repositório, Enviados por arquivo, Captura automática, Só o resumo (sem XML) e Aguardando o importador."),
      p("Na aba Documentos, arraste os 2 XML de NF-e para a área tracejada.", "Aviso \"Envio concluído\" com \"2 novo(s)\". As notas aparecem na tabela com origem Importação, situação Autorizada e, na coluna Importador, \"Pendente\"."),
      p("Envie os mesmos 2 arquivos de novo.", "Aviso com \"2 já existiam\"; a lista e o total não mudam (o documento é identificado pela chave de acesso)."),
      p("Envie o XML de cancelamento de uma das notas.", "A nota passa a Cancelada (etiqueta vermelha). O mesmo vale se o cancelamento for enviado antes da nota."),
      p("Envie o XML de outra empresa.", "Aviso com \"1 ignorado(s)\" e o motivo (não cita o CNPJ da empresa). Ele não entra na lista."),
      p("Envie o ZIP.", "Todos os XML do ZIP entram de uma vez, contados em \"novo(s)\"."),
      p("Se tiver o XML da NFS-e Nacional, envie-o.", "Entra como \"NFS-e\" na coluna Tipo. Na coluna Importador aparece um traço (o importador de XML ainda não lê NFS-e) e ela não entra na contagem de \"Aguardando o importador\" nem no filtro \"Só os que faltam enviar ao importador\"."),
      p("Use os filtros Tipo, Origem, Conteúdo, Emissão de e até, e o campo \"Buscar (chave, número, emitente)\".", "A lista e o contador (\"N documento(s)\") mudam a cada filtro. A busca espera um instante depois que você para de digitar."),
      p("Clique no ícone de download de uma linha.", "Baixa o XML com a chave de acesso no nome do arquivo."),
      p("Clique em \"Baixar ZIP dos filtros\".", "Baixa um ZIP com os XML do filtro atual; dentro dele há um arquivo por documento."),
      p("Marque duas notas e clique em \"Enviar 2 ao importador\"; confirme em \"Enviar\".", "Aviso \"Enviado ao importador\" com \"2 arquivo(s) no lote\". A coluna Importador passa a \"Enviado\" com a data."),
      p("Clique em \"Abrir Importação XML\".", "O lote aparece para conferir e confirmar, como em qualquer importação (siga o teste de Importação de XML)."),
      p("Abra \"Como baixar nas SEFAZ as notas que o cliente emitiu (MT, MS, GO, MA e PA)\".", "Cinco estados, cada um com a orientação do portal; MT, MS e GO têm o link \"Página oficial\". O texto avisa que os portais mudam."),
      p("Entre como consultor (usuário comum) e abra a mesma aba.", "Vê, filtra e baixa; não vê o botão de excluir."),
      p("Como administrador, marque um documento e clique em \"Excluir 1\"; confirme.", "A linha some e o contador diminui."),
    ],
    cuidados: [
      "O repositório guarda os arquivos do cliente: use só XML de teste ou anonimizados.",
      "Documento marcado \"Só resumo\" não vai ao importador, porque falta o XML completo.",
      "Excluir apaga também o arquivo guardado; o que veio da captura não volta sozinho.",
      "Excluir a empresa apaga o repositório inteiro, o certificado e a configuração da captura dela.",
    ],
    criterio: "Envio por arquivo e por ZIP funciona sem duplicar; o cancelamento marca a nota; XML de outro CNPJ é recusado; filtros, download e ZIP funcionam; o envio ao importador cria o lote e marca os documentos; só o administrador exclui.",
  },
  {
    id: "certificado-cliente", grupo: "BPO fiscal", titulo: "Certificado digital A1 do cliente e termo de autorização", rota: "/bpo/repositorio-xml",
    objetivo: "Guardar o certificado do cliente no cofre com a autorização dele registrada, e conferir que a senha não é guardada e que tudo fica na auditoria.",
    preparo: [
      "Entrar como administrador (o consultor comum vê, mas não envia nem remove).",
      "Um certificado A1 de TESTE (.pfx) com a senha, cujo CNPJ-base seja o da empresa de teste; peça à equipe de desenvolvimento um arquivo de teste gerado só para isso. Não use o certificado real de um cliente neste roteiro.",
      "O servidor de teste precisa ter a chave-mestra do cofre (CERT_VAULT_KEY) configurada.",
    ],
    passos: [
      p("Em \"Repositório de XML\" (menu BPO fiscal), abra a empresa e depois a aba \"Certificado e autorização\".", "Três blocos: Certificado digital A1 do cliente (\"Nenhum certificado guardado\"), Termo de autorização do cliente e Auditoria do cofre."),
      p("Se aparecer o aviso \"O cofre de certificados ainda não está configurado neste servidor\", pare.", "Sem a chave-mestra o botão de envio não aparece. Peça a quem administra o servidor que configure a chave e repita."),
      p("Clique em \"Enviar certificado A1\", escolha o .pfx, digite uma senha ERRADA e clique em \"Guardar no cofre\".", "Erro claro (senha incorreta), o campo de senha é limpo e nada é guardado."),
      p("Repita com a senha correta.", "Aviso \"Certificado guardado no cofre\", com o titular e a validade, e a frase \"A senha do arquivo não foi guardada\". O bloco mostra titular, CNPJ/CPF do titular, Emitido por, Válido de... até, Vence em (dias) e Enviado por."),
      p("Tente enviar um certificado de uma empresa de outra raiz de CNPJ.", "Recusado: o titular precisa ser a empresa."),
      p("Em \"Termo de autorização do cliente\", escreva uma referência (por exemplo, \"Termo assinado em 05/11/2026, pasta do cliente\") e clique em \"Registrar termo\".", "Aparece \"Registrado por\" com o seu nome e a data, a referência e o botão \"Revogar termo\"."),
      p("Veja a \"Auditoria do cofre (últimos 20 registros)\".", "Linhas \"Envio do certificado\" e \"Termo registrado\", com data, usuário e detalhe. Nenhuma linha mostra a senha."),
      p("Clique em \"Substituir certificado\" e envie outro certificado válido.", "O novo fica ativo; a auditoria registra o envio."),
      p("Clique em \"Remover do cofre\" e confirme.", "A chave é apagada, a captura da empresa é desativada e a auditoria registra \"Remoção do certificado\"."),
      p("Clique em \"Revogar termo\" e confirme.", "O termo some; a captura e a Ciência da Operação da empresa ficam desativadas."),
      p("Entre como consultor e abra a aba.", "Vê o certificado e o termo, mas sem os botões de enviar, remover e revogar, e sem a auditoria."),
      p("Ainda como consultor, tente excluir a empresa (em Grupos e empresas, abra o grupo e a empresa; botão \"Excluir empresa\") enquanto o certificado está guardado.", "Recusado: apenas administradores excluem empresa que guarda certificado, XML ou captura. Como administrador, a exclusão funciona e leva junto o certificado, os XML e a configuração; a auditoria registra quem excluiu."),
    ],
    cuidados: [
      "O arquivo e a senha do certificado do cliente são sigilosos: use só certificados de teste.",
      "A senha só é usada no envio e nunca é gravada; se ela aparecer em algum lugar, anote e avise a equipe.",
      "Se o e-mail do servidor estiver configurado, o aviso de vencimento chega às 8h (horário de Brasília), uma vez em cada marco: 30, 15, 7 e 1 dia antes e no dia do vencimento.",
    ],
    criterio: "O certificado só entra com a senha certa, a validade em dia e o titular da empresa; a senha não aparece em lugar nenhum; sem o termo o certificado não é usado; toda ação aparece na auditoria; só administradores alteram.",
  },
  {
    id: "captura-xml", grupo: "BPO fiscal", titulo: "Captura automática de XML (NF-e, CT-e e NFS-e Nacional)", rota: "/bpo/repositorio-xml",
    objetivo: "Ativar a consulta automática à Distribuição de DF-e da SEFAZ e ao ADN da NFS-e, conferir que ela respeita a espera dos serviços e entender a Ciência da Operação.",
    preparo: [
      "Certificado e termo registrados (teste anterior) e uma UF do interessado (a da empresa ou a escolhida na tela).",
      "ATENÇÃO: faça este teste em Homologação ou com o cliente-piloto combinado, e só com o ERP dele fora da Distribuição de DF-e do mesmo CNPJ. Dois sistemas no mesmo CNPJ bloqueiam um ao outro por 1 hora.",
      "No servidor de teste o agendador fica desligado: a captura só roda pelo botão \"Capturar agora\". Em produção a rotina automática só consulta a empresa dentro do período dela (Noturno por padrão); o botão funciona a qualquer hora.",
    ],
    passos: [
      p("Em \"Repositório de XML\" (menu BPO fiscal), abra a empresa e a aba \"Captura\".", "Se o agendador estiver desligado, aparece uma faixa amarela explicando. O bloco \"Antes de ativar\" lista três requisitos: certificado, termo e UF do interessado."),
      p("Sem certificado ou sem termo, olhe o botão \"Ativar captura\".", "Desabilitado, com a dica \"Cumpra os requisitos acima\"."),
      p("Em \"UF do interessado\", escolha Mato Grosso (51).", "A lista traz \"Estados atendidos\" (MT, MS, GO, MA e PA) no topo e os demais depois. Aviso \"Ambiente atualizado\"."),
      p("Em \"Período da busca automática\", escolha Diurno e depois volte para Noturno.", "Cada troca mostra o aviso \"Período da busca automática atualizado\". Noturno é das 18:00 às 05:59 e Diurno das 06:00 às 17:59, horário de Brasília; a auditoria registra \"Período da busca alterado\". Em cada tipo ativo aparece \"Próxima busca automática\" (um traço quando o agendador está desligado no servidor)."),
      p("Troque o \"Ambiente da SEFAZ\" para Homologação (teste) e confirme.", "A confirmação avisa que trocar zera a numeração (NSU) e desativa a captura."),
      p("Com os requisitos cumpridos, clique em \"Ativar captura\" na seção da NF-e.", "Abre a janela \"Ativar a captura de NF-e?\", com o alerta sobre outro sistema consultando o mesmo CNPJ. O botão fica desabilitado até marcar a confirmação."),
      p("Marque a confirmação e clique em \"Ativar captura\".", "Aviso \"Captura ativada\". A seção mostra \"Captura ativa\", o Último NSU recebido, a Última consulta, a Próxima consulta permitida e o Retorno da SEFAZ."),
      p("Clique em \"Capturar agora\".", "Aviso \"Captura executada\" com o resultado (por exemplo, \"Nenhum documento novo\" ou \"N documento(s) recebido(s)\"). Uma linha nova em \"Últimas execuções\", com origem Manual e o seu nome."),
      p("Clique em \"Capturar agora\" de novo, logo depois.", "O botão fica desabilitado até o horário que a SEFAZ libera (cerca de 1 hora depois de \"nenhum documento\"); a dica mostra o horário. Isso evita o bloqueio por consumo indevido."),
      p("Se houve documentos, abra a aba Documentos e filtre Origem = Captura.", "As notas entram com origem Captura. As NF-e recebidas aparecem como \"Só resumo\" até a Ciência da Operação."),
      p("Numa empresa sem UF no cadastro e sem UF escolhida, compare os botões \"Ativar captura\" das três seções.", "NF-e e CT-e ficam desabilitados; a NFS-e Nacional fica habilitada, porque o ADN não usa a UF do interessado."),
      p("Na seção \"NFS-e Nacional (notas de serviço em que o cliente é prestador, tomador ou intermediário)\", clique em \"Ativar captura\", marque a confirmação e ative.", "A janela fala do ADN (não da SEFAZ). Depois de ativar, a seção mostra \"Captura ativa\" e o rótulo \"Retorno do ADN\"."),
      p("Clique em \"Capturar agora\" na seção da NFS-e.", "Aviso \"Captura executada\" com o resultado. Se o município do cliente não compartilha as notas com o ambiente nacional, o retorno é \"nenhum documento\": anote o município e confirme com o cliente."),
      p("Na seção \"Ciência da Operação (libera o XML completo das compras)\", clique em \"Ativar Ciência automática\".", "Abre a janela com as consequências: dever de manifestação conclusiva em até 90 dias, confirmação tácita depois disso e a Confirmação impedindo o cancelamento. O botão só habilita depois de marcar a confirmação."),
      p("Marque a confirmação e ative.", "Aviso \"Ciência da Operação automática ativada\". Aparecem os contadores Resumos aguardando, Ciência registrada e Fora do prazo ou não aplicável."),
      p("Clique em \"Desativar\" na seção da NF-e e confirme.", "A confirmação lembra do limite de 60 dias; depois aparece \"Captura desativada\"."),
    ],
    cuidados: [
      "Nunca ative a captura de um CNPJ que o ERP do cliente já consulta sem combinar antes: a SEFAZ bloqueia os dois por 1 hora e a numeração de cada um se perde.",
      "Em produção, só o servidor de produção tem o agendador ligado, para dois sistemas não consultarem o mesmo CNPJ.",
      "A Ciência da Operação é um ato do cliente, assinado com o certificado dele: ligue só com autorização expressa.",
      "A homologação costuma responder \"nenhum documento\"; validar a captura completa exige o cliente-piloto com notas reais.",
      "A captura de NF-e e CT-e não traz as notas que o próprio cliente emitiu: elas entram por arquivo (veja o quadro dos estados na aba Documentos).",
      "A NFS-e só chega dos municípios que compartilham as notas com o ADN, e se o ADN entrega também as emitidas pelo cliente não está confirmado: no primeiro cliente de cada município, confira se as notas chegam.",
      "Aviso \"Ignorado(s)\" na mensagem de uma execução quer dizer que o repositório não reconheceu um documento recebido: anote a mensagem e avise a equipe de desenvolvimento.",
    ],
    criterio: "Os requisitos barram a ativação; a janela de confirmação aparece; a captura executa e registra o resultado; a espera da SEFAZ é respeitada; a Ciência exige confirmação expressa; desativar funciona.",
  },
];
