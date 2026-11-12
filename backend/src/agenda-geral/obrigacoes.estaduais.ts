import type { Fonte, Obrigacao } from './obrigacoes';

/**
 * Obrigações estaduais (ICMS) de MT, MS, GO, MA e PA, com a regra de prazo lida no texto oficial vigente (conferido em
 * 12/11/2026: RICMS e atos das SEFAZ, IOMAT e CONFAZ). Valem para a UF do cadastro do cliente. Regras por setor (combustíveis,
 * energia, transporte etc.) e prazos por operação ficam de fora; a observação diz quando há regra própria.
 * "Regime normal de ICMS" = Lucro Presumido e Lucro Real.
 */
const f = (norma: string, dispositivo: string, url: string, trecho: string): Fonte => ({ norma, dispositivo, url, trecho });
const NORMAL: Obrigacao['regimes'] = ['Lucro Presumido', 'Lucro Real'];
const SIMPLES: Obrigacao['regimes'] = ['Simples Nacional'];
const DESTDA = 'https://www.confaz.fazenda.gov.br/legislacao/ajustes/2015/AJ_012_15';

const MT137 = 'https://app1.sefaz.mt.gov.br/Sistema/Legislacao/legislacaotribut.nsf/b627c5d8a24d8a5003256730004d2e96/2ba1c35b8e4805e304258722006b6b9f?OpenDocument';
const MS3522 = 'https://aacpdappls.net.ms.gov.br/appls/legislacao/serc/legato.nsf/e5c724b4c70cb1da04256b1f005348a8/82e511c33e8ec15b04258e7c004d814f?OpenDocument';
const GO_IN155 = 'https://appasp.economia.go.gov.br/legislacao/arquivos/Secretario/IN/IN_0155_1994.htm';
const GO_RCTE = 'https://appasp.economia.go.gov.br/legislacao/arquivos/Rcte/RCTE.htm';
const MA_RICMS = 'https://portal-sgc.sefaz.ma.gov.br/sgc/api/portal/arquivos/public/identificador?identificador=99eaa3a0-b9c2-44ee-968f-d241aa074ff4';
const PA_RICMS = 'https://app.sefa.pa.gov.br/busca-legislacao/buscar-legislacoes/buscar/resultados/visualizacao?idAto=60062';

export const OBRIGACOES_ESTADUAIS: Obrigacao[] = [
  // ── MT ──
  {
    id: 'mt-icms', uf: 'MT', nome: 'ICMS (MT): demais atividades', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 6, ajuste: 'PRORROGA' }, regimes: NORMAL, condicao: 'Atividade principal que não é comércio (comércio vence no dia 20).',
    fonte: f('Portaria SEFAZ/MT nº 137/2021', 'art. 1º, I, e art. 5º (redação da Portaria 134/2022)', MT137, 'até o dia 6 (seis) do mês subsequente ao da apuração'),
    confirmado: true, observacao: 'Fundos (FUNDES, FUNDED, FUNTEC, FEMAM, FCP e outros) vencem no mesmo prazo do ICMS (art. 3º, IV). Há prazos próprios por setor (art. 1º, III a XXII).',
  },
  {
    id: 'mt-icms-comercio', uf: 'MT', nome: 'ICMS (MT): comércio', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, regimes: NORMAL, condicao: 'CNAE principal de comércio atacadista ou varejista, ou listado na Portaria 37/2020.',
    fonte: f('Portaria SEFAZ/MT nº 137/2021', 'art. 1º, II (redação da Portaria 224/2023)', MT137, 'até o dia 20 (vinte) do mês subsequente ao da apuração'),
    confirmado: true, observacao: 'O DIFAL de uso, consumo e ativo segue o prazo do ICMS do contribuinte (art. 1º, XVII, d).',
  },
  {
    id: 'mt-fethab', uf: 'MT', nome: 'FETHAB (MT): destinatário substituto', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, regimes: NORMAL, condicao: 'Destinatário substituto de soja, milho, algodão, madeira ou feijão no regime normal mensal; atacado ou varejo no dia 20, demais atividades no dia 6.',
    fonte: f('Portaria SEFAZ/MT nº 137/2021', 'art. 3º, I, b, 1.1.1 e 1.1.2 (redação da Portaria 134/2022)', 'https://iomat.mt.gov.br/legislacao/diario_oficial/download/70791', 'até o dia 6 (seis) do mês seguinte em que se verificar a entrada da mercadoria no estabelecimento do destinatário'),
    confirmado: true, observacao: 'Na maioria dos casos o FETHAB é cobrado por operação, antes da saída.',
  },
  {
    id: 'mt-efd', uf: 'MT', nome: 'EFD ICMS/IPI (MT)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'NENHUM' }, regimes: NORMAL,
    fonte: f('Portaria SEFAZ/MT nº 166/2008', 'art. 12 (redação da Portaria 210/2015)', 'https://app1.sefaz.mt.gov.br/Sistema/Legislacao/legislacaotribut.nsf/b627c5d8a24d8a5003256730004d2e96/77141e004e5c2413042574c20050ddc9?OpenDocument', 'será transmitido até o dia 20 (vinte) do mês subsequente ao do período informado'),
    confirmado: false, observacao: 'A data-base é oficial; a norma não diz o que acontece se o dia 20 não for útil.',
  },
  {
    id: 'mt-destda', uf: 'MT', nome: 'DeSTDA (MT)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 28, ajuste: 'PRORROGA' }, regimes: SIMPLES, condicao: 'Optante do Simples (exceto MEI) com ST, antecipação ou DIFAL.',
    fonte: f('RICMS/MT (Decreto 2.212/2014)', 'Anexo IX, art. 2º-A, § 5º (Decreto 784/2016); Ajuste SINIEF 12/2015, cl. 11ª', 'https://app1.sefaz.mt.gov.br/Sistema/Legislacao/legislacaotribut.nsf/b627c5d8a24d8a5003256730004d2e96/c52e8f84ebd73871842580980063e7ce?OpenDocument', 'até o dia 28 do mês subsequente ao encerramento do período de apuração'),
    confirmado: true,
  },
  // ── MS ──
  {
    id: 'ms-icms', uf: 'MS', nome: 'ICMS (MS): regime normal', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DATAS', porCompetencia: { '2026-10': '2026-11-16', '2026-11': '2026-12-14', '2026-12': '2027-01-15' } }, regimes: NORMAL,
    fonte: f('Resolução SEFAZ/MS nº 3.522/2026', 'Anexo Único, item 1.1 (base: RICMS/MS, art. 82, I)', MS3522, 'Estabelece as datas-limites para o recolhimento do ICMS'),
    confirmado: true, observacao: 'MS não tem dia fixo: as datas saem a cada trimestre em resolução da SEFAZ. O DIFAL do regime normal vence nas mesmas datas (item 4.1). Competências seguintes aparecem quando a nova resolução for incluída.',
  },
  {
    id: 'ms-simples-equalizacao', uf: 'MS', nome: 'ICMS (MS): equalização e DIFAL do Simples', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 2,
    regra: { tipo: 'DATAS', porCompetencia: { '2026-10': '2026-12-14', '2026-11': '2027-01-15', '2026-12': '2027-02-12' } }, regimes: SIMPLES,
    fonte: f('Resolução SEFAZ/MS nº 3.522/2026', 'Anexo Único, itens 2 e 4.2', MS3522, 'Estabelece as datas-limites para o recolhimento do ICMS'),
    confirmado: true, observacao: 'Datas por resolução trimestral da SEFAZ/MS.',
  },
  {
    id: 'ms-efd', uf: 'MS', nome: 'EFD ICMS/IPI (MS)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'NENHUM' }, regimes: NORMAL,
    fonte: f('RICMS/MS (Decreto 9.203/1998)', 'Anexo XV, Subanexo XIV, art. 12 (redação do Decreto 13.296/2011)', 'https://www.legisweb.com.br/legislacao/?id=135859', 'O arquivo digital da EFD deverá ser enviado até o dia vinte do mês seguinte ao de referência.'),
    confirmado: false, observacao: 'Não confirmado em fonte oficial: o texto só foi lido em site comercial.',
  },
  {
    id: 'ms-destda', uf: 'MS', nome: 'DeSTDA (MS)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 28, ajuste: 'PRORROGA' }, regimes: SIMPLES, condicao: 'Optante do Simples (exceto MEI) com ST, antecipação ou DIFAL.',
    fonte: f('Ajuste SINIEF 12/2015', 'cl. 11ª', DESTDA, 'deverá ser enviado até o dia 28 (vinte e oito) do mês subsequente ao encerramento do período de apuração'),
    confirmado: false, observacao: 'Não confirmado que MS exige: não há dispensa no RICMS/MS, mas também não há dispositivo estadual que diga que exige.',
  },
  // ── GO ──
  {
    id: 'go-icms', uf: 'GO', nome: 'ICMS (GO): regime normal', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, regimes: NORMAL,
    fonte: f('IN nº 155/1994-GSF', 'art. 2º, I; RCTE (Decreto 4.852/1997), arts. 75 a 77', GO_IN155, 'podendo ser efetuado nos prazos máximos ... contados do 1º (primeiro) dia subseqüente ao do encerramento ... I - 20º (vigésimo) dia'),
    confirmado: true, observacao: 'Há prazos próprios na IN 155 (ST: 9º dia; combustíveis: 10º). Prorrogações pontuais saem em IN (ex.: IN 1.630/2026).',
  },
  {
    id: 'go-difal-simples', uf: 'GO', nome: 'DIFAL do Simples (GO)', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 2,
    regra: { tipo: 'DIA_FIXO', dia: 10, ajuste: 'PRORROGA' }, regimes: SIMPLES, condicao: 'Compras de outra UF para comercialização ou industrialização.',
    fonte: f('RCTE (Decreto 4.852/1997)', 'Anexo XX, art. 5º, III; IN 155/1994, art. 2º, VII', 'https://goias.gov.br/economia/wp-content/uploads/sites/45/2026/01/Calendario_de_Recolhimento_de_ICMS_20250401-9.pdf', 'Até o 10º (décimo) dia do segundo mês subsequente ao período de apuração.'),
    confirmado: true,
  },
  {
    id: 'go-efd', uf: 'GO', nome: 'EFD ICMS/IPI (GO)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 15, ajuste: 'NENHUM' }, regimes: NORMAL,
    fonte: f('RCTE (Decreto 4.852/1997)', 'art. 356-N (Decreto 6.981/2009)', GO_RCTE, 'O arquivo digital da EFD deve ser enviado até o dia 15 (quinze) do mês subsequente ao encerramento do mês da apuração'),
    confirmado: false, observacao: 'A data-base é oficial; a norma não diz o que acontece se o dia 15 não for útil. A DPI foi substituída pela EFD (IN 1.020/10).',
  },
  {
    id: 'go-destda', uf: 'GO', nome: 'DeSTDA (GO)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 28, ajuste: 'PRORROGA' }, regimes: SIMPLES, condicao: 'Optante do Simples (exceto MEI) com ST, antecipação ou DIFAL.',
    fonte: f('Ajuste SINIEF 12/2015', 'cl. 11ª; RCTE art. 74-A, § 1º, I, r', DESTDA, 'deverá ser enviado até o dia 28 (vinte e oito) do mês subsequente ao encerramento do período de apuração'),
    confirmado: false, observacao: 'Não confirmado que GO exige: não há dispensa no RCTE, mas também não há dispositivo estadual expresso.',
  },
  // ── MA ──
  {
    id: 'ma-icms', uf: 'MA', nome: 'ICMS (MA): regime normal', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, regimes: NORMAL,
    fonte: f('RICMS/MA (Decreto 19.714/2003)', 'art. 69, caput, e art. 71', MA_RICMS, 'far-se-á até o 20º (vigésimo) dia do mês subsequente ao da ocorrência dos fatos geradores'),
    confirmado: true, observacao: 'Petróleo e gás: último dia útil (§ 7º). O ICMS-ST interno sem prazo próprio segue este prazo (§ 5º).',
  },
  {
    id: 'ma-efd', uf: 'MA', nome: 'EFD ICMS/IPI (MA)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'ULTIMO_DIA_UTIL' }, regimes: NORMAL,
    fonte: f('RICMS/MA (Decreto 19.714/2003)', 'art. 321-M (redação da RA 23/26 e da RA 30/26)', MA_RICMS, 'deverá ser enviado até o último dia útil do mês subsequente ao encerramento do mês da apuração'),
    confirmado: true, observacao: 'Mudou em 2026 (antes era o dia 20). Em março vai também o inventário do ano anterior (§ 1º).',
  },
  {
    id: 'ma-dief', uf: 'MA', nome: 'DIEF (MA)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'ULTIMO_DIA_UTIL' }, regimes: SIMPLES, condicao: 'Optante do Simples não obrigado à EFD.',
    fonte: f('RICMS/MA (Decreto 19.714/2003)', 'arts. 308 e 310, II (redação da RA 30/26)', MA_RICMS, 'até o último dia útil do mês subsequente ao do período de referência, pelos contribuintes enquadrados no regime tributário do regime do Simples Nacional'),
    confirmado: true,
  },
  {
    id: 'ma-destda', uf: 'MA', nome: 'DeSTDA (MA)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'NENHUM' }, regimes: SIMPLES, condicao: 'Optante do Simples (exceto MEI) com ST, antecipação ou DIFAL.',
    fonte: f('RICMS/MA (Decreto 19.714/2003)', 'arts. 321-R a 321-AA', MA_RICMS, 'O arquivo digital da DeSTDA deverá ser enviado até o dia 20 (vinte) do mês subsequente'),
    confirmado: true, observacao: 'O RICMS/MA diz dia 20; o Ajuste SINIEF 12/2015 vigente diz dia 28. Mostramos o dia 20, o mais cedo.',
  },
  // ── PA ──
  {
    id: 'pa-icms', uf: 'PA', nome: 'ICMS (PA): regime normal', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 15, ajuste: 'PRORROGA' }, regimes: NORMAL, condicao: 'Contribuinte que entrega somente a EFD (a DIEF está dispensada desde jan/2025).',
    fonte: f('RICMS/PA (Decreto 4.676/2001)', 'art. 108, V, a, e § 16 (Decreto 3.290/2023); art. 114', PA_RICMS, 'O contribuinte obrigado a apresentar somente a Escrituração Fiscal Digital (EFD) efetuará o recolhimento do imposto até o 15º (décimo quinto) dia do mês subsequente'),
    confirmado: true, observacao: 'A regra base do inciso V é o dia 10; o dia 15 vale para quem entrega só a EFD, o que, com a DIEF dispensada (IN 28/2024), é o caso geral (leitura nossa, não escrita na norma). DIFAL e ST seguem o § 16.',
  },
  {
    id: 'pa-efd', uf: 'PA', nome: 'EFD ICMS/IPI (PA)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 15, ajuste: 'NENHUM' }, regimes: NORMAL,
    fonte: f('IN SEFA nº 15/2023', 'art. 5º (RICMS/PA, art. 389-L)', 'https://app.sefa.pa.gov.br/busca-legislacao/buscar-legislacoes/buscar/resultados/visualizacao?idAto=57695', 'O arquivo da Escrituração Fiscal Digital - EFD deverá ser enviado até o 15º (décimo quinto) dia do mês subsequente ao mês de apuração.'),
    confirmado: false, observacao: 'A data-base é oficial; a norma não diz o que acontece se o dia 15 não for útil. A DeSTDA é dispensada no PA (Decreto 1.547/2016).',
  },
];
