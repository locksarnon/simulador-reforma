/**
 * Mapa de setores e ramos da Reforma Tributária — nomes e artigos da própria
 * LC 214/2025 (texto do Planalto, conferido). É a fonte única para: cadastro
 * de empresas (ramo), perfis da calculadora pública e checklist de cobertura.
 *
 * cobertura:
 *   "coberto"  — tem perfil na calculadora e/ou base de NCM no validador
 *   "parcial"  — tratado de forma simplificada (premissa a validar)
 *   "pendente" — ainda não modelado no InTAX
 */
export const COBERTURA = {
  coberto: { rotulo: "Coberto", cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  parcial: { rotulo: "Parcial", cor: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  pendente: { rotulo: "Pendente", cor: "bg-muted text-muted-foreground" },
};

const i = (nome, baseLegal, tratamento, cobertura, obs = "") => ({ nome, baseLegal, tratamento, cobertura, obs });

export const SETORES_REFORMA = [
  {
    grupo: "Regime regular",
    fonte: "LC 214/2025, Livro I, Título I",
    itens: [
      i("Operações com bens e serviços em geral", "Livro I, Título I, Cap. II", "Alíquota de referência com crédito amplo (não cumulatividade)", "coberto", "Motor do simulador e perfil \"Comércio em regime regular\" da calculadora."),
    ],
  },
  {
    grupo: "Regimes diferenciados — redução de 30%",
    fonte: "LC 214/2025, Livro I, Título IV, Cap. II",
    itens: [
      i("Serviços de profissões intelectuais regulamentadas", "Art. 127", "Redução de 30% (18 profissões: administradores, advogados, arquitetos e urbanistas, assistentes sociais, bibliotecários, biólogos, contabilistas, economistas, economistas domésticos, educação física, engenheiros e agrônomos, estatísticos, médicos veterinários e zootecnistas, museólogos, químicos, relações públicas, técnicos industriais e técnicos agrícolas)", "pendente", "Exige requisitos da pessoa jurídica (§ 1º)."),
    ],
  },
  {
    grupo: "Regimes diferenciados — redução de 60%",
    fonte: "LC 214/2025, Livro I, Título IV, Cap. III (Art. 128)",
    itens: [
      i("Serviços de educação", "Art. 129 · Anexo II (NBS)", "Redução de 60%", "pendente", "Classificador NBS ajuda a consultar."),
      i("Serviços de saúde", "Art. 130 · Anexo III (NBS)", "Redução de 60%", "pendente"),
      i("Dispositivos médicos", "Art. 131 · Anexo IV (NCM)", "Redução de 60% (regularizados na Anvisa); alguns em alíquota zero (Anexo XII)", "coberto", "Base de NCM no validador e na Consulta NCM."),
      i("Dispositivos de acessibilidade para pessoas com deficiência", "Art. 132 · Anexo V (NCM)", "Redução de 60%; alguns em alíquota zero (Anexo XIII)", "coberto", "Base de NCM no validador e na Consulta NCM."),
      i("Medicamentos", "Art. 133 · Anexo VI · alíquota zero: Art. 146", "Redução de 60% (registrados na Anvisa ou de manipulação); lista com alíquota zero", "parcial", "Perfil \"Medicamentos (comércio)\"; lista de alíquota zero por NCM ainda incompleta."),
      i("Alimentos destinados ao consumo humano", "Art. 128, VI · Anexo VII (NCM)", "Redução de 60%", "coberto", "Perfil \"Alimentos para consumo humano e cesta básica\" + base de NCM."),
      i("Produtos de higiene pessoal e limpeza (consumo de famílias de baixa renda)", "Art. 128, VII · Anexo VIII (NCM)", "Redução de 60%", "coberto", "Base de NCM."),
      i("Produtos agropecuários, aquícolas, pesqueiros, florestais e extrativistas vegetais in natura", "Art. 128, VIII", "Redução de 60%", "parcial", "Perfis de produtor rural (tratamento escolhido pelo usuário)."),
      i("Insumos agropecuários e aquícolas", "Art. 128, IX · Anexo IX (NCM)", "Redução de 60%", "coberto", "Perfis de sementes/mudas e rações + base de NCM."),
      i("Produções nacionais artísticas, culturais, de eventos, jornalísticas e audiovisuais", "Art. 128, X", "Redução de 60%", "pendente"),
      i("Comunicação institucional", "Art. 128, XI", "Redução de 60%", "pendente"),
      i("Atividades desportivas", "Art. 128, XII", "Redução de 60%", "pendente"),
      i("Bens e serviços de soberania e segurança nacional, segurança da informação e cibernética", "Art. 128, XIII", "Redução de 60%", "pendente"),
    ],
  },
  {
    grupo: "Regimes diferenciados — alíquota zero",
    fonte: "LC 214/2025, Livro I, Título III (cesta básica) e Título IV, Cap. IV (Arts. 143–156)",
    itens: [
      i("Cesta Básica Nacional de Alimentos", "Título III, Cap. II · Anexo I (NCM)", "Alíquota zero", "coberto", "Base de NCM e opção \"alíquota zero\" na calculadora."),
      i("Produtos de cuidados básicos à saúde menstrual", "Título IV, Cap. IV, Seção V", "Alíquota zero", "pendente"),
      i("Produtos hortícolas, frutas e ovos", "Título IV, Cap. IV, Seção VI · Anexo XV (NCM)", "Alíquota zero", "coberto", "Base de NCM."),
      i("Automóveis de passageiros adquiridos por pessoas com deficiência ou com TEA", "Título IV, Cap. IV, Seção VII", "Alíquota zero", "pendente"),
      i("Serviços prestados por Instituição Científica, Tecnológica e de Inovação (ICT)", "Título IV, Cap. IV, Seção VIII", "Alíquota zero", "pendente"),
      i("Transporte público coletivo de passageiros rodoviário e metroviário", "Título IV, Cap. V (Art. 157)", "Alíquota zero", "pendente"),
    ],
  },
  {
    grupo: "Regimes diferenciados — demais",
    fonte: "LC 214/2025, Livro I, Título IV, Caps. VI a X",
    itens: [
      i("Reabilitação urbana de zonas históricas e de áreas críticas", "Título IV, Cap. VI", "Tratamento específico", "pendente"),
      i("Produtor rural e produtor rural integrado não contribuinte", "Título IV, Cap. VII (Arts. 164–168)", "Receita anual inferior a R$ 3,6 milhões: não contribuinte; adquirente contribuinte usa crédito presumido", "parcial", "Perfis de produtor rural; regra do teto e crédito presumido ainda simplificadas."),
      i("Transportador autônomo de carga pessoa física não contribuinte", "Título IV, Cap. VIII (Art. 169)", "Crédito presumido para o contratante", "pendente"),
      i("Resíduos e materiais destinados à reciclagem, reutilização ou logística reversa", "Título IV, Cap. IX", "Tratamento específico (crédito presumido)", "pendente"),
      i("Bens móveis usados adquiridos de pessoa física não contribuinte para revenda", "Título IV, Cap. X", "Tratamento específico", "pendente"),
    ],
  },
  {
    grupo: "Regimes específicos",
    fonte: "LC 214/2025, Livro I, Título V (Arts. 172–296)",
    itens: [
      i("Combustíveis", "Título V, Cap. I (Arts. 172–180)", "IBS/CBS uma única vez na cadeia (gasolina, etanol anidro e hidratado, diesel, biodiesel, GLP, querosene de aviação, gás natural, biometano...)", "parcial", "Perfil \"Combustíveis — etanol e biocombustíveis\" com premissas simplificadas (sem o regime monofásico)."),
      i("Serviços financeiros", "Título V, Cap. II (Arts. 181–233)", "Regime específico", "pendente"),
      i("Planos de assistência à saúde", "Título V, Cap. III (Arts. 234–243)", "Regime específico", "pendente"),
      i("Concursos de prognósticos", "Título V, Cap. IV", "Regime específico", "pendente"),
      i("Bens imóveis", "Título V, Cap. V (Arts. 251–270)", "Regime específico (incorporação, parcelamento do solo, locação)", "pendente"),
      i("Sociedades cooperativas", "Título V, Cap. VI (Arts. 271–272)", "Opção pelo regime: alíquota zero nas operações associado↔cooperativa", "pendente"),
      i("Bares e restaurantes", "Título V, Cap. VII, Seção I (Arts. 273–280)", "Redução de 40% (Art. 275); adquirente não apropria crédito (Art. 276); exclui bebidas alcoólicas", "coberto", "Perfil próprio na calculadora."),
      i("Hotelaria, parques de diversão e parques temáticos", "Título V, Cap. VII, Seção II (Art. 281 e seguintes)", "Redução de 40%; crédito permitido ao fornecedor (Art. 282)", "pendente"),
      i("Transporte coletivo de passageiros (rodoviário, ferroviário e hidroviário intermunicipal/interestadual; aéreo regional)", "Título V, Cap. VII, Seção III (Arts. 285–287)", "Redução de 40%; ferroviário/hidroviário urbano com alíquota zero (Art. 285)", "pendente"),
      i("Agências de turismo", "Título V, Cap. VII, Seção IV", "Regime específico", "pendente"),
      i("Sociedade Anônima do Futebol (SAF)", "Título V, Cap. VIII (Arts. 292–296)", "Regime específico", "pendente"),
      i("Missões diplomáticas e repartições consulares", "Título V, Cap. IX", "Regime específico", "pendente"),
    ],
  },
  {
    grupo: "Regimes diferenciados da CBS",
    fonte: "LC 214/2025, Livro I, Título VI",
    itens: [
      i("Programa Universidade para Todos (Prouni)", "Título VI, Cap. I", "Regime diferenciado da CBS", "pendente"),
      i("Regime automotivo", "Título VI, Cap. II", "Regime diferenciado da CBS", "pendente"),
    ],
  },
  {
    grupo: "Regimes aduaneiros e bens de capital",
    fonte: "LC 214/2025, Livro I, Título II",
    itens: [
      i("Regimes aduaneiros especiais", "Título II, Cap. I", "Suspensão/tratamento específico", "pendente"),
      i("Zonas de Processamento de Exportação (ZPE)", "Título II, Cap. II", "Regime específico", "pendente"),
      i("Regimes dos bens de capital", "Título II, Cap. III", "Regime específico", "pendente"),
    ],
  },
  {
    grupo: "Imposto Seletivo",
    fonte: "LC 214/2025, Livro II (Art. 409 e seguintes)",
    itens: [
      i("Bens minerais", "Art. 409, § 1º, VI · Art. 422, § 2º", "IS na extração com alíquota máxima de 0,25%; incide também sobre o exportado; sem crédito (Art. 410)", "parcial", "Perfil \"Bens minerais\" usa 0,25% como premissa (alíquota final depende de lei ordinária)."),
      i("Veículos", "Art. 409, § 1º, I · Título II, Cap. IV, Seção I", "Imposto Seletivo", "pendente"),
      i("Embarcações e aeronaves", "Art. 409, § 1º, II · Seção II", "Imposto Seletivo", "pendente"),
      i("Produtos fumígenos", "Art. 409, § 1º, III · Art. 422, § 1º, I", "Imposto Seletivo (ad valorem + específica)", "pendente"),
      i("Bebidas alcoólicas", "Art. 409, § 1º, IV · Art. 422, § 1º, II", "Imposto Seletivo (ad valorem + específica pelo teor alcoólico)", "pendente"),
      i("Bebidas açucaradas", "Art. 409, § 1º, V", "Imposto Seletivo", "pendente"),
      i("Concursos de prognósticos e fantasy sport", "Art. 409, § 1º, VII", "Imposto Seletivo", "pendente"),
    ],
  },
  {
    grupo: "Demais disposições",
    fonte: "LC 214/2025, Livro III",
    itens: [
      i("Zona Franca de Manaus", "Livro III, Título I, Cap. I", "Regime específico", "pendente"),
      i("Áreas de Livre Comércio", "Livro III, Título I, Cap. II", "Regime específico", "pendente"),
      i("Devolução do IBS e da CBS ao turista estrangeiro", "Livro III, Título I, Cap. III", "Devolução", "pendente"),
      i("Compras governamentais", "Livro III, Título II", "Regime específico", "pendente"),
    ],
  },
  {
    grupo: "Relacionado (fora da LC 214)",
    fonte: "LC 123/2006 (Simples Nacional)",
    itens: [
      i("Simples Nacional", "LC 123/2006, com opção pelo regime regular do IBS/CBS", "DAS ou regime regular do IBS/CBS", "parcial", "Calculadora aceita o regime e compara com o regular; o \"fico ou saio\" completo ainda não existe."),
    ],
  },
];

/** Lista plana de ramos para o cadastro de empresas (nomes da lei). */
export const RAMOS_CADASTRO = SETORES_REFORMA.flatMap((g) => g.itens.map((x) => x.nome));

export function resumoCobertura() {
  const todos = SETORES_REFORMA.flatMap((g) => g.itens);
  return {
    total: todos.length,
    coberto: todos.filter((x) => x.cobertura === "coberto").length,
    parcial: todos.filter((x) => x.cobertura === "parcial").length,
    pendente: todos.filter((x) => x.cobertura === "pendente").length,
  };
}
