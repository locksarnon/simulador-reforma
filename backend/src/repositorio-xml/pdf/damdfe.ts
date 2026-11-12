/**
 * DAMDFE (Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais) em PDF, retrato A4, gerado a partir do XML do
 * MDF-e (modelo 58). Segue o Anexo II do MOC 3.00b (Manual de Especificações Técnicas do DAMDFE, Ato COTEPE/ICMS 124/2022):
 * identificação do emitente, modelo, série, número, folha, datas e UF, quantidades e peso da carga, código de barras Code 128C
 * da chave de acesso (barras com 44 pt de altura e módulo de 0,85 pt: o item 2.3 pede de 1,5 a 2,5 cm de altura e módulo de
 * até 0,03 cm), protocolo de autorização, QR Code (item 2.4: 22 mm de conteúdo e 3 mm de margem de silêncio, no mínimo), os
 * dados do modal e as observações. Abaixo desse leiaute padrão vêm os campos que o XML traz e o modelo do Anexo II não
 * desenha (CIOT, contratante, pagamento do frete, seguro, produto predominante, percurso, lacres, autorizados a baixar o XML
 * e os documentos fiscais por município de descarga, em quantas folhas forem precisas).
 *
 * O documento fiscal é o XML: o DAMDFE só mostra o que o XML traz (item 2.1 do Anexo II) e diz isso no rodapé. Campos que o XML
 * não traz ficam em branco.
 *
 * NÃO confirmado: a marca d'água do MDF-e cancelado (o Anexo II não define; usa-se "CANCELADO", no gênero de "manifesto"), o
 * significado da data entre parênteses no texto "EMISSÃO EM CONTINGÊNCIA" (aqui, a data e hora da emissão) e a obrigatoriedade
 * do QR Code a partir de uma data (o Anexo I fala em data "acertada entre Fisco e empresas").
 */
import {
  fmtCep, fmtChave, fmtData, fmtDocumento, fmtFone, fmtHora, fmtNumero, limparTexto,
} from './formatos-danfe';
import { DocumentoMdfe, MdfeLido, VeiculoMdfe, lerMdfe } from './mdfe-leitor';
import {
  A4, Alinhamento, NEGRITO, NORMAL, OpcoesPdf, Pintor, marcaDagua, montarPdf, prefixoQueCabe,
} from './pintor';
import { matrizQr } from './qr';
import { plural } from '../../common/plural';

/** Opções do DAMDFE: as comuns a todos os PDF (cancelada, denegada e semCompressao); denegada não se aplica ao MDF-e. */
export type OpcoesDamdfe = OpcoesPdf;

const MX = 14;
const LARGURA = A4.largura - 2 * MX;
const TOPO = 14;
const LIMITE_Y = 806;
const RODAPE_Y = 824;
const ESPACO = 4;

/** Mais que isso de chaves a lista de documentos não é impressa: o resto fica só no XML. */
const LIMITE_CHAVES = 5000;
/** Linhas de uma tabela de itens (vagões, seguros, contratantes...) além das quais o resto fica só no XML. */
const LIMITE_LINHAS = 400;
const LIMITE_TEXTO_ADICIONAL = 20000;

const TAM_CELULA = 6.6;
const TAM_DETALHE = 6.1;
const TAM_CHAVE = 6.2;
const H_TITULO = 8.5;
const H_CABECALHO = 10.5;
/** Folga entre a régua da base das células e a primeira linha do texto de detalhe (proprietário do veículo, componentes do frete...). */
const FOLGA_DETALHE = 2;

// ── Valores de domínio do Anexo I (leiaute 3.00b) ───────────────────

const TIPO_EMITENTE: Record<string, string> = {
  '1': 'Prestador de serviço de transporte', '2': 'Transportador de carga própria', '3': 'Prestador de serviço de transporte (CT-e globalizado)',
};
const TIPO_TRANSPORTADOR: Record<string, string> = { '1': 'ETC', '2': 'TAC', '3': 'CTC' };
const FORMA_EMISSAO: Record<string, string> = { '1': 'Normal', '2': 'Contingência off-line', '3': 'Regime especial NFF' };
const TIPO_CARGA: Record<string, string> = {
  '01': 'Granel sólido', '02': 'Granel líquido', '03': 'Frigorificada', '04': 'Conteinerizada', '05': 'Carga geral', '06': 'Neogranel',
  '07': 'Perigosa (granel sólido)', '08': 'Perigosa (granel líquido)', '09': 'Perigosa (carga frigorificada)', '10': 'Perigosa (conteinerizada)', '11': 'Perigosa (carga geral)',
};
const RESPONSAVEL_SEGURO: Record<string, string> = { '1': 'Emitente do MDF-e', '2': 'Contratante do serviço de transporte' };
const TIPO_VALE_PEDAGIO: Record<string, string> = { '01': 'TAG', '02': 'Cupom', '03': 'Cartão' };
const TIPO_COMPONENTE: Record<string, string> = { '01': 'Vale-pedágio', '02': 'Impostos, taxas e contribuições', '03': 'Despesas (bancárias, meios de pagamento, outras)', '99': 'Outros' };
const FORMA_PAGAMENTO: Record<string, string> = { '0': 'À vista', '1': 'A prazo' };
const TIPO_PROPRIETARIO: Record<string, string> = { '0': 'TAC agregado', '1': 'TAC independente', '2': 'Outros' };
const TIPO_NAVEGACAO: Record<string, string> = { '0': 'Interior', '1': 'Cabotagem' };
const TIPO_UNIDADE_CARGA: Record<string, string> = { '1': 'Container', '2': 'ULD', '3': 'Pallet', '4': 'Outros' };
const TIPO_UNIDADE_TRANSPORTE: Record<string, string> = { '1': 'Rodoviário tração', '2': 'Rodoviário reboque' };
const TITULO_MODAL: Record<string, string> = { RODOVIARIO: 'Modal Rodoviário de Carga', AEREO: 'Modal Aéreo de Carga', AQUAVIARIO: 'Modal Aquaviário de Carga', FERROVIARIO: 'Modal Ferroviário de Carga' };

const L = (t: string | undefined): string => limparTexto(t);
/** Descrição do código de domínio; o código que a tabela não conhece (versão nova do leiaute) sai como veio, limpo de caracteres que o PDF não desenha. */
const rotuloDe = (tabela: Record<string, string>, codigo: string): string => (codigo ? tabela[codigo] ?? L(codigo) : '');

// ── Formatos ─────────────────────────────────────────────────────────

const dataHora = (iso: string): string => [fmtData(iso), fmtHora(iso)].filter(Boolean).join(' ');
/** Fuso do instante como está no XML ("-03:00"); o modelo do Anexo II mostra o protocolo com ele. */
const fusoDe = (iso: string): string => /([+-]\d{2}:\d{2})$/.exec(iso)?.[1] ?? '';
const fmtNcm = (ncm: string): string => (/^[0-9]{8}$/.test(ncm) ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : ncm);
const rotuloDocumento = (doc: string): string => (doc.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ');
const inteiro = (v: string): string => fmtNumero(v, 0, 0);
/** Peso e quantidades do XML trazem até 4 casas; o DAMDFE mostra no mínimo 2 ("2.890,00"). */
const peso = (v: string): string => fmtNumero(v, 2, 4);
const unidadePeso = (unidade: string): string => (unidade === '02' ? 'TON' : unidade === '01' ? 'KG' : '');

function limitar<T>(lista: T[], max: number): { itens: T[]; omitidas: number } {
  return { itens: lista.slice(0, max), omitidas: Math.max(0, lista.length - max) };
}

// ── Contexto e quebra de página ──────────────────────────────────────

interface Folha { x: number; y: number; w: number }
interface Ctx { doc: PDFKit.PDFDocument; p: Pintor; m: MdfeLido; y: number; folhas: Folha[] }

/** Nova página com um cabeçalho curto (emitente, número, chave e a folha n/N) no topo. */
function novaPagina(c: Ctx): void {
  const { p, m } = c;
  c.doc.addPage();
  const h = 36;
  p.caixa(MX, TOPO, LARGURA, h);
  p.texto(L(m.emitente.nome), MX + 5, TOPO + 5, 390, { fonte: NEGRITO, tam: 8.5 });
  p.texto('DAMDFE - Documento Auxiliar de Manifesto Eletrônico de Documentos Fiscais (continuação)', MX + 5, TOPO + 17, 390, { tam: 6.6 });
  p.texto(`Chave de acesso: ${fmtChave(m.chave)}`, MX + 5, TOPO + 26, 390, { tam: 6.6 });
  p.texto(`MDF-e Nº ${L(m.numero)}   SÉRIE ${L(m.serie)}`, MX + 400, TOPO + 6, LARGURA - 405, { fonte: NEGRITO, tam: 8, alinhar: 'right' });
  c.folhas.push({ x: MX + 400, y: TOPO + 20, w: LARGURA - 405 });
  c.y = TOPO + h + 6;
}

function garantir(c: Ctx, altura: number): void {
  if (c.y + altura > LIMITE_Y) novaPagina(c);
}

// ── Tabelas ──────────────────────────────────────────────────────────

interface Coluna { rotulo: string; w: number; alinhar?: Alinhamento; negrito?: boolean }
interface Linha { celulas: string[]; detalhe?: string }
interface Lado { x: number; w: number; titulo: string; colunas: Coluna[]; linhas: Linha[] }

/** A última coluna completa a largura da tabela. */
function colunasNaLargura(colunas: Coluna[], w: number): Coluna[] {
  const fixa = colunas.slice(0, -1).reduce((acc, col) => acc + col.w, 0);
  return colunas.map((col, i) => (i === colunas.length - 1 ? { ...col, w: Math.max(w - fixa, 20) } : col));
}

function medirLinha(p: Pintor, colunas: Coluna[], linha: Linha, largura: number): { celulas: number; detalhe: number; total: number } {
  const uma = p.altura('A', 100, TAM_CELULA);
  let celulas = uma;
  colunas.forEach((col, i) => {
    celulas = Math.max(celulas, Math.min(p.altura(L(linha.celulas[i]), col.w - 4, TAM_CELULA, col.negrito ? NEGRITO : NORMAL), 5 * uma));
  });
  const detalhe = linha.detalhe ? Math.min(p.altura(linha.detalhe, largura - 4, TAM_DETALHE), 8 * p.altura('A', 100, TAM_DETALHE)) : 0;
  // A linha tem a parte das células (texto + 2 pt de folga em cima e embaixo) e, se houver, o texto de detalhe numa faixa própria.
  return { celulas, detalhe, total: celulas + 4 + (detalhe ? FOLGA_DETALHE + detalhe + 1.5 : 0) };
}

function alturaDaTabela(p: Pintor, lado: Lado): number {
  if (!lado.linhas.length) return 0;
  const colunas = colunasNaLargura(lado.colunas, lado.w);
  return H_TITULO + H_CABECALHO + lado.linhas.reduce((acc, l) => acc + medirLinha(p, colunas, l, lado.w).total, 0);
}

/**
 * Tabela com título, cabeçalho de colunas e uma linha de texto por registro (células que passam da largura quebram em até
 * cinco linhas; o `detalhe` é um texto menor sob a linha, na largura toda). Com `quebra` a tabela segue na página seguinte,
 * repetindo o título; sem ela, quem chama garante o espaço (blocos lado a lado).
 */
function desenharTabela(c: Ctx, lado: Lado, quebra = true): void {
  if (!lado.linhas.length) return;
  const { p, doc } = c;
  const { x: x0, w, titulo } = lado;
  const colunas = colunasNaLargura(lado.colunas, w);
  let topo = 0;
  /** Divisórias das colunas entre `de` e `ate` (as da linha de rótulos e as da parte de células de cada linha). */
  const divisorias = (de: number, ate: number) => {
    let x = x0;
    colunas.slice(0, -1).forEach((col) => { x += col.w; p.linha(x, de, x, ate); });
  };
  const abrir = (t: string) => {
    p.texto(t, x0, c.y, w, { fonte: NEGRITO, tam: 6.5 });
    c.y += H_TITULO;
    topo = c.y;
    let x = x0;
    colunas.forEach((col) => {
      p.texto(col.rotulo, x + 2, c.y + 1.8, col.w - 4, { tam: 4.8, cor: '#333', alinhar: col.alinhar });
      x += col.w;
    });
    divisorias(c.y, c.y + H_CABECALHO);
    c.y += H_CABECALHO;
    p.linha(x0, c.y, x0 + w, c.y);
  };
  const fechar = () => p.caixa(x0, topo, w, c.y - topo);

  // O título e o cabeçalho não ficam sozinhos no pé da página: a primeira linha vem junto.
  if (quebra) garantir(c, H_TITULO + H_CABECALHO + medirLinha(p, colunas, lado.linhas[0], w).total);
  abrir(titulo);
  lado.linhas.forEach((linha, idx) => {
    const medida = medirLinha(p, colunas, linha, w);
    if (quebra && c.y + medida.total > LIMITE_Y) {
      fechar();
      novaPagina(c);
      abrir(`${titulo} (continuação)`);
    }
    let x = x0;
    colunas.forEach((col, i) => {
      const texto = L(linha.celulas[i]);
      const varias = p.altura(texto, col.w - 4, TAM_CELULA, col.negrito ? NEGRITO : NORMAL) > p.altura('A', 100, TAM_CELULA) * 1.5;
      // A folga de 1,5 pt evita que o pdfkit ponha reticências numa linha que cabe (ele compara alturas com ponto flutuante).
      p.texto(texto, x + 2, c.y + 2, col.w - 4, { tam: TAM_CELULA, alinhar: col.alinhar, fonte: col.negrito ? NEGRITO : NORMAL, altura: varias ? medida.celulas + 1.5 : undefined });
      x += col.w;
    });
    // As divisórias terminam na base da parte das células. O texto de detalhe fica abaixo de uma régua clara, na largura toda,
    // como uma célula só: nenhuma divisória entra nele nem encosta nas letras.
    const base = c.y + medida.celulas + 4;
    divisorias(c.y, base);
    if (linha.detalhe) {
      doc.lineWidth(0.3).strokeColor('#aaa').moveTo(x0, base).lineTo(x0 + w, base).stroke();
      p.texto(linha.detalhe, x0 + 2, base + FOLGA_DETALHE, w - 4, { tam: TAM_DETALHE, cor: '#333', altura: medida.detalhe + 1.5 });
    }
    c.y += medida.total;
    if (idx < lado.linhas.length - 1) doc.lineWidth(0.3).strokeColor('#aaa').moveTo(x0, c.y).lineTo(x0 + w, c.y).stroke();
  });
  fechar();
  c.y += ESPACO;
}

/** Tabelas lado a lado (as duas na mesma página); o bloco termina onde acaba a mais alta. */
function tabelasLadoALado(c: Ctx, lados: Lado[]): void {
  const presentes = lados.filter((l) => l.linhas.length);
  if (!presentes.length) return;
  garantir(c, Math.max(...presentes.map((l) => alturaDaTabela(c.p, l))));
  const y0 = c.y;
  let yFim = y0;
  presentes.forEach((lado) => {
    c.y = y0;
    desenharTabela(c, lado, false);
    yFim = Math.max(yFim, c.y);
  });
  c.y = yFim;
}

/** Nota que fecha uma lista cortada em `LIMITE_LINHAS`. */
const linhaOmitidas = (omitidas: number, colunas: number): Linha[] => (omitidas
  ? [{ celulas: [`… demais ${plural(omitidas, 'registro', 'registros')} no XML`, ...Array(colunas - 1).fill('')] }]
  : []);

// ── Campos e textos ──────────────────────────────────────────────────

type Celula = { w: number; rotulo: string; valor: string; alinhar?: Alinhamento; negrito?: boolean; multilinha?: boolean };

/** Linha de campos cuja altura cresce com o texto das células `multilinha`. */
function linhaDeCamposAuto(c: Ctx, entrada: Celula[]): void {
  const { p } = c;
  const celulas = entrada.map((cel) => ({ ...cel, valor: L(cel.valor) }));
  const fixa = celulas.slice(0, -1).reduce((acc, cel) => acc + cel.w, 0);
  let h = 22;
  celulas.forEach((cel, i) => {
    const w = i === celulas.length - 1 ? LARGURA - fixa : cel.w;
    if (cel.multilinha) h = Math.max(h, Math.min(p.altura(cel.valor, w - 4, 7.5, cel.negrito ? NEGRITO : NORMAL), 60) + 11);
  });
  garantir(c, h);
  c.y = p.linhaDeCampos(c.y, h, celulas);
}

/** Caixa com rótulo e texto que quebra em linhas e, se for longo, continua nas páginas seguintes. */
function paragrafo(c: Ctx, rotulo: string, texto: string, minimo = 0, tam = 6.8): void {
  const { p } = c;
  let resto = texto;
  let continua = false;
  for (;;) {
    if (LIMITE_Y - c.y < 34) novaPagina(c);
    const disponivel = LIMITE_Y - c.y;
    const necessaria = Math.max(p.altura(resto || ' ', LARGURA - 6, tam) + 11, minimo);
    const cabe = necessaria <= disponivel;
    const hCaixa = cabe ? necessaria : disponivel;
    const corte = cabe ? resto.length : prefixoQueCabe(p, resto, LARGURA - 6, hCaixa - 11, tam);
    p.caixa(MX, c.y, LARGURA, hCaixa);
    p.texto(continua ? `${rotulo} (continuação)` : rotulo, MX + 2, c.y + 1.6, LARGURA - 4, { tam: 4.8, cor: '#333' });
    p.texto(resto.slice(0, corte), MX + 3, c.y + 8, LARGURA - 6, { tam, altura: hCaixa - 10 });
    c.y += hCaixa;
    resto = resto.slice(corte).trimStart();
    if (!resto || corte <= 0) break;
    continua = true;
    novaPagina(c);
  }
  c.y += ESPACO;
}

// ── Primeira página: o leiaute padrão do Anexo II ────────────────────

/** O QR Code só entra se o texto couber num QR Code (o schema limita a 1.000 caracteres; folga larga). */
function qrValido(texto: string): boolean {
  if (!texto) return false;
  try {
    matrizQr(texto);
    return true;
  } catch {
    return false;
  }
}

function protocolo(c: Ctx, x: number, y: number, w: number, h: number): void {
  const { p, doc, m } = c;
  p.caixa(x, y, w, h);
  p.texto('PROTOCOLO DE AUTORIZAÇÃO DE USO', x + 2, y + 1.6, w - 4, { tam: 4.8, cor: '#333' });
  const prot = m.protocolo;
  const linhaProtocolo = prot?.numero ? L(`${prot.numero} - ${fmtData(prot.dataHora)} às ${fmtHora(prot.dataHora)}${fusoDe(prot.dataHora)}`) : '';
  let yy = y + 8.4;
  if (m.formaEmissao === '2') {
    // Item 2.5 do Anexo II: o texto vai em destaque (branco sobre preto, como no modelo) no lugar do protocolo.
    doc.rect(x + 2, yy, w - 4, 19).fill('#000');
    const emissao = dataHora(m.dataEmissao).slice(0, 16);
    p.texto(`EMISSÃO EM CONTINGÊNCIA. Obrigatória a autorização em 168 horas após esta emissão${emissao ? ` (${emissao})` : ''}`, x + 4.5, yy + 2.6, w - 9, { fonte: NEGRITO, tam: 5.9, cor: '#fff', altura: 15.5 });
    yy += 20.5;
  }
  if (m.homologacao) {
    // Item 2.6 do Anexo II: texto centralizado e em caixa alta (junto com o aviso de contingência, se os dois valerem).
    p.texto('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL', x + 2, yy + 1, w - 4, { fonte: NEGRITO, tam: 7, alinhar: 'center' });
    yy += 11;
  }
  if (linhaProtocolo) p.texto(linhaProtocolo, x + 3, yy + 1, w - 6, { tam: 7.5, fonte: m.formaEmissao === '2' || m.homologacao ? NORMAL : NEGRITO });
}

function chaveDeAcesso(c: Ctx, x: number, y: number, w: number, h: number): void {
  const { p, m } = c;
  p.caixa(x, y, w, h);
  p.texto('CONTROLE DO FISCO', x, y + 2, w, { tam: 4.8, cor: '#333', alinhar: 'center' });
  // Item 2.3 do Anexo II: altura de 1,5 a 2,5 cm e módulo de até 0,03 cm (297 módulos em 9 cm); 235 pt dão 0,848 pt por módulo.
  const larguraBarras = 235;
  p.codigoDeBarras(x + (w - larguraBarras) / 2, y + 10, larguraBarras, 44, m.chave);
  p.texto('CHAVE DE ACESSO', x + 3, y + 60, w - 6, { tam: 4.8, cor: '#333' });
  p.texto(fmtChave(m.chave), x + 3, y + 67, w - 6, { fonte: NEGRITO, tam: 8.2, alinhar: 'center' });
  p.linha(x, y + h - 14, x + w, y + h - 14);
  p.texto('Consulte em https://dfe-portal.svrs.rs.gov.br/MDFe/consulta', x + 3, y + h - 10.5, w - 6, { tam: 6.2, alinhar: 'center' });
}

/** Desenha o topo da primeira página (leiaute padrão do Anexo II) e deixa `c.y` onde começam os blocos seguintes. */
function cabecalho(c: Ctx): void {
  const { p, doc, m } = c;
  const e = m.emitente;
  const comQr = qrValido(m.qrCode);
  // QR Code de 24 mm de conteúdo com 3 mm de margem de silêncio em volta (item 2.4: mínimo de 25 x 25 mm no total).
  const W_QR = 85;
  const wEsq = comQr ? LARGURA - W_QR - 6 : LARGURA;
  const pEsq = new Pintor(doc, MX, wEsq);

  // emitente
  const nome = L(e.nome);
  const hNome = Math.min(p.altura(nome, wEsq - 12, 10, NEGRITO), 24);
  const hEmit = Math.max(52, 6 + hNome + 3 + 27 + 4);
  p.caixa(MX, TOPO, wEsq, hEmit);
  p.texto(nome, MX + 6, TOPO + 6, wEsq - 12, { fonte: NEGRITO, tam: 10, altura: 24 });
  const end = e.endereco;
  const rua = [[end.logradouro, end.numero].filter(Boolean).join(', ') + (end.complemento ? ` - ${end.complemento}` : ''), end.bairro].filter(Boolean).join(' - ');
  const cidade = [[end.municipio, end.uf].filter(Boolean).join(' - '), end.cep ? `CEP ${fmtCep(end.cep)}` : '', end.fone ? `Fone: ${fmtFone(end.fone)}` : ''].filter(Boolean).join('   ');
  const ids = [e.documento ? `${rotuloDocumento(e.documento)}: ${L(fmtDocumento(e.documento))}` : '', e.ie ? `IE: ${L(e.ie)}` : '', m.rodoviario?.rntrc ? `RNTRC: ${L(m.rodoviario.rntrc)}` : ''].filter(Boolean).join('   ');
  let yy = TOPO + 6 + hNome + 3;
  p.texto(L(rua), MX + 6, yy, wEsq - 12, { tam: 7 });
  p.texto(L(cidade), MX + 6, yy + 9, wEsq - 12, { tam: 7 });
  p.texto(ids, MX + 6, yy + 18, wEsq - 12, { fonte: NEGRITO, tam: 7.5 });

  if (comQr) p.qrCode(MX + LARGURA - W_QR + 8.5, TOPO + 8.5, 68, m.qrCode);

  // título e identificação
  yy = TOPO + hEmit + 4;
  p.texto('DAMDFE - Documento Auxiliar de Manifesto Eletrônico de Documentos Fiscais', MX, yy, wEsq, { fonte: NEGRITO, tam: 8.2 });
  yy += 11;
  pEsq.linhaDeCampos(yy, 22, [
    { w: 36, rotulo: 'MODELO', valor: L(m.modelo) },
    { w: 36, rotulo: 'SÉRIE', valor: L(m.serie) },
    { w: 62, rotulo: 'NÚMERO', valor: L(m.numero), negrito: true },
    { w: 42, rotulo: 'FL', valor: '' },
    { w: 100, rotulo: 'DATA E HORA DE EMISSÃO', valor: dataHora(m.dataEmissao), negrito: true },
    { w: 52, rotulo: 'UF CARREG.', valor: L(m.ufCarregamento), negrito: true },
    { w: 56, rotulo: 'UF DESCARREG.', valor: L(m.ufDescarregamento), negrito: true },
    { w: 0, rotulo: 'INÍCIO DA VIAGEM', valor: dataHora(m.dataInicioViagem) },
  ]);
  c.folhas.push({ x: MX + 36 + 36 + 62, y: yy, w: 42 });
  // A margem de silêncio de baixo do QR Code (99 pt do topo) também vale para a caixa do código de barras.
  const yZona = Math.max(yy + 22, TOPO + 99) + 5;

  // quantidades e peso (esquerda) e código de barras (direita)
  const wL = 268;
  const xR = MX + wL + 6;
  const wR = LARGURA - wL - 6;
  // Contingência em ambiente de homologação leva os dois avisos do Anexo II (itens 2.5 e 2.6) mais o protocolo.
  const hZona = m.formaEmissao === '2' && m.homologacao ? 106 : 92;
  const pL = new Pintor(doc, MX, wL);
  const t = m.totais;
  const contar = (tipo: DocumentoMdfe['tipo']): string => (m.temInfDoc ? String(m.municipiosDescarga.reduce((acc, mun) => acc + mun.documentos.filter((d) => d.tipo === tipo).length, 0)) : '');
  const qtdCte = L(t.qtdCte) || contar('CTE');
  const qtdNfe = L(t.qtdNfe) || contar('NFE');
  const qtdMdfe = L(t.qtdMdfe) || (m.modal === 'AQUAVIARIO' ? contar('MDFE') : '');
  const unidade = unidadePeso(t.unidade);
  let y = pL.titulo(TITULO_MODAL[m.modal] ?? 'Modal de Carga', yZona);
  const doisPrimeiros = qtdMdfe ? 52 : 62;
  y = pL.linhaDeCampos(y, 22, [
    { w: doisPrimeiros, rotulo: 'QTD. CT-e', valor: qtdCte, alinhar: 'right' },
    { w: doisPrimeiros, rotulo: 'QTD. NF-e', valor: qtdNfe, alinhar: 'right' },
    ...(qtdMdfe ? [{ w: 52, rotulo: 'QTD. MDF-e', valor: qtdMdfe, alinhar: 'right' as Alinhamento }] : []),
    { w: 0, rotulo: unidade ? `PESO TOTAL (${unidade})` : 'PESO TOTAL', valor: L(peso(t.pesoCarga)), alinhar: 'right', negrito: true },
  ]);
  y = pL.linhaDeCampos(y, 22, [{ w: 0, rotulo: 'VALOR TOTAL DA CARGA (R$)', valor: L(fmtNumero(t.valorCarga)), alinhar: 'right', negrito: true }]);
  protocolo(c, MX, y, wL, yZona + hZona - y);
  chaveDeAcesso(c, xR, yZona, wR, hZona);
  c.y = yZona + hZona + 6;
}

// ── Blocos do modal ──────────────────────────────────────────────────

function blocoRodoviario(c: Ctx): void {
  const r = c.m.rodoviario;
  if (!r) return;
  const m = c.m;

  const veiculos = limitar(r.veiculos, 4).itens;
  const linhasVeiculo = veiculos.map((v: VeiculoMdfe): Linha => {
    const dono = v.proprietario;
    const donoTexto = dono
      ? `Proprietário: ${[dono.nome, dono.documento ? fmtDocumento(dono.documento) : '', dono.rntrc ? `RNTRC ${dono.rntrc}` : '', rotuloDe(TIPO_PROPRIETARIO, dono.tipo)].filter(Boolean).join(' - ')}`
      : '';
    return {
      // O RNTRC do veículo é o do proprietário quando o veículo não é do emitente; senão, o do emitente.
      celulas: [v.tipo === 'TRACAO' ? 'Tração' : 'Reboque', v.placa, v.uf, v.proprietario?.rntrc || r.rntrc, inteiro(v.tara), inteiro(v.capacidadeKg), inteiro(v.capacidadeM3)],
      detalhe: donoTexto ? limparTexto(donoTexto) : undefined,
    };
  });
  const condutores = limitar(r.condutores, 10).itens.map((cd): Linha => ({ celulas: [fmtDocumento(cd.cpf), cd.nome] }));
  const wEsq = 300;
  tabelasLadoALado(c, [
    {
      x: MX, w: wEsq, titulo: 'VEÍCULO', linhas: linhasVeiculo,
      colunas: [
        { rotulo: 'TIPO', w: 38 }, { rotulo: 'PLACA', w: 48, negrito: true }, { rotulo: 'UF', w: 22 }, { rotulo: 'RNTRC', w: 52 },
        { rotulo: 'TARA (KG)', w: 44, alinhar: 'right' }, { rotulo: 'CAP. (KG)', w: 50, alinhar: 'right' }, { rotulo: 'CAP. (M³)', w: 46, alinhar: 'right' },
      ],
    },
    { x: MX + wEsq + 6, w: LARGURA - wEsq - 6, titulo: 'CONDUTOR', linhas: condutores, colunas: [{ rotulo: 'CPF', w: 70 }, { rotulo: 'NOME', w: 100 }] },
  ]);

  const vales = limitar(r.valesPedagio, 12);
  const linhasVale = [
    ...vales.itens.map((d): Linha => ({
      celulas: [fmtDocumento(d.responsavel || m.emitente.documento), fmtDocumento(d.fornecedor), d.comprovante, rotuloDe(TIPO_VALE_PEDAGIO, d.tipo), fmtNumero(d.valor)],
    })),
    ...linhaOmitidas(vales.omitidas, 5),
  ];
  const ciots = limitar(r.ciots, 12);
  const linhasCiot = [
    ...ciots.itens.map((ct): Linha => ({ celulas: [ct.ciot, ct.documento ? fmtDocumento(ct.documento) : ''] })),
    ...linhaOmitidas(ciots.omitidas, 2),
  ];
  tabelasLadoALado(c, [
    {
      x: MX, w: wEsq, titulo: 'VALE-PEDÁGIO', linhas: linhasVale,
      colunas: [
        { rotulo: 'RESPONSÁVEL (CNPJ/CPF)', w: 76 }, { rotulo: 'FORNECEDORA (CNPJ)', w: 76 }, { rotulo: 'Nº DO COMPROVANTE', w: 72 },
        { rotulo: 'TIPO', w: 32 }, { rotulo: 'VALOR (R$)', w: 44, alinhar: 'right' },
      ],
    },
    { x: MX + wEsq + 6, w: LARGURA - wEsq - 6, titulo: 'CIOT', linhas: linhasCiot, colunas: [{ rotulo: 'CIOT', w: 90 }, { rotulo: 'RESPONSÁVEL PELA GERAÇÃO (CNPJ/CPF)', w: 170 }] },
  ]);

  const contratantes = limitar(r.contratantes, LIMITE_LINHAS);
  desenharTabela(c, {
    x: MX, w: LARGURA, titulo: 'CONTRATANTE DO SERVIÇO DE TRANSPORTE',
    colunas: [{ rotulo: 'NOME / RAZÃO SOCIAL', w: 255 }, { rotulo: 'CNPJ / CPF', w: 105 }, { rotulo: 'Nº DO CONTRATO', w: 100 }, { rotulo: 'VALOR GLOBAL DO CONTRATO (R$)', w: 107, alinhar: 'right' }],
    linhas: [
      ...contratantes.itens.map((ct): Linha => ({ celulas: [ct.nome, ct.documento ? fmtDocumento(ct.documento) : '', ct.numeroContrato, fmtNumero(ct.valorContrato)] })),
      ...linhaOmitidas(contratantes.omitidas, 4),
    ],
  });

  const pagamentos = limitar(r.pagamentos, LIMITE_LINHAS);
  desenharTabela(c, {
    x: MX, w: LARGURA, titulo: 'PAGAMENTO DO FRETE',
    colunas: [
      { rotulo: 'RESPONSÁVEL PELO PAGAMENTO', w: 215 }, { rotulo: 'CNPJ / CPF', w: 100 }, { rotulo: 'VALOR DO CONTRATO (R$)', w: 85, alinhar: 'right' },
      { rotulo: 'FORMA DE PAGAMENTO', w: 70 }, { rotulo: 'ADIANTAMENTO (R$)', w: 97, alinhar: 'right' },
    ],
    linhas: [
      ...pagamentos.itens.map((pg): Linha => {
        const detalhes: string[] = [];
        if (pg.componentes.length) {
          detalhes.push(`Componentes do frete: ${pg.componentes.map((cp) => `${rotuloDe(TIPO_COMPONENTE, cp.tipo)}${cp.descricao ? ` (${cp.descricao})` : ''} R$ ${fmtNumero(cp.valor)}`).join('; ')}.`);
        }
        if (pg.parcelas.length) {
          detalhes.push(`Parcelas: ${limitar(pg.parcelas, 24).itens.map((pc) => `${pc.numero} - ${fmtData(pc.vencimento)} - R$ ${fmtNumero(pc.valor)}`).join('; ')}.`);
        }
        if (pg.banco) {
          const via = [pg.banco.banco ? `banco ${pg.banco.banco}${pg.banco.agencia ? `, agência ${pg.banco.agencia}` : ''}` : '', pg.banco.ipef ? `IPEF ${fmtDocumento(pg.banco.ipef)}` : '', pg.banco.pix ? `chave PIX ${pg.banco.pix}` : ''].filter(Boolean).join('; ');
          if (via) detalhes.push(`Pagamento via ${via}.`);
        }
        if (pg.altoDesempenho) detalhes.push('Operação de transporte de alto desempenho.');
        return {
          celulas: [pg.nome, pg.documento ? fmtDocumento(pg.documento) : '', fmtNumero(pg.valorContrato), rotuloDe(FORMA_PAGAMENTO, pg.formaPagamento), fmtNumero(pg.adiantamento)],
          detalhe: detalhes.length ? limparTexto(detalhes.join('\n'), true) : undefined,
        };
      }),
      ...linhaOmitidas(pagamentos.omitidas, 5),
    ],
  });
}

function blocoAereo(c: Ctx): void {
  const a = c.m.aereo;
  if (!a) return;
  c.y = c.p.titulo('AERONAVE / VOO / AERÓDROMO', c.y);
  linhaDeCamposAuto(c, [
    { w: 95, rotulo: 'MARCA DE NACIONALIDADE', valor: L(a.marcaNacionalidade), negrito: true },
    { w: 95, rotulo: 'MARCA DE MATRÍCULA', valor: L(a.marcaMatricula), negrito: true },
    { w: 95, rotulo: 'NÚMERO DO VOO', valor: L(a.numeroVoo), negrito: true },
    { w: 95, rotulo: 'DATA DO VOO', valor: fmtData(a.dataVoo) },
    { w: 95, rotulo: 'AERÓDROMO DE EMBARQUE', valor: L(a.aerodromoEmbarque), negrito: true },
    { w: 0, rotulo: 'AERÓDROMO DE DESTINO', valor: L(a.aerodromoDestino), negrito: true },
  ]);
  c.y += ESPACO;
}

function blocoFerroviario(c: Ctx): void {
  const f = c.m.ferroviario;
  if (!f) return;
  c.y = c.p.titulo('INFORMAÇÕES DA COMPOSIÇÃO DO TREM', c.y);
  linhaDeCamposAuto(c, [
    { w: 100, rotulo: 'PREFIXO DO TREM', valor: L(f.prefixo), negrito: true },
    { w: 140, rotulo: 'DATA E HORA DE LIBERAÇÃO', valor: dataHora(f.dataHoraLiberacao) },
    { w: 100, rotulo: 'ORIGEM DO TREM', valor: L(f.origem) },
    { w: 100, rotulo: 'DESTINO DO TREM', valor: L(f.destino) },
    { w: 0, rotulo: 'QTD. DE VAGÕES CARREGADOS', valor: L(f.quantidadeVagoes), alinhar: 'right' },
  ]);
  c.y += ESPACO;
  const vagoes = limitar(f.vagoes, LIMITE_LINHAS);
  desenharTabela(c, {
    x: MX, w: LARGURA, titulo: 'INFORMAÇÕES DOS VAGÕES',
    colunas: [
      { rotulo: 'SEQ.', w: 40 }, { rotulo: 'SÉRIE DE IDENT.', w: 80 }, { rotulo: 'NÚM. IDENT.', w: 90 }, { rotulo: 'TIPO', w: 120 },
      { rotulo: 'PESO BASE DE CÁLC. DO FRETE (T)', w: 90, alinhar: 'right' }, { rotulo: 'PESO REAL (T)', w: 70, alinhar: 'right' }, { rotulo: 'TON. ÚTIL', w: 77, alinhar: 'right' },
    ],
    linhas: [
      ...vagoes.itens.map((v): Linha => ({ celulas: [v.sequencia, v.serie, v.numero, v.tipo, fmtNumero(v.pesoBaseCalculo, 3), fmtNumero(v.pesoReal, 3), fmtNumero(v.toneladaUtil, 3)] })),
      ...linhaOmitidas(vagoes.omitidas, 7),
    ],
  });
}

function blocoAquaviario(c: Ctx): void {
  const a = c.m.aquaviario;
  if (!a) return;
  c.y = c.p.titulo('EMBARCAÇÃO E NAVEGAÇÃO', c.y);
  linhaDeCamposAuto(c, [
    { w: 80, rotulo: 'CÓDIGO DA EMBARCAÇÃO', valor: L(a.codigoEmbarcacao), negrito: true },
    { w: 200, rotulo: 'NOME DA EMBARCAÇÃO', valor: L(a.nomeEmbarcacao), negrito: true },
    { w: 60, rotulo: 'IRIN', valor: L(a.irin) },
    { w: 70, rotulo: 'TIPO DE EMBARCAÇÃO', valor: L(a.tipoEmbarcacao) },
    { w: 0, rotulo: 'Nº DA VIAGEM', valor: L(a.viagem) },
  ]);
  linhaDeCamposAuto(c, [
    { w: 100, rotulo: 'TIPO DE NAVEGAÇÃO', valor: rotuloDe(TIPO_NAVEGACAO, a.tipoNavegacao) },
    { w: 120, rotulo: 'PORTO DE EMBARQUE', valor: L(a.portoEmbarque) },
    { w: 120, rotulo: 'PORTO DE DESTINO', valor: L(a.portoDestino) },
    { w: 0, rotulo: 'PORTO(S) DE TRANSBORDO', valor: L(a.portosTransbordo.join(', ')), multilinha: true },
  ]);
  c.y += ESPACO;
  const terminais = Math.max(a.terminaisCarregamento.length, a.terminaisDescarregamento.length);
  const terminal = (t?: { codigo: string; nome: string }) => (t ? [t.codigo, t.nome].filter(Boolean).join(' - ') : '');
  const limitados = limitar(Array.from({ length: terminais }, (_, i): Linha => ({ celulas: [terminal(a.terminaisCarregamento[i]), terminal(a.terminaisDescarregamento[i])] })), LIMITE_LINHAS);
  desenharTabela(c, {
    x: MX, w: LARGURA, titulo: 'DADOS DO TERMINAL',
    colunas: [{ rotulo: 'CARREGAMENTO', w: LARGURA / 2 }, { rotulo: 'DESCARREGAMENTO', w: LARGURA / 2 }],
    linhas: [...limitados.itens, ...linhaOmitidas(limitados.omitidas, 2)],
  });
  const unidade = (u: { identificacao: string; tipo: string }, tabela: Record<string, string>) => `${u.identificacao}${u.tipo ? ` (${rotuloDe(tabela, u.tipo)})` : ''}`;
  const comboio = a.comboio.map((b) => [b.codigo, b.balsa].filter(Boolean).join(' - ')).join('; ');
  const cargaVazia = a.unidadesCargaVazias.map((u) => unidade(u, TIPO_UNIDADE_CARGA)).join('; ');
  const transporteVazio = a.unidadesTransporteVazias.map((u) => unidade(u, TIPO_UNIDADE_TRANSPORTE)).join('; ');
  if (comboio || cargaVazia || transporteVazio) {
    linhaDeCamposAuto(c, [
      { w: 220, rotulo: 'EMBARCAÇÕES DO COMBOIO', valor: L(comboio), multilinha: true },
      { w: 170, rotulo: 'UNIDADES DE CARGA VAZIAS', valor: L(cargaVazia), multilinha: true },
      { w: 0, rotulo: 'UNIDADES DE TRANSPORTE VAZIAS', valor: L(transporteVazio), multilinha: true },
    ]);
    c.y += ESPACO;
  }
}

// ── Blocos comuns ────────────────────────────────────────────────────

function blocoSeguro(c: Ctx): void {
  const seguros = limitar(c.m.seguros, LIMITE_LINHAS);
  desenharTabela(c, {
    x: MX, w: LARGURA, titulo: 'SEGURO DA CARGA',
    colunas: [
      { rotulo: 'RESPONSÁVEL PELO SEGURO', w: 130 }, { rotulo: 'SEGURADORA', w: 140 }, { rotulo: 'CNPJ DA SEGURADORA', w: 85 },
      { rotulo: 'Nº DA APÓLICE', w: 85 }, { rotulo: 'Nº DA AVERBAÇÃO', w: 127 },
    ],
    linhas: [
      ...seguros.itens.map((s): Linha => ({
        celulas: [
          [rotuloDe(RESPONSAVEL_SEGURO, s.responsavel), s.documentoResponsavel ? fmtDocumento(s.documentoResponsavel) : ''].filter(Boolean).join(' - '),
          s.seguradora, s.cnpjSeguradora ? fmtDocumento(s.cnpjSeguradora) : '', s.apolice, s.averbacoes.join('; '),
        ],
      })),
      ...linhaOmitidas(seguros.omitidas, 5),
    ],
  });
}

function blocoProduto(c: Ctx): void {
  const pr = c.m.produtoPredominante;
  if (!pr) return;
  const lotacao = [pr.localCarregamento ? `carregamento em ${pr.localCarregamento}` : '', pr.localDescarregamento ? `descarregamento em ${pr.localDescarregamento}` : ''].filter(Boolean).join('; ');
  desenharTabela(c, {
    x: MX, w: LARGURA, titulo: 'PRODUTO PREDOMINANTE',
    colunas: [{ rotulo: 'TIPO DE CARGA', w: 130 }, { rotulo: 'PRODUTO', w: 267 }, { rotulo: 'NCM', w: 70 }, { rotulo: 'GTIN', w: 100 }],
    linhas: [{ celulas: [rotuloDe(TIPO_CARGA, pr.tipoCarga), pr.produto, fmtNcm(pr.ncm), pr.gtin], detalhe: lotacao ? limparTexto(`Carga lotação: ${lotacao}.`) : undefined }],
  });
}

function blocoTransporte(c: Ctx): void {
  const m = c.m;
  const percurso = L([m.ufCarregamento, ...m.ufsPercurso, m.ufDescarregamento].filter(Boolean).join(' > '));
  const municipios = m.municipiosCarregamento.map((mun) => L(mun.nome)).filter(Boolean).join('; ');
  const indicadores = [m.canalVerde ? 'Canal Verde' : '', m.cargaPosterior ? 'Carga incluída depois, por evento' : ''].filter(Boolean).join('; ');
  linhaDeCamposAuto(c, [
    { w: 230, rotulo: 'PERCURSO (UF)', valor: percurso, multilinha: true },
    { w: 0, rotulo: 'MUNICÍPIO(S) DE CARREGAMENTO', valor: municipios, multilinha: true },
  ]);
  linhaDeCamposAuto(c, [
    { w: 192, rotulo: 'TIPO DO EMITENTE', valor: rotuloDe(TIPO_EMITENTE, m.tipoEmitente), multilinha: true },
    { w: 78, rotulo: 'TIPO DO TRANSPORTADOR', valor: rotuloDe(TIPO_TRANSPORTADOR, m.tipoTransportador) },
    { w: 100, rotulo: 'FORMA DE EMISSÃO', valor: rotuloDe(FORMA_EMISSAO, m.formaEmissao) },
    { w: 0, rotulo: 'INDICADORES', valor: indicadores, multilinha: true },
  ]);
  c.y += ESPACO;
}

/** Lacres do manifesto e do veículo num texto só; lista absurda (o XML pode ter milhares) é cortada, como o texto livre. */
function listaDeLacres(m: MdfeLido): string {
  const veiculo = m.rodoviario?.lacres ?? [];
  const partes = [m.lacres.length ? m.lacres.join(', ') : '', veiculo.length ? `${m.lacres.length ? 'Do veículo: ' : ''}${veiculo.join(', ')}` : ''].filter(Boolean);
  const texto = L(partes.join('   |   '));
  return texto.length > LIMITE_TEXTO_ADICIONAL ? `${texto.slice(0, LIMITE_TEXTO_ADICIONAL)} … (demais lacres no XML)` : texto;
}

// ── Documentos fiscais por município de descarga ─────────────────────

/** Uma linha da lista: o cabeçalho do município ou até `porLinha` chaves (o tipo do documento vai à esquerda, na primeira linha do grupo). */
type ItemLista = { t: 'mun'; titulo: string; texto: string } | { t: 'chaves'; rotulo: string; primeira: boolean; chaves: string[] };

function montarLista(m: MdfeLido, porLinha: number): { itens: ItemLista[]; omitidas: number } {
  const itens: ItemLista[] = [];
  let listadas = 0;
  let omitidas = 0;
  const tipos: { tipo: DocumentoMdfe['tipo']; rotulo: string }[] = [{ tipo: 'CTE', rotulo: 'CT-e' }, { tipo: 'NFE', rotulo: 'NF-e' }, { tipo: 'MDFE', rotulo: 'MDF-e' }];
  m.municipiosDescarga.forEach((mun) => {
    if (listadas >= LIMITE_CHAVES) {
      omitidas += mun.documentos.length;
      return;
    }
    const resumo = tipos.map((t) => ({ ...t, docs: mun.documentos.filter((d) => d.tipo === t.tipo) })).filter((t) => t.docs.length);
    const contagem = resumo.map((t) => `${t.rotulo}: ${t.docs.length.toLocaleString('pt-BR')}`).join('   ');
    const titulo = `MUNICÍPIO DE DESCARGA: ${L(mun.nome) || '(sem nome)'}`;
    itens.push({ t: 'mun', titulo, texto: `${titulo}${contagem ? `   -   ${contagem}` : '   -   sem documentos fiscais'}` });
    resumo.forEach((t) => {
      const mostrar = t.docs.slice(0, Math.max(0, LIMITE_CHAVES - listadas));
      omitidas += t.docs.length - mostrar.length;
      for (let i = 0; i < mostrar.length; i += porLinha) {
        itens.push({ t: 'chaves', rotulo: t.rotulo, primeira: i === 0, chaves: mostrar.slice(i, i + porLinha).map((d) => d.chave) });
      }
      listadas += mostrar.length;
    });
  });
  return { itens, omitidas };
}

function blocoDocumentos(c: Ctx): void {
  const { p, doc, m } = c;
  const total = m.municipiosDescarga.reduce((acc, mun) => acc + mun.documentos.length, 0);
  if (!total && !m.municipiosDescarga.length) {
    if (m.cargaPosterior) paragrafo(c, 'DOCUMENTOS FISCAIS VINCULADOS AO MANIFESTO', 'MDF-e com carga incluída depois da emissão, por evento de inclusão de DF-e: os documentos fiscais não constam do XML do manifesto.', 22);
    return;
  }
  // Chaves em colunas compactas, com o tipo do documento numa faixa à esquerda (como o "CTe - chave" do modelo do Anexo II).
  const FAIXA_TIPO = 26;
  doc.font(NORMAL).fontSize(TAM_CHAVE);
  const wChave = doc.widthOfString(fmtChave('0'.repeat(44)));
  const disponivel = LARGURA - 8 - FAIXA_TIPO;
  const porLinha = Math.max(1, Math.min(4, Math.floor((disponivel + 10) / (wChave + 10))));
  const passo = porLinha > 1 ? (disponivel - wChave) / (porLinha - 1) : 0;
  const { itens, omitidas } = montarLista(m, porLinha);

  const H = { mun: 12.5, chaves: 7.6 };
  let topo = 0;
  const abrir = (continuacao: boolean) => {
    c.y = p.titulo(continuacao ? 'DOCUMENTOS FISCAIS VINCULADOS AO MANIFESTO (continuação)' : 'DOCUMENTOS FISCAIS VINCULADOS AO MANIFESTO', c.y);
    topo = c.y;
  };
  const fechar = () => {
    c.y += 2;
    p.caixa(MX, topo, LARGURA, c.y - topo);
  };
  const desenharMun = (texto: string) => {
    doc.rect(MX + 0.5, c.y + 0.5, LARGURA - 1, H.mun - 1).fill('#e8e8e8');
    p.texto(texto, MX + 4, c.y + 3, LARGURA - 8, { fonte: NEGRITO, tam: 6.8 });
    c.y += H.mun;
  };

  garantir(c, 8.5 + H.mun + H.chaves + 4);
  abrir(false);
  let municipio = '';
  itens.forEach((item) => {
    // O cabeçalho do município não fica sozinho no pé da página: a primeira linha de chaves vai junto.
    const precisa = item.t === 'mun' ? H.mun + H.chaves : H.chaves;
    let paginaNova = false;
    if (c.y + precisa > LIMITE_Y - 2) {
      fechar();
      novaPagina(c);
      abrir(true);
      paginaNova = true;
      // Quem lê a página nova precisa saber de que município são as chaves que continuam.
      if (item.t === 'chaves' && municipio) desenharMun(`${municipio} (continuação)`);
    }
    if (item.t === 'mun') {
      municipio = item.titulo;
      desenharMun(item.texto);
      return;
    }
    if (item.primeira || paginaNova) p.texto(item.rotulo, MX + 4, c.y + 1, FAIXA_TIPO - 2, { fonte: NEGRITO, tam: 6.2, cor: '#333' });
    item.chaves.forEach((chave, k) => p.texto(fmtChave(chave), MX + 4 + FAIXA_TIPO + k * passo, c.y + 1, wChave + 1, { tam: TAM_CHAVE }));
    c.y += H.chaves;
  });
  if (omitidas) {
    if (c.y + 12 > LIMITE_Y - 2) {
      fechar();
      novaPagina(c);
      abrir(true);
    }
    p.texto(`Lista limitada a ${LIMITE_CHAVES.toLocaleString('pt-BR')} documentos: demais documentos no XML (${omitidas.toLocaleString('pt-BR')} não listados).`, MX + 4, c.y + 3, LARGURA - 8, { fonte: NEGRITO, tam: 6.4 });
    c.y += 12;
  }
  fechar();
  c.y += ESPACO;
}

// ── Montagem ─────────────────────────────────────────────────────────

function desenhar(m: MdfeLido, op: OpcoesDamdfe): Promise<Buffer> {
  return montarPdf({ titulo: `DAMDFE MDF-e ${L(m.numero)} série ${L(m.serie)}`, assunto: `Chave de acesso ${m.chave}`, semCompressao: op.semCompressao }, (doc) => {
    const c: Ctx = { doc, p: new Pintor(doc), m, y: TOPO, folhas: [] };

    cabecalho(c);
    if (m.modal === 'RODOVIARIO') blocoRodoviario(c);
    else if (m.modal === 'AEREO') blocoAereo(c);
    else if (m.modal === 'FERROVIARIO') blocoFerroviario(c);
    else if (m.modal === 'AQUAVIARIO') blocoAquaviario(c);
    blocoSeguro(c);
    blocoProduto(c);
    blocoTransporte(c);
    const lacres = listaDeLacres(m);
    // O leiaute permite até 10 autorizados; o que passar disso (XML fora do padrão) fica só no XML.
    const autorizados = L(m.autorizados.slice(0, 50).map((a) => `${rotuloDocumento(a)} ${fmtDocumento(a)}`).join('; ') + (m.autorizados.length > 50 ? ' … (demais no XML)' : ''));
    if (lacres && autorizados && lacres.length <= 260 && autorizados.length <= 260) {
      linhaDeCamposAuto(c, [
        { w: 300, rotulo: 'LACRES', valor: lacres, multilinha: true },
        { w: 0, rotulo: 'AUTORIZADOS A BAIXAR O XML DO MDF-e', valor: autorizados, multilinha: true },
      ]);
      c.y += ESPACO;
    } else {
      // Listas longas (centenas de lacres) quebram em quantas linhas e páginas forem precisas.
      if (lacres) paragrafo(c, 'LACRES', lacres, 22);
      if (autorizados) paragrafo(c, 'AUTORIZADOS A BAIXAR O XML DO MDF-e', autorizados, 22);
    }
    blocoDocumentos(c);

    // Observações: as informações complementares do contribuinte e as de interesse do Fisco (texto livre muito longo não vira
    // dezenas de páginas: o resto fica só no XML).
    let texto = limparTexto([m.informacoesComplementares, m.informacoesFisco].filter(Boolean).join('\n'), true);
    if (texto.length > LIMITE_TEXTO_ADICIONAL) texto = `${texto.slice(0, LIMITE_TEXTO_ADICIONAL)}\n… (texto completo no XML)`;
    paragrafo(c, 'OBSERVAÇÕES', texto, 30);

    // número de folhas, marcas d'água e rodapé em todas as páginas
    const total = c.folhas.length;
    const marca = op.cancelada ? 'CANCELADO' : m.homologacao ? 'SEM VALOR FISCAL' : '';
    for (let i = 0; i < total; i += 1) {
      doc.switchToPage(i);
      if (i === 0) c.p.texto(`${i + 1}/${total}`, c.folhas[i].x + 2, c.folhas[i].y + 8.4, c.folhas[i].w - 4, { fonte: NEGRITO, tam: 7.5 });
      else c.p.texto(`FOLHA ${i + 1}/${total}`, c.folhas[i].x, c.folhas[i].y, c.folhas[i].w, { fonte: NEGRITO, tam: 7.5, alinhar: 'right' });
      c.p.texto('DAMDFE gerado pelo InTAX a partir do XML do MDF-e. O documento fiscal é o arquivo XML; confira a autenticidade pela chave de acesso.', MX, RODAPE_Y, LARGURA, { tam: 5.6, cor: '#666', alinhar: 'center' });
      if (marca) marcaDagua(doc, marca, op.cancelada ? '#c62828' : '#555555');
    }
  });
}

/**
 * Gera o DAMDFE do MDF-e (modelo 58) a partir do XML (mdfeProc ou MDFe). Lança ErroLeituraDocumento se o XML não for um MDF-e
 * modelo 58 legível. A opção `denegada` não se aplica ao MDF-e (ele não tem denegação) e é ignorada.
 */
export async function gerarDamdfe(xml: string, opcoes: OpcoesPdf = {}): Promise<Buffer> {
  return desenhar(lerMdfe(xml), opcoes);
}
