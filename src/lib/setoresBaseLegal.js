export const SETORES_BASE_LEGAL = [
 { id: 'agro', nome: 'Agronegócio', termos: ['rural','agro','agric','pecuar','insumo','cooperativ'], busca: 'produtor rural', perguntas: ['Quais regras se aplicam ao produtor rural?', 'Como consultar os créditos sobre insumos agropecuários?'] },
 { id: 'comercio', nome: 'Comércio e indústria', termos: ['comercio','industr','bens','credito','estoque'], busca: 'crédito bens', perguntas: ['Quando os créditos sobre compras podem ser apropriados?'] },
 { id: 'servicos', nome: 'Serviços', termos: ['servic','profiss','local de incidencia'], busca: 'serviços', perguntas: ['Como identificar o local de incidência em serviços?'] },
 { id: 'saude', nome: 'Saúde', termos: ['saude','medic','hospital','dispositivo'], busca: 'saúde', perguntas: ['Onde consultar o tratamento dos serviços de saúde?'] },
 { id: 'educacao', nome: 'Educação', termos: ['educa','ensino'], busca: 'educação', perguntas: ['Quais dispositivos tratam dos serviços de educação?'] },
 { id: 'imoveis', nome: 'Imóveis e construção', termos: ['imov','constr','locacao'], busca: 'bens imóveis', perguntas: ['Quais dispositivos tratam das operações com imóveis?'] },
 { id: 'transporte', nome: 'Transportes', termos: ['transport','passageir','carga'], busca: 'transporte', perguntas: ['Quais dispositivos tratam de transporte de cargas?'] },
 { id: 'financeiro', nome: 'Serviços financeiros', termos: ['financ','segur','credito'], busca: 'serviços financeiros', perguntas: ['Onde consultar o regime dos serviços financeiros?'] },
 { id: 'turismo', nome: 'Turismo e alimentação', termos: ['hotel','turis','restaur','bar','aliment'], busca: 'hotelaria', perguntas: ['Quais dispositivos tratam de hotelaria e restaurantes?'] },
];
export const textoSetor = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const afinidadeSetor = (c, setor) => !setor || setor.termos.some(t => textoSetor([c.tema,c.pergunta,c.sinonimos,c.resposta].join(' ')).includes(t));
