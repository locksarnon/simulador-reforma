/**
 * DANFSe v2.0 (Documento Auxiliar da NFS-e Nacional) em PDF, retrato A4, uma única página, gerado a partir do XML da NFS-e.
 * Segue a Nota Técnica nº 008/2026 da SE/CGNFS-e (Especificações Técnicas do DANFSe, v1.0 de 05/05/2026) e o modelo do Anexo I:
 * cabeçalho cinza (logomarca, título e município/ambiente), identificação com o QR Code de consulta, prestador, tomador,
 * destinatário, intermediário, serviço, ISSQN, tributos federais, IBS/CBS, valor total e informações complementares.
 *
 * O que a norma deixa em aberto, ficou assim:
 * - o DANFSe só imprime o que consta do XML (item 2.1), e campo sem dado leva um traço (nota 12);
 * - blocos sem dados viram a frase única prevista nos itens 2.3.1 e 2.3.2 e o espaço que sobra vai para a descrição do serviço
 *   e para as informações complementares, que são os únicos blocos de altura variável;
 * - o canhoto é opcional e foi omitido (item 2.3.3): a folga vai para as informações complementares;
 * - as medidas do item 2.4.5 são mínimas e sugeridas; os campos que não cabem em uma linha quebram em duas (item 2.1) e a linha cresce;
 * - fontes: Helvetica (Arial) nos rótulos e Helvetica normal no conteúdo, no lugar de Arial e Microsoft Sans Serif;
 * - a logomarca da NFS-e não está no código: o espaço dela (4,00 x 0,85 cm) fica reservado com o nome da marca.
 * Nada além do que está no XML vai na página: o "gerado pelo InTAX" fica só nos metadados do arquivo (montarPdf).
 */
import { fmtData, fmtDocumento, fmtFone, fmtHora, fmtNumero, limparTexto } from './formatos-danfe';
import { EnderecoNfse, IssqnNfse, LocalNfse, NfseLida, ParteNfse, lerNfse } from './nfse-leitor';
import { A4, NEGRITO, NORMAL, OpcoesPdf, Pintor, marcaDagua, montarPdf } from './pintor';
import { matrizQr } from './qr';

/** Opções do DANFSe: as comuns a todos os PDF. Só `cancelada` e `semCompressao` se aplicam (a NFS-e não é denegada). */
export type OpcoesDanfse = OpcoesPdf;

/** Consulta pública do portal nacional: o QR Code leva esta URL com a chave de acesso (NT 008, item 2.4.3). */
export const URL_CONSULTA_NFSE = 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=';

// ── Geometria (NT 008, itens 2.2 e 2.4.5; medidas em cm convertidas para pontos) ──
const CM = 72 / 2.54;
const cm = (v: number): number => v * CM;

const X0 = cm(0.30);
const LARGURA = cm(20.4);
const COL = LARGURA / 4;
const TOPO = cm(0.3);
const BASE = A4.altura - cm(0.3);
/** A borda da página (1 pt) fica a 0,18 cm da folha: a norma pede de 0,15 a 0,20 cm. */
const BORDA = cm(0.18);
const PAD_X = cm(0.1);
const PAD_Y = 1.4;
const ALT_LINHA = cm(0.64);
const ALT_FRASE = cm(0.4);
const ALT_TITULO_INFORMACOES = cm(0.45);
/** Altura que o modelo do Anexo I dá à descrição do serviço (rótulo e texto) quando o texto é curto. */
const ALT_MINIMA_DESCRICAO = cm(2.4);
const ALT_MINIMA_DESCRICAO_APERTADA = cm(1.8);
const ALT_MINIMA_INFORMACOES = cm(1.3);
const TAM_VALOR = 7;
/** Cinza claro de 5% de densidade (item 2.2.3). */
const CINZA = '#f2f2f2';

const FRASE_TOMADOR = 'TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e';
const FRASE_DESTINATARIO = 'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e';
const FRASE_DESTINATARIO_E_O_TOMADOR = 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO';
const FRASE_INTERMEDIARIO = 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e';
const FRASE_NAO_SUJEITA = 'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN';

// ── Descrições das opções numéricas do leiaute (Anexo I do leiaute; onde a NT 008 dá o texto, vale o da NT) ──
const EMITENTE: Record<string, string> = { 1: 'Prestador', 2: 'Tomador', 3: 'Intermediário' };
const SITUACAO: Record<string, string> = {
  100: 'NFS-e Gerada', 102: 'NFS-e de Decisão Judicial ou Administrativa', 103: 'NFS-e Avulsa', 107: 'NFS-e MEI',
};
/** 0 vem do leiaute 1.01; 1 e 2 da NT 009 (notas de ajuste de IBS/CBS). */
const FINALIDADE: Record<string, string> = { 0: 'NFS-e regular', 1: 'NFS-e de crédito', 2: 'NFS-e de débito' };
const SIMPLES_NACIONAL: Record<string, string> = {
  1: 'Não Optante', 2: 'Optante - Microempreendedor Individual (MEI)', 3: 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
};
const REGIME_APURACAO_SN: Record<string, string> = {
  1: 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional',
  2: 'Regime de apuração dos tributos federais pelo Simples Nacional e o ISSQN pela NFS-e conforme respectiva legislação municipal do tributo',
  3: 'Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal de cada tributo',
};
const REGIME_ESPECIAL: Record<string, string> = {
  0: 'Nenhum', 1: 'Ato Cooperado (Cooperativa)', 2: 'Estimativa', 3: 'Microempresa Municipal', 4: 'Notário ou Registrador',
  5: 'Profissional Autônomo', 6: 'Sociedade de Profissionais', 9: 'Outros',
};
const TRIBUTACAO_ISSQN: Record<string, string> = { 1: 'Operação Tributável', 2: 'Imunidade', 3: 'Exportação de Serviço', 4: 'Não Incidência' };
const IMUNIDADE: Record<string, string> = {
  0: 'Imunidade (tipo não informado na nota de origem)',
  1: 'Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a)',
  2: 'Entidades religiosas e templos de qualquer culto, inclusive suas organizações assistenciais e beneficentes (CF88, Art 150, VI, b)',
  3: 'Patrimônio, renda ou serviços dos partidos políticos, inclusive suas fundações, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social, sem fins lucrativos, atendidos os requisitos da lei (CF88, Art 150, VI, c)',
  4: 'Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d)',
  5: 'Fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obras em geral interpretadas por artistas brasileiros bem como os suportes materiais ou arquivos digitais que os contenham, salvo na etapa de replicação industrial de mídias ópticas de leitura a laser (CF88, Art 150, VI, e)',
};
const SUSPENSAO: Record<string, string> = { 1: 'Exigibilidade Suspensa por Decisão Judicial', 2: 'Exigibilidade Suspensa por Processo Administrativo' };
/** O leiaute descreve 2, 3 e 4 com os parâmetros do município (ppBM, vInfoBM, aliqDifBM), que não vêm no XML: ficam sem número. */
const BENEFICIO: Record<string, string> = { 1: 'Isenção', 2: 'Redução da BC em %', 3: 'Redução da BC em R$', 4: 'Alíquota Diferenciada' };
const RETENCAO_ISSQN: Record<string, string> = { 1: 'Não Retido', 2: 'Retido pelo Tomador', 3: 'Retido pelo Intermediário' };
const RETENCAO_PIS_COFINS: Record<string, string> = {
  0: 'PIS/COFINS/CSLL Não Retidos', 1: 'PIS/COFINS Retidos', 2: 'PIS/COFINS Não Retidos', 3: 'PIS/COFINS/CSLL Retidos',
  4: 'PIS/COFINS Retidos, CSLL Não Retido', 5: 'PIS Retido, COFINS/CSLL Não Retido', 6: 'COFINS Retido, PIS/CSLL Não Retido',
  7: 'PIS Não Retido, COFINS/CSLL Retidos', 8: 'PIS/COFINS Não Retidos, CSLL Retido', 9: 'COFINS Não Retido, PIS/CSLL Retidos',
};
const MOTIVO_SEM_NIF: Record<string, string> = { 0: 'Não informado na nota de origem', 1: 'Dispensado do NIF', 2: 'Não exigência do NIF' };

// ── Formatação ───────────────────────────────────────────────────────

/** Texto cortado em `max` caracteres com reticências, como a tabela do item 2.4.5 manda ("caso a descrição supere N caracteres"). */
const reticencias = (texto: string, max: number): string => (texto.length > max ? `${texto.slice(0, max).trimEnd()}...` : texto);
const limitar = (texto: string, max: number, quebras = false): string => reticencias(limparTexto(texto, quebras), max);

const moeda = (v: string): string => (v === '' ? '' : `R$ ${fmtNumero(v, 2)}`);
const percentual = (v: string): string => (v === '' ? '' : `${fmtNumero(v, 2)}%`);
const dataHora = (iso: string): string => [fmtData(iso), fmtHora(iso)].filter(Boolean).join(' ');

/** Descrição de uma opção do leiaute (o próprio código quando não é conhecido), cortada em `max` caracteres se pedido. */
function opcao(tabela: Record<string, string>, codigo: string, max = 0): string {
  if (!codigo) return '';
  // o código vem do XML: só vale uma chave da própria tabela (e não "constructor" ou "__proto__")
  const descricao = Object.prototype.hasOwnProperty.call(tabela, codigo) ? tabela[codigo] : codigo;
  return max ? reticencias(descricao, max) : descricao;
}

/** Soma em centavos (sem erro de ponto flutuante); vazio se nenhum dos valores existe. */
function soma(...valores: string[]): string {
  let total = 0;
  let algum = false;
  for (const v of valores) {
    const n = Number(v);
    if (v !== '' && Number.isFinite(n)) { total += Math.round(n * 100); algum = true; }
  }
  return algum ? (total / 100).toFixed(2) : '';
}

/** CEP no formato da NT: nn.nnn-nnn. */
function fmtCepNt(cep: string): string {
  const d = String(cep ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : d;
}
const fmtCodigoTribNacional = (c: string): string => (/^[0-9]{6}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4)}` : c);
const fmtNbs = (c: string): string => (/^[0-9]{9}$/.test(c) ? `${c.slice(0, 1)}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7)}` : c);

function documentoDe(pt: ParteNfse): string {
  if (pt.documento) return pt.tipoDocumento === 'NIF' ? limparTexto(pt.documento) : fmtDocumento(pt.documento);
  return opcao(MOTIVO_SEM_NIF, pt.motivoSemNif);
}
const enderecoDe = (e: EnderecoNfse): string => [e.logradouro, e.numero, e.complemento, e.bairro].filter(Boolean).join(', ');

/** "Município / UF". O XML só traz o nome do município em alguns casos: sem ele, a UF sai com um traço no lugar do nome. */
function municipioUf(e: EnderecoNfse): string {
  if (e.codigoMunicipio || e.uf || e.municipio) {
    if (e.municipio) return [e.municipio, e.uf].filter(Boolean).join(' / ');
    return e.uf ? `- / ${e.uf}` : '';
  }
  return [e.cidade, e.estadoProvincia, e.pais].filter(Boolean).join(' / ');
}
function codigoIbgeCep(e: EnderecoNfse): string {
  if (e.codigoMunicipio || e.cep) return [e.codigoMunicipio, fmtCepNt(e.cep)].filter(Boolean).join(' / ');
  return e.codigoPostal ? `${e.codigoPostal} (ext)` : '';
}
const localDe = (l: LocalNfse): string => [l.municipio, l.uf, l.pais].filter(Boolean).join(' / ');

/** Competência até o fim de 2026: a linha de PIS/COFINS ainda é impressa (nota 6). Sem competência legível, imprime. */
function competenciaAte2026(n: NfseLida): boolean {
  const ano = Number(String(n.competencia).slice(0, 4));
  return Number.isNaN(ano) || ano <= 2026;
}
/** Item 99 da lista de serviços (990101): sem incidência de ISSQN; a não incidência indicada na DPS (tribISSQN = 4) vale o mesmo. */
const naoSujeitaAoIssqn = (n: NfseLida): boolean => n.servico.codigoTribNacional.slice(0, 2) === '99' || n.issqn.tipoTributacao === '4';

// ── Células, linhas e blocos ─────────────────────────────────────────

interface Celula {
  /** Coluna de 0 a 3 (a página tem 4 colunas de 5,10 cm). */
  col: number;
  span?: number;
  rotulo: string;
  /** Ausente nos títulos de bloco. */
  valor?: string;
  /** Rótulo em 7 pt (identificação e valores em destaque) em vez de 6 pt. */
  grande?: boolean;
  sombreada?: boolean;
  /** Máximo de linhas do valor (padrão 2). */
  linhas?: number;
}
interface Linha { celulas: Celula[]; alturaMin: number }
type Bloco = { frase: string } | { linhas: Linha[] };
const ehFrase = (b: Bloco): b is { frase: string } => 'frase' in b;

const cel = (col: number, rotulo: string, valor: string, o: Partial<Celula> = {}): Celula => ({ col, rotulo, valor, ...o });
/** Título de bloco: 7 pt, negrito, maiúsculo, no cinza claro, na primeira coluna da primeira linha do bloco. */
const celTitulo = (titulo: string): Celula => ({ col: 0, rotulo: titulo, grande: true, sombreada: true });
const linha = (...celulas: Celula[]): Linha => ({ celulas, alturaMin: ALT_LINHA });

const alturasDeLinha = new Map<string, number>();
/** Altura de uma linha de texto da fonte e do tamanho dados (a que o pdfkit usa ao quebrar linhas). */
function alturaDeLinha(p: Pintor, tam: number, fonte: string): number {
  const chave = `${fonte}:${tam}`;
  let h = alturasDeLinha.get(chave);
  if (h === undefined) {
    h = p.altura('A', 1000, tam, fonte);
    alturasDeLinha.set(chave, h);
  }
  return h;
}

function sombrear(p: Pintor, x: number, y: number, w: number, h: number) {
  p.doc.save();
  p.doc.rect(x, y, w, h).fill(CINZA);
  p.doc.restore();
}

/** Nenhum campo do leiaute passa de 300 caracteres impressos: o limite protege contra XML com texto enorme num campo curto. */
const MAX_VALOR_DA_CELULA = 300;
/** O que vai na célula: texto que a fonte do PDF sabe desenhar, cortado se enorme; campo sem informação no XML leva um traço (nota 12). */
const valorDaCelula = (c: Celula): string => reticencias(limparTexto(c.valor), MAX_VALOR_DA_CELULA) || '-';

function linhasDoValor(p: Pintor, c: Celula): number {
  const largura = COL * (c.span ?? 1) - 2 * PAD_X;
  const n = Math.round(p.altura(valorDaCelula(c), largura, TAM_VALOR) / alturaDeLinha(p, TAM_VALOR, NORMAL));
  return Math.min(Math.max(n, 1), c.linhas ?? 2);
}

function alturaDaCelula(p: Pintor, c: Celula): number {
  let h = PAD_Y + alturaDeLinha(p, c.grande ? 7 : 6, NEGRITO);
  if (c.valor !== undefined) h += linhasDoValor(p, c) * alturaDeLinha(p, TAM_VALOR, NORMAL);
  return h + PAD_Y;
}
const alturaDaLinha = (p: Pintor, l: Linha): number => Math.max(l.alturaMin, ...l.celulas.map((c) => alturaDaCelula(p, c)));

function desenharCelula(p: Pintor, c: Celula, y: number, h: number) {
  const x = X0 + c.col * COL;
  const w = COL * (c.span ?? 1);
  if (c.sombreada) sombrear(p, x, y, w, h);
  const tamRotulo = c.grande ? 7 : 6;
  p.texto(c.rotulo, x + PAD_X, y + PAD_Y, w - PAD_X, { fonte: NEGRITO, tam: tamRotulo });
  if (c.valor === undefined) return;
  const yValor = y + PAD_Y + alturaDeLinha(p, tamRotulo, NEGRITO);
  const largura = w - 2 * PAD_X;
  const n = linhasDoValor(p, c);
  if (n === 1) p.texto(valorDaCelula(c), x + PAD_X, yValor, largura, { tam: TAM_VALOR });
  else p.texto(valorDaCelula(c), x + PAD_X, yValor, largura, { tam: TAM_VALOR, altura: n * alturaDeLinha(p, TAM_VALOR, NORMAL) + 0.5 });
}

function desenharLinha(p: Pintor, y: number, l: Linha): number {
  const h = alturaDaLinha(p, l);
  l.celulas.forEach((c) => desenharCelula(p, c, y, h));
  return y + h;
}

const alturaDoBloco = (p: Pintor, b: Bloco): number => (ehFrase(b) ? ALT_FRASE : b.linhas.reduce((acc, l) => acc + alturaDaLinha(p, l), 0));

/** Desenha o bloco a partir de `y` com a divisória de 0,5 pt no topo; devolve o `y` onde o bloco termina. */
function desenharBloco(p: Pintor, y: number, b: Bloco): number {
  let fim: number;
  if (ehFrase(b)) {
    p.texto(b.frase, X0, y + (ALT_FRASE - alturaDeLinha(p, TAM_VALOR, NORMAL)) / 2, LARGURA, { tam: TAM_VALOR, alinhar: 'center' });
    fim = y + ALT_FRASE;
  } else {
    fim = b.linhas.reduce((acc, l) => desenharLinha(p, acc, l), y);
  }
  p.linha(X0, y, X0 + LARGURA, y);
  return fim;
}

// ── Blocos ───────────────────────────────────────────────────────────

function blocoPrestador(n: NfseLida): Bloco {
  const pr = n.prestador;
  return {
    linhas: [
      linha(celTitulo('PRESTADOR / FORNECEDOR'), cel(1, 'CNPJ / CPF / NIF', documentoDe(pr)), cel(2, 'Indicador Municipal (Inscrição)', limparTexto(pr.inscricaoMunicipal)), cel(3, 'Telefone', fmtFone(pr.fone))),
      linha(cel(0, 'Nome / Nome Empresarial', limitar(pr.nome, 77), { span: 2 }), cel(2, 'Município / Sigla UF', limparTexto(municipioUf(pr.endereco))), cel(3, 'Código IBGE / CEP', codigoIbgeCep(pr.endereco))),
      linha(cel(0, 'Endereço', limitar(enderecoDe(pr.endereco), 77), { span: 2 }), cel(2, 'E-mail', limparTexto(pr.email), { span: 2 })),
      linha(
        cel(0, 'Simples Nacional na Data de Competência', opcao(SIMPLES_NACIONAL, pr.simplesNacional, 37)),
        cel(1, 'Regime de Apuração Tributária pelo SN', opcao(REGIME_APURACAO_SN, pr.regimeApuracaoSn, 77), { span: 2 }),
      ),
    ],
  };
}

/** Tomador, intermediário e destinatário: o destinatário não tem inscrição municipal. */
function blocoDeParte(titulo: string, pt: ParteNfse, comInscricao: boolean): Bloco {
  const e = pt.endereco;
  const primeira = [celTitulo(titulo), cel(1, 'CNPJ / CPF / NIF', documentoDe(pt))];
  if (comInscricao) primeira.push(cel(2, 'Indicador Municipal (Inscrição)', limparTexto(pt.inscricaoMunicipal)));
  primeira.push(cel(3, 'Telefone', fmtFone(pt.fone)));
  return {
    linhas: [
      linha(...primeira),
      linha(cel(0, 'Nome / Nome Empresarial', limitar(pt.nome, 77), { span: 2 }), cel(2, 'Município / Sigla UF', limparTexto(municipioUf(e))), cel(3, 'Código IBGE / CEP', codigoIbgeCep(e))),
      linha(cel(0, 'Endereço', limitar(enderecoDe(e), 77), { span: 2 }), cel(2, 'E-mail', limparTexto(pt.email), { span: 2 })),
    ],
  };
}

const blocoTomador = (n: NfseLida): Bloco => (n.tomador ? blocoDeParte('TOMADOR / ADQUIRENTE', n.tomador, true) : { frase: FRASE_TOMADOR });
const blocoIntermediario = (n: NfseLida): Bloco => (n.intermediario ? blocoDeParte('INTERMEDIÁRIO DA OPERAÇÃO', n.intermediario, true) : { frase: FRASE_INTERMEDIARIO });
function blocoDestinatario(n: NfseLida): Bloco {
  if (n.ibsCbs.indicadorDestinatario === '0') return { frase: FRASE_DESTINATARIO_E_O_TOMADOR };
  return n.destinatario ? blocoDeParte('DESTINATÁRIO DA OPERAÇÃO', n.destinatario, false) : { frase: FRASE_DESTINATARIO };
}

/** A linha do serviço; a descrição, de altura variável, vem logo abaixo (ver desenharDescricao). */
function blocoServico(n: NfseLida): Bloco {
  const s = n.servico;
  const codigo = [fmtCodigoTribNacional(s.codigoTribNacional), s.codigoTribMunicipal].filter(Boolean).join(' / ');
  return {
    linhas: [
      linha(celTitulo('SERVIÇO PRESTADO'), cel(1, 'Código de Tributação Nacional / Municipal', codigo), cel(2, 'Código da NBS', fmtNbs(s.codigoNbs)), cel(3, 'Local da Prestação / Sigla UF / País', limparTexto(localDe(s.local)))),
    ],
  };
}

function blocoIssqn(n: NfseLida): Bloco {
  if (naoSujeitaAoIssqn(n)) return { frase: FRASE_NAO_SUJEITA };
  const i: IssqnNfse = n.issqn;
  return {
    linhas: [
      linha(
        celTitulo('TRIBUTAÇÃO MUNICIPAL (ISSQN)'),
        cel(1, 'Tipo de Tributação do ISSQN', opcao(TRIBUTACAO_ISSQN, i.tipoTributacao, 21)),
        cel(2, 'Município / Sigla UF / País de Incidência do ISSQN', limparTexto(localDe(i.incidencia)), { span: 2 }),
      ),
      linha(
        cel(0, 'Regime Especial de Tributação do ISSQN', opcao(REGIME_ESPECIAL, n.prestador.regimeEspecial, 27)),
        cel(1, 'Tipo de Imunidade do ISSQN', opcao(IMUNIDADE, i.tipoImunidade, 37)),
        cel(2, 'Suspensão da Exigibilidade do ISSQN', opcao(SUSPENSAO, i.tipoSuspensao, 37)),
        cel(3, 'Número Processo Suspensão', limparTexto(i.processoSuspensao)),
      ),
      linha(
        cel(0, 'Benefício Municipal', opcao(BENEFICIO, i.tipoBeneficio, 40)),
        cel(1, 'Cálculo do BM', moeda(i.valorBeneficio)),
        cel(2, 'Total Deduções/Reduções', moeda(soma(i.deducoes, n.ibsCbs.reembolsos))),
        cel(3, 'Desconto Incondicionado', moeda(i.descontoIncondicionado)),
      ),
      linha(
        cel(0, 'BC ISSQN', moeda(i.baseCalculo)),
        cel(1, 'Alíquota Aplicada', percentual(i.aliquota)),
        cel(2, 'Retenção do ISSQN', opcao(RETENCAO_ISSQN, i.tipoRetencao, 25)),
        cel(3, 'ISSQN Apurado', moeda(i.valor)),
      ),
    ],
  };
}

function blocoFederal(n: NfseLida): Bloco {
  const f = n.federal;
  const linhas = [
    linha(
      celTitulo('TRIBUTAÇÃO FEDERAL (EXCETO CBS)'),
      cel(1, 'IRRF', moeda(f.irrf)),
      cel(2, 'Contribuição Previdenciária - Retida', moeda(f.contribuicaoPrevidenciaria)),
      cel(3, 'Contribuições Sociais - Retidas', moeda(f.contribuicoesSociais)),
    ),
  ];
  // PIS e COFINS próprios só existem até o fim de 2026 (nota 6)
  if (competenciaAte2026(n)) {
    linhas.push(linha(
      cel(0, 'PIS - Débito Apuração Própria', moeda(f.pis)),
      cel(1, 'COFINS - Débito Apuração Própria', moeda(f.cofins)),
      cel(2, 'Descrição Contrib. Sociais - Retidas', opcao(RETENCAO_PIS_COFINS, f.tipoRetencaoPisCofins, 35), { span: 2 }),
    ));
  }
  return { linhas };
}

/** Os valores separados por barra: tudo vazio vira vazio (traço); se só alguns faltam, os que faltam ficam com traço. */
const juntar = (valores: string[]): string => (valores.every((v) => v === '') ? '' : valores.map((v) => v || '-').join(' / '));

function blocoIbsCbs(n: NfseLida): Bloco {
  const b = n.ibsCbs;
  // Sem o grupo IBSCBS no XML (NFS-e anterior à reforma ou de optante do Simples antes de 2027) o bloco sai todo com traços.
  const exclusoes = b.presente ? soma(n.totais.descontoIncondicionado, b.reembolsos, n.issqn.valor, n.federal.pis, n.federal.cofins) || '0.00' : '';
  return {
    linhas: [
      linha(
        celTitulo('TRIBUTAÇÃO IBS / CBS'),
        cel(1, 'CST / cClassTrib', [b.cst, b.classificacao].filter(Boolean).join(' / ')),
        cel(2, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', limparTexto([b.indicadorOperacao, b.localidade.codigoMunicipio, b.localidade.municipio, b.localidade.uf].filter(Boolean).join(' / ')), { span: 2 }),
      ),
      linha(
        cel(0, 'Exclusões e Reduções da Base de Cálculo', moeda(exclusoes)),
        cel(1, 'Base de Cálculo Após Exclusões e Reduções', moeda(b.baseCalculo)),
        cel(2, 'Red. Alíquota IBS / Red. Alíquota CBS', juntar([b.estadual.reducao, b.municipal.reducao, b.cbs.reducao].map(percentual))),
        cel(3, 'Alíquota - IBS UF / IBS Mun', juntar([b.estadual.aliquota, b.municipal.aliquota].map(percentual))),
      ),
      linha(
        cel(0, 'Alíq. Efetiva Municipal - IBS', percentual(b.municipal.aliquotaEfetiva)),
        cel(1, 'Valor Apurado Municipal - IBS', moeda(b.municipal.valor)),
        cel(2, 'Alíq. Efetiva Estadual - IBS', percentual(b.estadual.aliquotaEfetiva)),
        cel(3, 'Valor Apurado Estadual - IBS', moeda(b.estadual.valor)),
      ),
      linha(
        cel(0, 'Valor Total Apurado - IBS', moeda(b.totalIbs)),
        cel(1, 'Alíquota - CBS', percentual(b.cbs.aliquota)),
        cel(2, 'Alíquota Efetiva - CBS', percentual(b.cbs.aliquotaEfetiva)),
        cel(3, 'Valor Total Apurado - CBS', moeda(b.cbs.valor)),
      ),
    ],
  };
}

function blocoValorTotal(n: NfseLida): Bloco {
  const t = n.totais;
  const b = n.ibsCbs;
  const alta = (l: Linha): Linha => ({ ...l, alturaMin: cm(0.67) });
  return {
    linhas: [
      alta(linha(
        celTitulo('VALOR TOTAL DA NFS-E'),
        cel(1, 'VALOR DA OPERAÇÃO / SERVIÇO', moeda(t.valorServico), { grande: true }),
        cel(2, 'Desconto Incondicionado', moeda(t.descontoIncondicionado)),
        cel(3, 'Desconto Condicionado', moeda(t.descontoCondicionado)),
      )),
      alta(linha(
        cel(0, 'Total das Retenções (ISSQN / Federais)', moeda(t.totalRetencoes)),
        cel(1, 'VALOR LÍQUIDO DA NFS-e', moeda(t.valorLiquido), { grande: true }),
        cel(2, 'Total do IBS/CBS', moeda(soma(b.totalIbs, b.cbs.valor))),
        cel(3, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS', moeda(b.totalNf), { grande: true, sombreada: true }),
      )),
    ],
  };
}

// ── Cabeçalho e identificação ────────────────────────────────────────

/** Vermelho sólido M100/Y100 do item 2.4.3 (CMYK), em negrito de 9 pt, centralizado. */
function textoVermelho(p: Pintor, txt: string, x: number, y: number, w: number) {
  p.doc.font(NEGRITO).fontSize(9).fillColor([0, 100, 100, 0]);
  p.doc.text(txt, x, y, { width: w, align: 'center', lineBreak: false });
}

function cabecalho(p: Pintor, n: NfseLida, y: number): number {
  const h = cm(1.16);
  sombrear(p, X0, y, LARGURA, h);

  // logomarca da NFS-e: o arquivo da imagem não faz parte do código, então o espaço fica reservado com o nome da marca
  p.texto('NFS-e', cm(0.49), y + cm(0.14), cm(4), { fonte: NEGRITO, tam: 21 });

  // título ao centro (9 pt, negrito); a NFS-e de homologação leva a expressão em vermelho logo abaixo
  const xCentro = X0 + COL;
  const lCentro = 2 * COL;
  const linhasDoTitulo = n.homologacao ? 3 : 2;
  const alturaTitulo = alturaDeLinha(p, 9, NEGRITO);
  let yTitulo = y + (h - linhasDoTitulo * alturaTitulo) / 2;
  p.texto('DANFSe v2.0', xCentro, yTitulo, lCentro, { fonte: NEGRITO, tam: 9, alinhar: 'center' });
  yTitulo += alturaTitulo;
  p.texto('Documento Auxiliar da NFS-e', xCentro, yTitulo, lCentro, { fonte: NEGRITO, tam: 9, alinhar: 'center' });
  if (n.homologacao) textoVermelho(p, 'NFS-e SEM VALIDADE JURÍDICA', xCentro, yTitulo + alturaTitulo, lCentro);

  // município do emitente (não aparece quando o item do código de tributação é 99), ambiente gerador e tipo de ambiente
  const xDireita = X0 + 3 * COL + PAD_X;
  const lDireita = COL - 2 * PAD_X;
  if (n.servico.codigoTribNacional.slice(0, 2) !== '99') {
    const municipio = `Município: ${[n.municipioEmissor, n.ufEmissor].filter(Boolean).join(' / ') || '-'}`;
    p.texto(limitar(municipio, 120), xDireita, y + cm(0.02), lDireita, { tam: 8, altura: 2 * alturaDeLinha(p, 8, NORMAL) + 0.5 });
  }
  p.texto(`Ambiente Gerador: ${limparTexto(n.ambienteGerador) || '-'}`, xDireita, y + cm(0.67), lDireita, { tam: 6 });
  p.texto(`Tipo de Ambiente: ${limparTexto(n.tipoAmbiente) || '-'}`, xDireita, y + cm(0.92), lDireita, { tam: 6 });
  return y + h;
}

function qrCodeDaConsulta(p: Pintor, chave: string, yBloco: number) {
  const url = `${URL_CONSULTA_NFSE}${chave}`;
  const lado = cm(1.7);
  const centro = X0 + 3 * COL + cm(2.54); // centro do quadro complementar do modelo (15,80 + 4,72 / 2)
  // margem de silêncio de 4 módulos em volta do símbolo (ISO 18004)
  const silencio = (4 * lado) / matrizQr(url).length;
  const yQr = yBloco + silencio;
  p.qrCode(centro - lado / 2, yQr, lado, url);
  const textos = ['A autenticidade desta NFS-e pode ser verificada', 'pela leitura deste código QR ou pela consulta da', 'chave de acesso no portal nacional da NFS-e'];
  const alturaTexto = alturaDeLinha(p, 6, NORMAL);
  textos.forEach((t, i) => p.texto(t, centro - cm(2.5), yQr + lado + silencio + i * alturaTexto, cm(5), { tam: 6, alinhar: 'center' }));
}

function identificacao(p: Pintor, n: NfseLida, y: number): number {
  const g = { grande: true };
  const fim = [
    { alturaMin: cm(0.79), celulas: [cel(0, 'CHAVE DE ACESSO DA NFS-E', limparTexto(n.chave), { ...g, span: 3 })] },
    { alturaMin: cm(0.69), celulas: [cel(0, 'NÚMERO DA NFS-E', limparTexto(n.numero), g), cel(1, 'COMPETÊNCIA DA NFS-E', fmtData(n.competencia), g), cel(2, 'DATA E HORA DA EMISSÃO DA NFS-E', dataHora(n.dataHoraEmissao), g)] },
    { alturaMin: cm(0.69), celulas: [cel(0, 'NÚMERO DA DPS', limparTexto(n.numeroDps), g), cel(1, 'SÉRIE DA DPS', limparTexto(n.serieDps), g), cel(2, 'DATA E HORA DA EMISSÃO DA DPS', dataHora(n.dataHoraDps), g)] },
    {
      alturaMin: cm(0.67),
      celulas: [
        cel(0, 'EMITENTE DA NFS-e', opcao(EMITENTE, n.emitente, 13), { ...g, sombreada: true }),
        cel(1, 'SITUAÇÃO DA NFS-e', opcao(SITUACAO, n.situacao, 37), g),
        cel(2, 'FINALIDADE', opcao(FINALIDADE, n.ibsCbs.finalidade, 37), g),
      ],
    },
  ].reduce((acc, l) => desenharLinha(p, acc, l), y);
  qrCodeDaConsulta(p, n.chave, y);
  return fim;
}

// ── Descrição do serviço e informações complementares ────────────────

interface DescricaoMedida { codigo: string; alturaCodigo: number; servico: string; alturaServico: number }

function medirDescricao(p: Pintor, n: NfseLida): DescricaoMedida {
  const largura = LARGURA - 2 * PAD_X;
  const s = n.servico;
  // sem rótulo: a descrição municipal quando há, senão a nacional (até 167 caracteres)
  const codigo = limitar(s.descricaoTribMunicipal || s.descricaoTribNacional, 167);
  const alturaCodigo = codigo ? Math.min(p.altura(codigo, largura, TAM_VALOR), 2 * alturaDeLinha(p, TAM_VALOR, NORMAL)) + 2 * PAD_Y : 0;
  const servico = limitar(s.descricao, 1297, true) || '-';
  const alturaServico = PAD_Y + alturaDeLinha(p, 6, NEGRITO) + p.altura(servico, largura, TAM_VALOR) + PAD_Y;
  return { codigo, alturaCodigo, servico, alturaServico };
}

/** Descrição do código de tributação (sem rótulo) e o quadro "Descrição do Serviço", com `alturaServico` de altura. */
function desenharDescricao(p: Pintor, y: number, m: DescricaoMedida, alturaServico: number): number {
  const largura = LARGURA - 2 * PAD_X;
  const alturaLinhaValor = alturaDeLinha(p, TAM_VALOR, NORMAL);
  if (m.codigo) {
    const linhas = Math.min(2, Math.max(1, Math.round(p.altura(m.codigo, largura, TAM_VALOR) / alturaLinhaValor)));
    p.texto(m.codigo, X0 + PAD_X, y + PAD_Y, largura, linhas === 1 ? { tam: TAM_VALOR } : { tam: TAM_VALOR, altura: linhas * alturaLinhaValor + 0.5 });
  }
  const yQuadro = y + m.alturaCodigo;
  p.texto('Descrição do Serviço', X0 + PAD_X, yQuadro + PAD_Y, largura, { fonte: NEGRITO, tam: 6 });
  const yTexto = yQuadro + PAD_Y + alturaDeLinha(p, 6, NEGRITO);
  p.texto(m.servico, X0 + PAD_X, yTexto, largura, { tam: TAM_VALOR, altura: Math.max(alturaServico - PAD_Y - alturaDeLinha(p, 6, NEGRITO) - PAD_Y, alturaLinhaValor) });
  return yQuadro + alturaServico;
}

interface InformacoesMedidas { variavel: string; fixa: string; alturaNecessaria: number }

/** Informações complementares na ordem e com os rótulos da NT (item 2.4.5), separadas por pipes, e a linha fixa dos totais aproximados. */
function medirInformacoes(p: Pintor, n: NfseLida): InformacoesMedidas {
  const c = n.complementares;
  const itens: string[] = [];
  const acrescentar = (rotulo: string, valor: string) => { if (valor) itens.push(`${rotulo} ${limparTexto(valor, true)}`); };
  acrescentar('Inf. Cont.:', c.informacoes);
  acrescentar('NFS-e Subst.:', c.substituida);
  acrescentar('Doc. Ref.:', c.documentoReferencia);
  acrescentar('Cod. Obra:', c.codigoObra);
  acrescentar('Insc. Imob.:', c.inscricaoImobiliaria);
  acrescentar('Cod. Evt.:', c.codigoEvento);
  acrescentar('Doc. Tec.:', c.documentoTecnico);
  acrescentar('Núm. Ped.:', c.numeroPedido);
  acrescentar('Item Ped.:', c.itensPedido.join(', '));
  acrescentar('Inf. A. T. Mun.:', c.usoMunicipio);
  const variavel = reticencias(itens.join(' | '), 1997);

  // a linha dos totais aproximados dos tributos (Lei 12.741/2012) é fixa: sempre presente e sempre por último
  const t = n.tributosAproximados;
  // espaço sem quebra entre "R$" e o número: o valor não se parte entre duas linhas
  const valor = (v: string): string => (v === '' ? '-' : t.tipo === 'percentual' ? percentual(limparTexto(v)) : moeda(limparTexto(v)).replace(' ', '\u00a0'));
  const totais = `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: ${valor(t.federal)}; Estaduais: ${valor(t.estadual)}; Municipais: ${valor(t.municipal)}`;
  const simples = t.percentualSimples ? `Simples Nacional (tributos aproximados): ${percentual(t.percentualSimples)}` : '';
  const fixa = [simples, totais].filter(Boolean).join(' | ');

  const texto = [variavel, fixa].filter(Boolean).join(' | ');
  const alturaNecessaria = ALT_TITULO_INFORMACOES + PAD_Y + p.altura(texto, LARGURA - 2 * PAD_X, TAM_VALOR) + PAD_Y;
  return { variavel, fixa, alturaNecessaria };
}

/** O texto livre cede espaço, com reticências, antes da linha fixa dos totais aproximados se o quadro for pequeno demais. */
function textoDasInformacoes(p: Pintor, m: InformacoesMedidas, largura: number, altura: number): string {
  const monta = (v: string): string => [v, m.fixa].filter(Boolean).join(' | ');
  if (p.altura(monta(m.variavel), largura, TAM_VALOR) <= altura) return monta(m.variavel);
  let ini = 0;
  let fim = m.variavel.length;
  while (ini < fim) {
    const meio = Math.ceil((ini + fim) / 2);
    if (p.altura(monta(`${m.variavel.slice(0, meio).trimEnd()}...`), largura, TAM_VALOR) <= altura) ini = meio;
    else fim = meio - 1;
  }
  return monta(ini > 0 ? `${m.variavel.slice(0, ini).trimEnd()}...` : '');
}

function desenharInformacoes(p: Pintor, y: number, altura: number, m: InformacoesMedidas) {
  sombrear(p, X0, y, COL, ALT_TITULO_INFORMACOES);
  p.texto('INFORMAÇÕES COMPLEMENTARES', X0 + PAD_X, y + PAD_Y, COL - PAD_X, { fonte: NEGRITO, tam: 7 });
  const largura = LARGURA - 2 * PAD_X;
  const alturaTexto = Math.max(altura - ALT_TITULO_INFORMACOES - 2 * PAD_Y, alturaDeLinha(p, TAM_VALOR, NORMAL));
  p.texto(textoDasInformacoes(p, m, largura, alturaTexto), X0 + PAD_X, y + ALT_TITULO_INFORMACOES + PAD_Y, largura, { tam: TAM_VALOR, altura: alturaTexto });
  p.linha(X0, y, X0 + LARGURA, y);
}

// ── Montagem ─────────────────────────────────────────────────────────

function desenhar(n: NfseLida, op: OpcoesDanfse): Promise<Buffer> {
  return montarPdf({ titulo: `DANFSe NFS-e ${limitar(n.numero, 20)}`, assunto: `Chave de acesso ${n.chave}`, semCompressao: op.semCompressao }, (doc) => {
    const p = new Pintor(doc);
    // borda da página, de 1 pt
    doc.lineWidth(1).strokeColor('#000').rect(BORDA, BORDA, A4.largura - 2 * BORDA, A4.altura - 2 * BORDA).stroke();

    let y = cabecalho(p, n, TOPO);
    p.linha(X0, y, X0 + LARGURA, y);
    y = identificacao(p, n, y);
    for (const bloco of [blocoPrestador(n), blocoTomador(n), blocoDestinatario(n), blocoIntermediario(n), blocoServico(n)]) y = desenharBloco(p, y, bloco);

    // Só a descrição do serviço e as informações complementares mudam de altura: dividem o que sobra da página, e o que os
    // blocos sem dados liberam vai para elas (itens 2.3.1 a 2.3.3). Os blocos de baixo têm altura que se mede antes de desenhar.
    const inferiores = [blocoIssqn(n), blocoFederal(n), blocoIbsCbs(n), blocoValorTotal(n)];
    const alturaInferiores = inferiores.reduce((acc, b) => acc + alturaDoBloco(p, b), 0);
    const descricao = medirDescricao(p, n);
    const informacoes = medirInformacoes(p, n);
    const livre = Math.max(BASE - y - descricao.alturaCodigo - alturaInferiores, 0);
    // a descrição ocupa o que o texto pede (no mínimo, a altura do modelo do Anexo I); se faltar espaço para as informações
    // complementares ela cede, mas não abaixo de umas 5 linhas, e as informações nunca ficam com menos de ALT_MINIMA_INFORMACOES
    let alturaServico = Math.max(descricao.alturaServico, ALT_MINIMA_DESCRICAO);
    if (livre - alturaServico < informacoes.alturaNecessaria) {
      alturaServico = Math.max(Math.min(alturaServico, livre - informacoes.alturaNecessaria), Math.min(descricao.alturaServico, ALT_MINIMA_DESCRICAO_APERTADA));
    }
    alturaServico = Math.max(Math.min(alturaServico, livre - Math.min(informacoes.alturaNecessaria, ALT_MINIMA_INFORMACOES)), 0);

    y = desenharDescricao(p, y, descricao, alturaServico);
    for (const bloco of inferiores) y = desenharBloco(p, y, bloco);
    desenharInformacoes(p, y, BASE - y, informacoes);

    // a NFS-e cancelada leva a marca d'água "CANCELADA" na diagonal, em cinza K35 (item 2.5.1)
    if (op.cancelada) marcaDagua(doc, 'CANCELADA', '#a6a6a6');
  });
}

/**
 * Gera o DANFSe da NFS-e Nacional a partir do XML (NFSe). Lança ErroLeituraNfse se o XML não for uma NFS-e Nacional legível.
 * `cancelada` põe a marca d'água "CANCELADA"; a NFS-e de homologação (tpAmb = 2) leva sempre a expressão "NFS-e SEM VALIDADE JURÍDICA".
 */
export async function gerarDanfse(xml: string, opcoes: OpcoesDanfse = {}): Promise<Buffer> {
  return desenhar(lerNfse(xml), opcoes);
}
