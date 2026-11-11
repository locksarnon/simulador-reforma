/**
 * FAQ do Repositório de XML, do certificado digital do cliente e da captura automática (atualização de 10/11/2026).
 *
 * Regra da casa (a mesma de faqAtualizacao.js): cada resposta que cita nota técnica, ajuste, lei ou número traz a fonte
 * em `f`, e só entra o que foi lido em fonte oficial. O que não foi confirmado aparece como "não confirmado".
 * Os textos de botões e campos são os reais das telas (src/components/repositorio-xml).
 */
export const SECAO_REPOSITORIO_XML = {
  titulo: "Repositório de XML, certificado do cliente e captura automática",
  nota: "Guarda os XML das notas fiscais de cada empresa, enviados em arquivo ou capturados na SEFAZ com o certificado digital A1 do cliente. Fica no menu BPO fiscal, em Repositório de XML: escolha a empresa e use as abas Documentos, Captura e Certificado.",
  itens: [
    {
      p: "O que é o Repositório de XML e onde fica?",
      r: "É o arquivo de XML de cada empresa, no menu BPO fiscal, em Repositório de XML (a lista traz as empresas de todos os grupos; escolha uma). A aba Documentos mostra os XML guardados, com busca, filtros, download e envio ao importador; a aba Captura configura a consulta automática à SEFAZ; a aba Certificado guarda o certificado A1 do cliente. Cada XML é identificado pela chave de acesso, então o mesmo documento nunca fica duplicado, venha ele de arquivo enviado (origem Importação) ou da SEFAZ (origem Captura). Guarda NF-e, CT-e, MDF-e, NFS-e Nacional e os eventos (cancelamento, carta de correção, manifestação).",
    },
    {
      p: "Como envio os XML de um cliente para o repositório?",
      r: "Na aba Documentos, arraste os arquivos .xml ou .zip para a área tracejada, ou clique em Escolher arquivos. Cada XML pode ter até 2 MB; um ZIP pode ter até 5.000 arquivos e 200 MB depois de descompactado. O InTAX lê cada documento, guarda o XML no armazenamento da empresa e informa o resultado: novos, completados (um resumo trocado pelo XML completo), já existiam e ignorados, cada um com o motivo. Um documento que não cita o CNPJ da empresa é recusado, e um evento de cancelamento marca a nota como Cancelada, mesmo que o cancelamento chegue antes da nota. O InTAX confere o tamanho real de cada arquivo dentro do ZIP (o tamanho que o ZIP declara não vale): arquivo acima de 2 MB é ignorado, com o motivo. A tela envia em partes de até 100 arquivos e 100 MB.",
    },
    {
      p: "Como levo os XML do repositório para a Importação XML?",
      r: "Na aba Documentos, marque os documentos e clique em Enviar N ao importador, ou clique em Enviar pendentes ao importador para mandar todos os XML completos que ainda não foram (até 1.000 por vez). O InTAX cria o lote no importador; depois abra a Importação XML, em Abrir Importação XML, para conferir e confirmar, como em qualquer lote. O importador lê NF-e, NFC-e e CT-e, com os eventos deles; a NFS-e e o MDF-e ficam só guardados no repositório (o importador os reconhece e ignora). Documento que está só com o resumo também não vai, porque falta o XML completo. A coluna Importador mostra Pendente, a data do envio ou um traço (o que não vai), e o filtro Só os que faltam enviar ao importador mostra o que resta.",
    },
    {
      p: "Posso baixar de volta os XML guardados?",
      r: "Sim. O ícone de download na linha baixa aquele XML, e o botão Baixar ZIP dos filtros reúne em um ZIP tudo o que o filtro atual mostra (até 5.000 documentos por vez; com mais do que isso, reduza o período). Só administradores excluem documentos do repositório, e a exclusão apaga também o arquivo do armazenamento.",
    },
    {
      p: "O que é o certificado A1 e como o InTAX o guarda?",
      r: "O certificado A1 é o arquivo (.pfx ou .p12) do certificado digital do próprio cliente. É com ele que o InTAX consulta a SEFAZ em nome do cliente. Só administradores enviam: o InTAX confere a senha e a validade e exige que o titular seja a empresa (o CNPJ-base do certificado tem de ser o do cadastro da empresa) e só então guarda a chave privada, cifrada com AES-256-GCM, com uma chave-mestra que fica fora do banco de dados. A senha do arquivo é usada só no envio e não é guardada. Cada uso do certificado fica registrado na auditoria do cofre, na própria aba. Se o servidor ainda não tem a chave-mestra configurada, a aba avisa e não aceita o envio. Remover o certificado do cofre apaga a chave guardada e desativa a captura da empresa.",
    },
    {
      p: "Serei avisado antes de o certificado vencer?",
      r: "Sim, por e-mail, se o envio de e-mail e o endereço interno de avisos estiverem configurados no servidor. Todo dia às 8h (horário de Brasília) o InTAX confere os certificados e avisa uma vez em cada marco: 30, 15, 7 e 1 dia antes e no dia do vencimento. A tela do certificado também mostra quantos dias faltam. Certificado vencido não é aceito: a captura da empresa não consegue abrir a chave até que o certificado renovado seja enviado.",
    },
    {
      p: "Como funciona a captura automática de NF-e e CT-e?",
      r: "Na aba Captura, depois de guardar o certificado e definir a UF do interessado, o administrador clica em Ativar captura (NF-e e CT-e são ativados separadamente). O InTAX consulta o serviço de Distribuição de DF-e da SEFAZ com o certificado do cliente, dentro do período da empresa (Noturno ou Diurno, veja a próxima pergunta), respeitando a espera de 1 hora que o serviço impõe quando não há documento novo: consultar antes disso gera o erro de consumo indevido e a SEFAZ bloqueia o CNPJ por 1 hora. Os XML recebidos entram no repositório com origem Captura. O botão Capturar agora faz uma consulta imediata, quando a SEFAZ permite; a tabela Últimas execuções mostra o resultado de cada rodada.",
      f: "NT 2014.002 v1.40 (Distribuição de DF-e da NF-e, Portal Nacional da NF-e); NT 2015.002 v1.05 (Distribuição de DF-e do CT-e, Portal do CT-e).",
    },
    {
      p: "Quando a captura automática roda? O que são os períodos Noturno e Diurno?",
      r: "Cada empresa tem um período da busca automática, escolhido na aba Captura (Período da busca automática): Noturno, das 18:00 às 05:59, que é o padrão, ou Diurno, das 06:00 às 17:59, sempre no horário de Brasília. O agendador do servidor confere as capturas de 10 em 10 minutos, mas só consulta a empresa dentro do período dela e respeitando a espera de 1 hora da SEFAZ. Numa noite isso dá várias passagens: a primeira traz as notas do dia e registra a Ciência (se a empresa a ativou), e a seguinte, mais de 1 hora depois, traz os XML completos que a Ciência liberou. Como a SEFAZ guarda as notas por 90 dias, buscar só à noite não perde nada. A tela mostra, em cada tipo de documento, a Próxima busca automática. Para buscar fora do período, o administrador usa o botão Capturar agora, que funciona a qualquer hora, desde que a espera da SEFAZ tenha passado. O agendador só roda no servidor de produção (CAPTURA_XML_AGENDADOR=on); nos demais ambientes a captura só acontece pelo botão.",
    },
    {
      p: "Que notas a captura traz, e quais ela não traz?",
      r: "Na NF-e e no CT-e, só o que o CNPJ do cliente recebe: na NF-e, as notas em que ele é destinatário; no CT-e, aquelas em que ele é remetente, destinatário, expedidor, recebedor ou tomador. As notas que o próprio cliente emitiu não vêm por esse serviço. Para elas, envie os XML pela aba Documentos ou peça que o ERP do cliente inclua o CNPJ da FAL no campo autXML (autorização de download) das notas: o terceiro indicado em autXML também recebe o documento pela Distribuição. Para MT, MS, GO, MA e PA, a aba Documentos traz o quadro Como baixar nas SEFAZ as notas que o cliente emitiu, com o caminho de cada portal.",
      f: "NT 2014.002 v1.40, quadro “Documentos x atores” (item 3); NT 2015.002 v1.05.",
    },
    {
      p: "Como funciona a captura da NFS-e Nacional (ADN)?",
      r: "A NFS-e Nacional tem canal próprio, o Ambiente de Dados Nacional (ADN), que distribui as notas por NSU, como a SEFAZ faz com a NF-e. O InTAX consulta o ADN com o certificado A1 do cliente, guarda o XML e espera pelo menos 1 hora quando não há documento novo. Ativa-se na aba Captura, na seção NFS-e Nacional, e não exige a UF do interessado. O ADN entrega as notas em que o CNPJ do cliente é prestador, tomador ou intermediário. Se ele entrega também as que o próprio cliente emitiu, a documentação não é conclusiva (o Manual Integrado diz que o emitente não recebe a própria nota; o Anexo IV prevê NSU também para o emitente): confirme no primeiro cliente. Só chegam as notas dos municípios que compartilham as suas NFS-e com o ambiente nacional; os que usam sistema próprio de emissão (Campo Grande, Sidrolândia, Rio Verde, Mineiros e Belém) precisam ser confirmados cliente a cliente, e o que não vier entra por envio de arquivos. Para CNPJ alfanumérico a captura da NFS-e não está liberada (o esquema vigente trata o CNPJ como 14 dígitos). A NFS-e cancelada é marcada pelo evento de cancelamento, em qualquer ordem de chegada. O importador de XML ainda não lê NFS-e: as notas ficam guardadas no repositório.",
      f: "Manual de Orientações aos Contribuintes do ISSQN para o Sistema Nacional NFS-e v1.1 (03/11/2026); Manual Integrado do Sistema Nacional NFS-e v1.00.02, item 17.2.2; Anexo IV v1.00; esquema XML v1.01 e Anexos I e II; planilha de municípios aderentes (gov.br/nfse), consultada em 10/11/2026. Não confirmado em fonte oficial: o parâmetro de lote e o formato JSON da resposta (só em código de clientes abertos), o endereço-base da chamada e os limites de consulta do ADN.",
    },
    {
      p: "Por quanto tempo a SEFAZ guarda as notas? E se a captura ficar parada?",
      r: "A SEFAZ mantém as notas disponíveis por 90 dias na Distribuição de DF-e (3 meses no CT-e). Para um CNPJ que nunca usou o serviço, a numeração (NSU) só começa no primeiro acesso: o histórico anterior não volta, e a primeira consulta devolve “nenhum documento”. Se a captura ficar desativada por mais de 60 dias, a SEFAZ interrompe a geração da numeração daquele CNPJ nesse intervalo e as notas desse período não voltam. O que ficou para trás entra por envio de arquivos (ZIP do portal da SEFAZ ou do ERP do cliente).",
      f: "NT 2014.002 v1.40, itens 3.4 a 3.7; NT 2015.002 v1.05.",
    },
    {
      p: "O que significa “Só resumo” e o que é a Ciência da Operação?",
      r: "Para a NF-e recebida, a SEFAZ entrega primeiro só o resumo (chave, emitente, valor). O XML completo só chega depois que o destinatário se manifesta, e isso é um ato do próprio cliente, assinado com o certificado dele. A Ciência da Operação é a manifestação mais leve: registra que o cliente tomou conhecimento da nota e libera o XML na consulta seguinte. Ela vem desligada, e só vale para o resumo que a própria captura trouxe da SEFAZ: um resumo enviado por arquivo nunca recebe Ciência. Com o botão Ativar Ciência automática (que pede a confirmação de que o cliente autorizou), o InTAX registra a Ciência, em nome do cliente, nas NF-e recebidas autorizadas há até 10 dias; as mais antigas ficam só com o resumo.",
      f: "Ajuste SINIEF 07/05, cláusulas 15-B e 15-C (com o Ajuste SINIEF 14/26); NT 2020.001 v1.60; NT 2014.002 v1.40, item 3.11.3.",
    },
    {
      p: "Quais são as consequências de registrar a Ciência?",
      r: "Registrada a Ciência, o cliente passa a ter o dever de registrar a manifestação conclusiva (Confirmação da Operação, Desconhecimento ou Operação não Realizada) em até 90 dias da autorização da nota; passados 90 dias sem registro, a operação é considerada confirmada. A Confirmação da Operação impede o emitente de cancelar a nota. O InTAX registra apenas a Ciência: a manifestação conclusiva continua sendo do cliente, pelo ERP dele ou pelo portal da NF-e. Por isso cada empresa decide se liga a Ciência automática.",
      f: "Ajuste SINIEF 07/05, cláusulas 15-B e 15-C (com o Ajuste SINIEF 14/26); NT 2020.001 v1.60.",
    },
    {
      p: "Posso ativar a captura se o ERP do cliente já consulta a SEFAZ?",
      r: "Não, sem antes combinar. Se o ERP do cliente, outro captador de XML ou outro sistema consulta a Distribuição de DF-e do mesmo CNPJ, ele e o InTAX se atrapalham: a SEFAZ bloqueia as consultas dos dois por 1 hora e a numeração (NSU) de cada um se perde. Por isso, ao ativar a captura, o administrador confirma que nenhum outro sistema consulta aquele CNPJ. Pela mesma razão, a consulta automática só roda no servidor de produção, nunca em ambientes de teste.",
      f: "NT 2014.002 v1.40, itens 3.4 a 3.7 (consumo indevido, código 656; várias aplicações consultando o mesmo CNPJ).",
    },
    {
      p: "Por que a captura parou ou foi desativada sozinha?",
      r: "Há três situações. (1) A SEFAZ bloqueou por consumo indevido (656 na NF-e e no CT-e): o InTAX espera 1 hora e retoma sozinho. (2) A SEFAZ recusou o certificado ou o CNPJ (por exemplo, certificado vencido, revogado ou de outra raiz de CNPJ): a captura é desativada e só volta quando alguém corrigir o certificado e ativar de novo. (3) O NSU guardado ficou à frente do Ambiente Nacional (589), por troca de ambiente ou base restaurada: o InTAX recomeça a numeração do zero na consulta seguinte. A aba Captura mostra o último retorno da SEFAZ e a mensagem correspondente. Trocar o Ambiente da SEFAZ entre Produção e Homologação zera o NSU e desativa a captura, porque cada ambiente tem a sua numeração.",
      f: "NT 2014.002 v1.40, item 4 e itens 3.8 a 3.10 (mensagens 280, 281, 283 a 286, 472, 473, 589, 593 e 656).",
    },
    {
      p: "Como obtenho as notas que o cliente emitiu em MT, MS, GO, MA e PA?",
      r: "A Distribuição de DF-e é nacional e funciona do mesmo jeito em qualquer estado; o que muda por estado é o caminho para as notas emitidas pelo cliente, que ela não entrega. MT: Sefaz Digital, Consulta de NF-e Emitida/Recebida (login de contribuinte ou de contabilista; exporta planilha; o XML em lote sai por formulário no e-Process). MS: e-Fazenda, Download de NF-e/CT-e/MDF-e, e autorização de acesso de contador (cadastro com e-CNPJ). GO: o site da Economia baixa só as notas emitidas, com o certificado da empresa; entradas e saídas, pelo Portal de Acesso Restrito, com o login do contabilista. MA: Plataforma SEFAZ-MA, lote mensal de NF-e, NFC-e, CT-e e MDF-e (o arquivo fica disponível por poucos dias). PA: Portal de Serviços da Sefa, Download de Arquivos, com certificado ou usuário e senha. Conferido nas páginas das SEFAZ em 10/11/2026; os portais mudam, confirme no portal. Não localizamos web service estadual de download para contador: o InTAX não acessa esses portais sozinho, e o XML baixado entra por envio de arquivos.",
      f: "Páginas oficiais das SEFAZ de MT (Consulta de NF-e), MS (e-Fazenda), GO (Secretaria da Economia, “novo sistema de download de arquivos de NF-e, NFC-e e CT-e”), MA (Plataforma SEFAZ-MA) e PA (Portal de Serviços da Sefa), consultadas em 10/11/2026.",
    },
    {
      p: "Como fica a nota do produtor rural pessoa física?",
      r: "A NF-e emitida por produtor rural pessoa física (emitente com CPF) chega ao comprador pela Distribuição de DF-e como qualquer outra: primeiro o resumo e, com a Ciência da Operação, o XML completo. O InTAX lê o emitente no próprio XML (CPF ou CNPJ). A nota de produtor em talão (papel) não tem XML e, por isso, não entra no repositório. A NF-e de entrada, emitida pelo próprio comprador em nome do produtor, é emissão própria dele: não vem da Distribuição e entra por envio de arquivos. A NFA-e, emitida no site do Fisco, deve chegar pela Distribuição como NF-e modelo 55, mas esse ponto não foi confirmado com uma chave real; valide com o primeiro cliente.",
      f: "Ajuste SINIEF 27/2024 (NF-e e NFC-e no lugar do talão do produtor); NT 2018.001 (NF-e do produtor rural pessoa física); NT 2014.002 v1.40, item 3.",
    },
    {
      p: "O InTAX calcula FETHAB, FUNDEINFRA, FUNDERSUL e os demais fundos estaduais?",
      r: "Não. Esses fundos (FETHAB em MT, FUNDEINFRA em GO, FUNDERSUL e FUNDEMS em MS, CEG no MA) não têm campo próprio no XML da nota e são recolhidos por guia do próprio estado, de modo que o repositório não os apura. O InTAX não os calcula; o que o repositório entrega é a base de notas (quantidades, valores, NCM e CFOP) para quem for apurá-los. Se esses fundos passarem a ser tratados no InTAX, será por importação da guia (DARE) ou da EFD, sem cálculo próprio.",
      f: "Levantamento nas páginas oficiais das SEFAZ de MT, GO, MS e MA em 10/11/2026 (nenhum tributo estadual desses fundos consta no leiaute da NF-e).",
    },
    {
      p: "O que acontece com os XML e o certificado se eu excluir a empresa?",
      r: "Os XML do repositório, os arquivos guardados, as configurações de captura e o certificado (com a chave cifrada) são apagados junto com a empresa, e por isso uma empresa que guarda certificado, XML ou captura só pode ser excluída por administrador (a mesma regra vale para a Limpeza de dados). A trilha de auditoria do cofre permanece, com o registro de quem excluiu a empresa. Antes de excluir, baixe o ZIP dos XML se precisar deles.",
    },
  ],
};
