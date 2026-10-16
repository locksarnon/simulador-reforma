# Base de conhecimento de ERPs e add-ons

## Base inicial

O catálogo versionado está em src/lib/conhecimentoSistemas.js. Cada orientação informa ID estável, ERP/add-on, linha, fonte, versão documental, data de conferência e limite de aplicação. As fontes iniciais são a documentação da integração Protheus/PIMS Multicultivos, a documentação de operações por insumo no PIMS CS e o histórico da API FARMBOX.

O cadastro da empresa possui ERP em lista (incluindo Protheus e Siagri), versão do ERP e seleção múltipla de PIMS/FARMBOX. A linha e a versão dos add-ons podem ser registradas. Textos de ERP legados continuam disponíveis sem conversão silenciosa. A seleção não abre conexão de dados.

As referências aparecem dentro da empresa e no envio de planilhas do validador. Os sistemas escolhidos são registrados nas opções das novas validações; os resultados e as evidências particulares permanecem no histórico da empresa.

## Conhecimento não é aprendizado automático

As seis orientações iniciais são documentais e dependem de confirmação na instalação. Não ativam correções, exclusões ou equivalências de produtos. Documentos de PIMS Multicultivos não são apresentados como regras de PIMS CS quando a linha está definida. Quando a linha não foi informada, as referências exibem seu escopo para conferência.

Uma descoberta deve seguir: evidência do cadastro → hipótese → revisão técnica → teste de regressão → promoção de uma regra aplicável à combinação de versões. A base global deve receber somente a regra generalizada, sem dados identificáveis da empresa, credenciais ou cópia do banco. O processo de promoção ainda é feito em código/revisão; não há treinamento de modelo nem aprovação automática pelo usuário final.

## Primeiro caso proposto: Protheus + PIMS

Criar a empresa de análise e identificar versões, linha PIMS e mecanismo de integração. Conferir códigos de integração, unidades, grupos e relacionamentos com apontamentos antes de sugerir desduplicação. Grupos de estoque não são automaticamente grupos contábeis. Princípio ativo exige composição/concentração/formulação para comparação adequada.

## Conexão de dados: etapa seguinte

O conector de banco do Protheus ainda não está implementado. O usuário informou SQL; Microsoft SQL Server é hipótese a confirmar, não um driver já configurado.

Antes da conexão, levantar: mecanismo e versão do banco, empresa/filiais de escopo, linha/versão do PIMS, onde os bancos estão hospedados e acesso por rede privada, VPN/túnel ou coletor local. Usar uma identidade dedicada de leitura, preferencialmente em views aprovadas pela equipe do cliente. Credenciais devem ficar no servidor/cofre de segredos, nunca em documentos de conhecimento ou no frontend. Não abrir o banco publicamente para esta integração.

A primeira coleta deverá ser um snapshot identificável e reproduzível (origem, escopo, instante e versão do mapeamento), sem escrever no ERP ou PIMS. O formato de exportação existente permite iniciar a análise por planilha enquanto o conector é desenvolvido.

## Verificação e publicação

Aplicar a migração 20261016010000_empresa_sistemas_conhecimento. Não preencher automaticamente o PIMS em empresas existentes. Confirmar o cadastro da empresa e as referências filtradas por linha após o deploy.
