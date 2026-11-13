# Serviços e análises por empresa

O fluxo principal é Grupos e empresas → Grupo → Empresa → Serviços e análises. A consulta NCM permanece global e pode ser aberta pelo validador. A calculadora avulsa foi retirada da navegação; o endereço antigo redireciona para a calculadora pública.

A empresa reúne diagnóstico (XML, operações e painel), validação cadastral, classificação e conversão de serviços e validação de NFS-e. O cadastro valida e salva automaticamente arquivo, opções e snapshot do resultado; os outros dois serviços oferecem Salvar análise na empresa. O histórico usa o ID interno da empresa, não o seu código de negócio.

## Validador

NCM sempre obrigatório. cClassTrib opcional. Corte inclusivo por data, com mapeamento da coluna e rejeição de datas ausentes/inválidas. As duplicidades exigem descrição e unidade; princípio ativo é um critério adicional opcional (o arquivo deve incluir concentração/formulação). Descrições aproximadas usam similaridade de termos, mesma unidade e números iguais. A busca de candidatos é limitada para suportar planilhas grandes, portanto não garante detectar todas as variações.

Nada é excluído do ERP. As linhas indicadas podem ser selecionadas para exclusão somente de uma cópia saneada, com relatório e registro das decisões em abas separadas. Esta seleção de exportação não é gravada no histórico; para reproduzi-la, reenvie o arquivo e revise as linhas.

Seleção de ERP registra contexto, sem prometer homologação específica. Grupos contábeis atuais são preservados; sugestões dependem do plano de contas e regras fornecidos pela empresa. Não há inferência contábil automática.

Validações anteriores ficam preservadas com empresa_id nulo; não são associadas automaticamente a uma empresa. A API legada sem filtro continua listando esses registros.

## Base Legal

Normas e perguntas revisadas em tabelas, preservando as cores. Os botões de setor priorizam respostas revisadas por palavras-chave e alteram as perguntas sugeridas. Não acrescentam provedor de IA; a função existente de perguntas ao assistente permanece independente.

## Implantação

1. Compilar e testar frontend/backend.
2. Aplicar a migração Prisma junto com o backend (o entrypoint padrão já roda migrate deploy).
3. Tabela oficial (Anexo VIII da NFS-e): o backend confere a página oficial (gov.br/nfse, documentação técnica RTC) ao subir e toda segunda às 05:20, baixa a versão mais nova, confere o layout e troca a tabela numa transação; versão e data ficam em ParametroSistema `anexo_viii_versao`. O administrador força a atualização no Classificador ("Atualizar pela fonte oficial"). Layout não reconhecido não altera nada e o erro aparece na tela. Não modifica as análises salvas.
4. Seguir docs/deploy/UPDATE.md, incluindo recriação do frontend e smoke test autenticado.

Fonte oficial conferida: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx/view
Auditoria local em 16/10/2026: 1.502 registros únicos; nenhum cIndOp/cClassTrib vazio após resolução de células mescladas. Isso não confirma qual versão estava instalada em produção.
