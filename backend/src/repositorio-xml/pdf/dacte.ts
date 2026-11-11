/**
 * DACTE (Documento Auxiliar do Conhecimento de Transporte Eletrônico) em PDF, retrato A4, gerado a partir do XML do CT-e (modelo 57).
 * Segue o leiaute do MOC CT-e 4.00, Anexo II (Manual de Especificações Técnicas do DACTE, Ato COTEPE/ICMS 123/2022): identificação do
 * emitente; título, modal, modelo, série, número, data e hora; código de barras Code 128C e chave de acesso em onze blocos de quatro
 * dígitos; consulta, protocolo de autorização de uso e QR Code (campos de conteúdo variável 1, 2 e 3); tipo do CT-e e do serviço;
 * CFOP e natureza; início e término da prestação; remetente, destinatário, expedidor, recebedor e tomador; carga; componentes do
 * valor; imposto; documentos originários; fluxo da carga; observações; dados do modal; uso exclusivo do emissor e reservado ao Fisco.
 * Documentos que não cabem na primeira folha seguem em folhas adicionais com a mesma identificação no alto, como manda o item 2.12.
 * O documento fiscal é o XML (Ajuste SINIEF 09/07): o DACTE só mostra o que o XML traz (item 2.3) e diz isso no rodapé.
 *
 * Fonte: Anexo II do MOC CT-e 4.00 (agosto/2022; texto, quadro de correlação do item 3 e modelo rodoviário do item 5.1), publicado em
 * cte.fazenda.gov.br e conferido em 11/11/2026. O que o Anexo II não define é extensão do InTAX e fica fora dos quadros do modelo ou
 * em quadro próprio: IBS e CBS (as NT 2025.001 e 2026.004 não alteram o DACTE), CT-e de referência (complementado, substituído,
 * anulado), dados dos modais que não são o rodoviário (os modelos 5.3 a 5.12 do MOC não foram reproduzidos). Não implementado: DACTE
 * de contingência FS-DA (código de barras adicional), canhoto (opcional, item 2.21.5), formatos A5 e paisagem, e os casos específicos de
 * artigos perigosos e contêineres do aquaviário (item 2.21.4); os veículos novos entram.
 */
import {
  fmtCep, fmtChave, fmtData, fmtDocumento, fmtFone, fmtHora, fmtNumero, limparTexto,
} from './formatos-danfe';
import {
  CteLido, DocumentoCte, EnderecoCte, IcmsCte, ModalCte, ParteCte, QuantidadeCarga, TipoReferenciaCte, VeiculoNovoCte, lerCte,
} from './cte-leitor';
import { A4, NEGRITO, NORMAL, OpcoesPdf, Pintor, marcaDagua, montarPdf, prefixoQueCabe } from './pintor';

/** Opções do DACTE: as comuns a todos os PDF (cancelada, denegada e semCompressao). */
export type OpcoesDacte = OpcoesPdf;

const PAGINA = A4;
const MX = 14;
const LARGURA = PAGINA.largura - 2 * MX;
const TOPO = 14;
const LIMITE_Y = 806;
const RODAPE_Y = 824;
const GAP = 3;
/** Mais documentos que isto não viram dezenas de páginas: o resto fica só no XML e o DACTE avisa. */
const LIMITE_DOCUMENTOS = 2000;
const LIMITE_TEXTO = 20000;
/** Máximos do leiaute (ObsCont, ObsFisco, occ e infCteComp têm até 10 ocorrências); o que passar disso é XML fora do leiaute e não cabe na folha. */
const LIMITE_OCORRENCIAS = 10;
/** Os componentes do valor ocupam a primeira folha (4 colunas): mais de 60 ficam só no XML, com aviso. */
const LIMITE_COMPONENTES = 60;
const COR_ROTULO = '#333';

// O XML não é validado aqui: um campo que deveria ser número, documento ou chave pode vir com qualquer texto, e a fonte padrão do PDF
// só desenha o conjunto WinAnsi. Estes formatadores devolvem o texto do XML limpo quando ele não tem a forma esperada.
const numBr = (v: string | undefined, min = 2, max = min): string => limparTexto(fmtNumero(v, min, max));
const docBr = (v: string | undefined): string => limparTexto(fmtDocumento(v ?? ''));
const chaveBr = (v: string): string => limparTexto(fmtChave(v));

// ── Domínios do leiaute (MOC CT-e 4.00, Anexo I) ─────────────────────

const MODAL: Record<string, string> = { '01': 'RODOVIÁRIO', '02': 'AÉREO', '03': 'AQUAVIÁRIO', '04': 'FERROVIÁRIO', '05': 'DUTOVIÁRIO', '06': 'MULTIMODAL' };
const TIPO_CTE: Record<string, string> = { '0': 'Normal', '1': 'Complemento de Valores', '2': 'Anulação', '3': 'Substituição' };
const TIPO_SERVICO: Record<string, string> = { '0': 'Normal', '1': 'Subcontratação', '2': 'Redespacho', '3': 'Redespacho Intermediário', '4': 'Serviço Vinculado a Multimodal' };
const SITUACAO_TRIBUTARIA: Record<string, string> = {
  '00': 'Tributação normal ICMS', '20': 'Tributação com BC reduzida do ICMS', '40': 'ICMS isenção', '41': 'ICMS não tributada', '51': 'ICMS diferido',
  '60': 'ICMS cobrado por substituição tributária', '90': 'ICMS outros',
};
const ROTULO_REFERENCIA: Record<TipoReferenciaCte, string> = { complementado: 'CT-E COMPLEMENTADO', substituido: 'CT-E SUBSTITUÍDO', anulado: 'CT-E ANULADO' };
const UNIDADE: Record<string, string> = { '00': 'M3', '01': 'KG', '02': 'TON', '03': 'UN', '04': 'LITROS', '05': 'MMBTU' };

/** Rótulo mais legível para os campos do grupo de um modal que não é o rodoviário; o que não está aqui sai com o nome do campo do XML. */
const CAMPO_MODAL: Record<string, string> = {
  nMinu: 'Nº da minuta', nOCA: 'Nº operacional do conhecimento aéreo', dPrevAereo: 'Data prevista de entrega', xDime: 'Dimensão', cInfManu: 'Informações de manuseio',
  CL: 'Classe da tarifa', cTar: 'Código da tarifa', vTar: 'Valor da tarifa', xNavio: 'Navio', vAFRMM: 'AFRMM', xBalsa: 'Balsa', nViag: 'Nº da viagem',
  direc: 'Direção', irin: 'Irin do navio', nCont: 'Contêiner', nLacre: 'Lacre', tpNav: 'Tipo de navegação (0 interior, 1 cabotagem)',
  tpTraf: 'Tipo de tráfego', respFat: 'Responsável pelo faturamento', ferrEmi: 'Ferrovia emitente', vFrete: 'Valor do frete', fluxo: 'Fluxo ferroviário',
  dIni: 'Início da prestação', dFim: 'Fim da prestação', COTM: 'Nº do certificado do operador de transporte multimodal', indNegociavel: 'Negociável (1 sim, 0 não)',
  xSeg: 'Seguradora', nApol: 'Apólice', nAver: 'Averbação',
};

// ── Peças de desenho próprias do DACTE ───────────────────────────────

interface PosicaoFolha { x: number; y: number; w: number }
interface Bloco { altura: number; desenhar: (y: number) => number }

const ALTURA_LINHA = 10.5;

function linhaFina(p: Pintor, x1: number, y: number, x2: number) {
  p.doc.lineWidth(0.25).strokeColor('#aaa').moveTo(x1, y).lineTo(x2, y).stroke();
}

function linhaTracejada(p: Pintor, x1: number, y: number, x2: number) {
  p.doc.lineWidth(0.4).strokeColor('#888').dash(2, { space: 1.5 }).moveTo(x1, y).lineTo(x2, y).stroke().undash();
}

interface CelulaLinha { rotulo: string; valor: string; w: number; negrito?: boolean }

/** Linha com o rótulo e o valor lado a lado, a forma que o modelo do MOC usa nos quadros das partes. `y` é o topo da linha. */
function linhaRotulada(p: Pintor, x: number, y: number, celulas: CelulaLinha[]) {
  let cx = x;
  for (const c of celulas) {
    p.doc.font(NEGRITO).fontSize(5.2);
    const wRotulo = p.doc.widthOfString(c.rotulo);
    p.texto(c.rotulo, cx + 2, y + 3.9, wRotulo + 1, { fonte: NEGRITO, tam: 5.2, cor: COR_ROTULO });
    const xv = cx + 2 + wRotulo + 3;
    p.texto(c.valor, xv, y + 2.6, Math.max(0, cx + c.w - xv - 2), { fonte: c.negrito ? NEGRITO : NORMAL, tam: 7 });
    cx += c.w;
  }
}

/** Endereço numa linha, na ordem do MOC: logradouro, número, complemento e bairro. */
function enderecoEmLinha(e: EnderecoCte | undefined): string {
  if (!e) return '';
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
  return limparTexto([rua, e.complemento, e.bairro].filter(Boolean).join(' - '));
}

/** Quadro de uma parte (remetente, destinatário, expedidor, recebedor ou tomador) em cinco linhas, de largura `w`. */
function blocoParte(p: Pintor, x: number, y: number, w: number, papel: string, parte: ParteCte | null): number {
  const e = parte?.endereco;
  const h = 5 * ALTURA_LINHA;
  p.caixa(x, y, w, h);
  for (let i = 1; i < 5; i += 1) linhaFina(p, x, y + i * ALTURA_LINHA, x + w);
  linhaRotulada(p, x, y, [{ rotulo: `${papel}:`, valor: limparTexto(parte?.nome), w, negrito: true }]);
  linhaRotulada(p, x, y + ALTURA_LINHA, [{ rotulo: 'ENDEREÇO:', valor: enderecoEmLinha(e), w }]);
  linhaRotulada(p, x, y + 2 * ALTURA_LINHA, [
    { rotulo: 'MUNICÍPIO:', valor: limparTexto(e?.municipio), w: w - 72 }, { rotulo: 'CEP:', valor: fmtCep(e?.cep ?? ''), w: 72 },
  ]);
  linhaRotulada(p, x, y + 3 * ALTURA_LINHA, [
    { rotulo: 'CNPJ/CPF:', valor: docBr(parte?.documento ?? ''), w: w - 110 }, { rotulo: 'IE:', valor: limparTexto(parte?.ie), w: 110 },
  ]);
  linhaRotulada(p, x, y + 4 * ALTURA_LINHA, [
    { rotulo: 'UF:', valor: limparTexto(e?.uf), w: 44 }, { rotulo: 'PAÍS:', valor: limparTexto(e?.pais), w: w - 44 - 100 },
    { rotulo: 'FONE:', valor: fmtFone(parte?.fone ?? ''), w: 100 },
  ]);
  return y + h;
}

/** O tomador na largura da página (quando não há expedidor nem recebedor): três linhas, como no modelo do MOC. */
function blocoTomadorLargo(p: Pintor, y: number, parte: ParteCte | null): number {
  const e = parte?.endereco;
  const h = 3 * ALTURA_LINHA;
  const w1 = LARGURA * 0.5;
  const w2 = LARGURA * 0.3;
  const w3 = LARGURA - w1 - w2;
  p.caixa(MX, y, LARGURA, h);
  for (let i = 1; i < 3; i += 1) linhaFina(p, MX, y + i * ALTURA_LINHA, MX + LARGURA);
  linhaRotulada(p, MX, y, [
    { rotulo: 'TOMADOR DO SERVIÇO:', valor: limparTexto(parte?.nome), w: w1, negrito: true }, { rotulo: 'MUNICÍPIO:', valor: limparTexto(e?.municipio), w: w2 },
    { rotulo: 'CEP:', valor: fmtCep(e?.cep ?? ''), w: w3 },
  ]);
  linhaRotulada(p, MX, y + ALTURA_LINHA, [
    { rotulo: 'ENDEREÇO:', valor: enderecoEmLinha(e), w: w1 }, { rotulo: 'UF:', valor: limparTexto(e?.uf), w: w2 }, { rotulo: 'PAÍS:', valor: limparTexto(e?.pais), w: w3 },
  ]);
  linhaRotulada(p, MX, y + 2 * ALTURA_LINHA, [
    { rotulo: 'CNPJ/CPF:', valor: docBr(parte?.documento ?? ''), w: w1 }, { rotulo: 'IE:', valor: limparTexto(parte?.ie), w: w2 },
    { rotulo: 'FONE:', valor: fmtFone(parte?.fone ?? ''), w: w3 },
  ]);
  return y + h;
}

// ── Cabeçalho (repetido em todas as folhas, item 2.12 do MOC) ────────

const WL = 176; // coluna da esquerda: emitente, tipos, globalizado, CFOP
const WM = 282; // coluna do meio: título, modal, número, código de barras, chave e protocolo
const WR = LARGURA - WL - WM; // coluna da direita: folha e QR Code
const ALTURA_CABECALHO = 170;
/** O código de barras tem 277 módulos; com 235 pt cada módulo tem 0,03 cm (o máximo do item 2.17) e a altura passa de 1,5 cm. */
const LARGURA_BARRAS = 235;
const ALTURA_BARRAS = 43;
const LADO_QR = 80;

function identificacaoDoEmitente(p: Pintor, c: CteLido, x: number, y: number, w: number, h: number) {
  const e = c.emitente;
  p.caixa(x, y, w, h);
  p.texto('IDENTIFICAÇÃO DO EMITENTE', x + 2, y + 1.6, w - 4, { tam: 4.8, cor: COR_ROTULO });
  const nome = limparTexto(e.nome || e.fantasia);
  const hNome = Math.min(p.altura(nome, w - 10, 8, NEGRITO), 20);
  p.texto(nome, x + 5, y + 9, w - 10, { fonte: NEGRITO, tam: 8, alinhar: 'center', altura: 20 });
  const end = e.endereco;
  const rua = [end.logradouro, end.numero].filter(Boolean).join(', ');
  // as partes de cada linha são limpas antes de juntar, para o espaço duplo entre elas não ser engolido pela limpeza do texto
  const junta = (...partes: string[]) => partes.map((t) => limparTexto(t)).filter(Boolean).join('   ');
  let yy = y + 11 + hNome;
  // cada linha é desenhada à parte: um endereço enorme não empurra o município, o CEP e o telefone para fora do quadro
  const linha = (txt: string) => {
    if (!txt) return;
    p.texto(txt, x + 5, yy, w - 10, { tam: 6.6, alinhar: 'center' });
    yy += 8;
  };
  linha(junta(e.documento ? `CNPJ: ${docBr(e.documento)}` : '', e.ie ? `IE: ${e.ie}` : ''));
  const logradouro = junta([rua, end.complemento].filter(Boolean).join(' - '));
  if (logradouro) {
    p.texto(logradouro, x + 5, yy, w - 10, { tam: 6.6, alinhar: 'center', altura: 16 });
    yy += Math.min(p.altura(logradouro, w - 10, 6.6), 16) + 0.5;
  }
  linha(junta([end.bairro, [end.municipio, end.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' - ')));
  linha(junta(end.cep ? `CEP: ${fmtCep(end.cep)}` : '', e.fone ? `Fone: ${fmtFone(e.fone)}` : ''));
}

function caixaMarcavel(p: Pintor, x: number, y: number, rotulo: string, marcado: boolean) {
  p.caixa(x, y, 8, 8);
  if (marcado) p.texto('X', x, y + 1.3, 8, { fonte: NEGRITO, tam: 7, alinhar: 'center' });
  p.texto(rotulo, x + 11, y + 1.8, 26, { tam: 5.8 });
}

function indicadorGlobalizado(p: Pintor, c: CteLido, x: number, y: number, w: number, h: number) {
  const wi = 88;
  p.caixa(x, y, wi, h);
  p.texto('INDICADOR DO CT-E GLOBALIZADO', x + 2, y + 1.6, wi - 4, { tam: 4.8, cor: COR_ROTULO });
  caixaMarcavel(p, x + 10, y + 11.5, 'SIM', c.globalizado.indicador);
  caixaMarcavel(p, x + 48, y + 11.5, 'NÃO', !c.globalizado.indicador);
  p.campo(x + wi, y, w - wi, h, 'INF. DO CT-E GLOBALIZADO', limparTexto(c.globalizado.informacao), { multilinha: true, tam: 5.4 });
}

/** Número do protocolo, data e hora de autorização (campo 2 de conteúdo variável): nProt + " " + dhRecbto. */
function textoDoProtocolo(c: CteLido): string {
  const prot = c.protocolo;
  if (!prot) return '';
  return limparTexto([prot.numero, fmtData(prot.dataHora), fmtHora(prot.dataHora)].filter(Boolean).join(' '));
}

/** Devolve o `y` onde termina o cabeçalho e onde escrever "FOLHA n/N" (preenchido no fim, quando se sabe o total de folhas). */
function cabecalho(p: Pintor, c: CteLido, y: number): { y: number; folha: PosicaoFolha } {
  const xl = MX;
  const xm = MX + WL;
  const xr = xm + WM;

  // coluna da esquerda
  identificacaoDoEmitente(p, c, xl, y, WL, 78);
  p.campo(xl, y + 78, WL, 22, 'TIPO DO CT-E', TIPO_CTE[c.tipoCte] ?? limparTexto(c.tipoCte));
  p.campo(xl, y + 100, WL, 22, 'TIPO DO SERVIÇO', TIPO_SERVICO[c.tipoServico] ?? limparTexto(c.tipoServico));
  indicadorGlobalizado(p, c, xl, y + 122, WL, 24);
  p.campo(xl, y + 146, WL, 24, 'CÓD. FISCAL DE OPERAÇÕES E PRESTAÇÕES - NAT. DA OPERAÇÃO', limparTexto([c.cfop, c.naturezaOperacao].filter(Boolean).join(' - ')), { multilinha: true, tam: 6.3 });

  // coluna do meio: título e modal
  p.caixa(xm, y, 182, 38);
  p.texto('DACTE', xm, y + 4, 182, { fonte: NEGRITO, tam: 14, alinhar: 'center' });
  // a quebra em duas linhas é a do modelo do MOC
  p.texto('Documento Auxiliar do Conhecimento\nde Transporte Eletrônico', xm + 6, y + 21, 170, { fonte: NEGRITO, tam: 6.6, alinhar: 'center', altura: 17 });
  p.caixa(xm + 182, y, 100, 38);
  p.texto('MODAL', xm + 184, y + 1.6, 96, { tam: 4.8, cor: COR_ROTULO });
  p.texto(MODAL[c.modal.codigo] ?? limparTexto(c.modal.codigo), xm + 182, y + 17, 100, { fonte: NEGRITO, tam: 11, alinhar: 'center' });
  // modelo, série, número, data e hora, SUFRAMA
  const yb = y + 38;
  p.campo(xm, yb, 28, 24, 'MODELO', limparTexto(c.modelo), { alinhar: 'center' });
  p.campo(xm + 28, yb, 28, 24, 'SÉRIE', limparTexto(c.serie), { alinhar: 'center' });
  p.campo(xm + 56, yb, 50, 24, 'NÚMERO', limparTexto(c.numero), { alinhar: 'center' });
  p.campo(xm + 106, yb, 86, 24, 'DATA E HORA DE EMISSÃO', [fmtData(c.dataEmissao), fmtHora(c.dataEmissao)].filter(Boolean).join(' '), { alinhar: 'center' });
  p.campo(xm + 192, yb, 90, 24, 'INSC. SUFRAMA DESTINATÁRIO', limparTexto(c.destinatario?.suframa), { alinhar: 'center' });
  // código de barras da chave de acesso (Code 128C, só a chave de 44 dígitos)
  p.caixa(xm, y + 62, WM, 48);
  p.codigoDeBarras(xm + (WM - LARGURA_BARRAS) / 2, y + 62 + (48 - ALTURA_BARRAS) / 2, LARGURA_BARRAS, ALTURA_BARRAS, c.chave);
  p.campo(xm, y + 110, WM, 22, 'CHAVE DE ACESSO', chaveBr(c.chave), { negrito: true, tam: 8.6, alinhar: 'center' });
  // campo 1 de conteúdo variável: onde consultar; em homologação o MOC manda este texto, centralizado e em caixa alta (item 2.20)
  p.caixa(xm, y + 132, WM, 16);
  const aviso = c.homologacao ? 'EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL' : 'Consulta em http://www.cte.fazenda.gov.br/portal';
  p.texto(aviso, xm + 3, y + 132 + 4.6, WM - 6, { fonte: NEGRITO, tam: 7.2, alinhar: 'center' });
  // campo 2: protocolo de autorização de uso
  p.campo(xm, y + 148, WM, 22, 'PROTOCOLO DE AUTORIZAÇÃO DE USO', textoDoProtocolo(c), { negrito: true, tam: 8, alinhar: 'center' });

  // coluna da direita: número da folha (escrito no fim) e campo 3, o QR Code do XML (infCTeSupl/qrCodCTe)
  p.caixa(xr, y, WR, 38);
  if (c.qrCode) {
    try {
      p.qrCode(xr + (WR - LADO_QR) / 2, y + 38 + (ALTURA_CABECALHO - 38 - LADO_QR) / 2, LADO_QR, c.qrCode);
    } catch {
      // texto que o QR Code não comporta: a folha sai sem ele, a chave de acesso e o código de barras continuam lá
    }
  }
  return { y: y + ALTURA_CABECALHO, folha: { x: xr, y: y + 15, w: WR } };
}

// ── Blocos da primeira folha ─────────────────────────────────────────

function inicioETermino(p: Pintor, c: CteLido, y: number): number {
  const w = LARGURA / 2;
  const local = (l: { uf: string; municipio: string }) => limparTexto([l.uf, l.municipio].filter(Boolean).join(' - '));
  p.campo(MX, y, w, 22, 'INÍCIO DA PRESTAÇÃO', local(c.inicioPrestacao));
  p.campo(MX + w, y, w, 22, 'TÉRMINO DA PRESTAÇÃO', local(c.terminoPrestacao));
  return y + 22;
}

/**
 * Remetente e destinatário, expedidor e recebedor, e o tomador. Sem expedidor e/ou recebedor os quadros são dispensados (item 2.7
 * do MOC) e o tomador ocupa o lugar do que sumiu: o do recebedor, se só ele falta; o do expedidor, se só este falta; a linha toda, se faltam os dois.
 */
function partesDoTransporte(p: Pintor, c: CteLido, y0: number): number {
  const w = LARGURA / 2;
  let y = blocoParte(p, MX, y0, w, 'REMETENTE', c.remetente);
  blocoParte(p, MX + w, y0, w, 'DESTINATÁRIO', c.destinatario);
  const tomador = c.tomador.parte;
  if (c.expedidor && c.recebedor) {
    blocoParte(p, MX, y, w, 'EXPEDIDOR', c.expedidor);
    y = blocoParte(p, MX + w, y, w, 'RECEBEDOR', c.recebedor);
    return blocoTomadorLargo(p, y, tomador);
  }
  if (c.expedidor) {
    blocoParte(p, MX, y, w, 'EXPEDIDOR', c.expedidor);
    return blocoParte(p, MX + w, y, w, 'TOMADOR DO SERVIÇO', tomador);
  }
  if (c.recebedor) {
    blocoParte(p, MX, y, w, 'TOMADOR DO SERVIÇO', tomador);
    return blocoParte(p, MX + w, y, w, 'RECEBEDOR', c.recebedor);
  }
  return blocoTomadorLargo(p, y, tomador);
}

/** Maiúsculas e sem acento (a decomposição NFD separa o acento, na faixa U+0300 a U+036F), para reconhecer "PESO BASE DE CÁLCULO" e "PESO BASE DE CALCULO". */
const semAcento = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

interface QuantidadesDaCarga {
  pesoBruto: string; pesoBaseCalculo: string; pesoAferido: string; cubagem: string; volumes: string; outras: string[];
}

/**
 * Distribui o infQ nos campos do DACTE (quadro de correlação do MOC): peso bruto, peso base de cálculo e peso aferido em kg (a tonelada,
 * cUnid 02, vale mil quilos), cubagem em m³ (cUnid 00) e quantidade de volumes (cUnid 03). O que não cai em nenhum deles vai em "outras".
 */
function quantidadesDaCarga(quantidades: QuantidadeCarga[]): QuantidadesDaCarga {
  const r: QuantidadesDaCarga = { pesoBruto: '', pesoBaseCalculo: '', pesoAferido: '', cubagem: '', volumes: '', outras: [] };
  const emKg = (q: QuantidadeCarga) => String(q.codigoUnidade === '02' ? Math.round(Number(q.quantidade) * 1000 * 1e4) / 1e4 : Number(q.quantidade));
  for (const q of quantidades) {
    const n = Number(q.quantidade);
    const medida = semAcento(q.tipoMedida);
    const peso = q.codigoUnidade === '01' || q.codigoUnidade === '02';
    const nome = limparTexto(q.tipoMedida);
    if (!q.quantidade.trim() || !Number.isFinite(n)) continue;
    if (peso && !r.pesoBruto && /BRUTO/.test(medida)) r.pesoBruto = numBr(emKg(q), 2, 4);
    else if (peso && !r.pesoBaseCalculo && /BASE/.test(medida) && /CALC/.test(medida)) r.pesoBaseCalculo = numBr(emKg(q), 2, 4);
    else if (peso && !r.pesoAferido && /AFERID|AFORAD/.test(medida)) r.pesoAferido = numBr(emKg(q), 2, 4);
    else if (q.codigoUnidade === '00' && !r.cubagem) r.cubagem = numBr(q.quantidade, 2, 4);
    else if (q.codigoUnidade === '03' && !r.volumes) r.volumes = numBr(q.quantidade, 0, 4);
    else r.outras.push(`${nome}: ${numBr(q.quantidade, 2, 4)}${UNIDADE[q.codigoUnidade] ? ` ${UNIDADE[q.codigoUnidade]}` : ''}`);
  }
  return r;
}

function carga(p: Pintor, c: CteLido, y0: number): number {
  const k = c.carga;
  const q = quantidadesDaCarga(k.quantidades);
  const terco = LARGURA / 3;
  let y = p.linhaDeCampos(y0, 22, [
    { w: terco, rotulo: 'PRODUTO PREDOMINANTE', valor: limparTexto(k.produtoPredominante) },
    { w: terco, rotulo: 'OUTRAS CARACTERÍSTICAS DA CARGA', valor: limparTexto(k.outrasCaracteristicas) },
    { w: 0, rotulo: 'VALOR TOTAL DA CARGA', valor: numBr(k.valorCarga), alinhar: 'right' },
  ]);
  const quinto = LARGURA / 5;
  y = p.linhaDeCampos(y, 22, [
    { w: quinto, rotulo: 'PESO BRUTO (KG)', valor: q.pesoBruto, alinhar: 'right' },
    { w: quinto, rotulo: 'PESO BASE CÁLCULO (KG)', valor: q.pesoBaseCalculo, alinhar: 'right' },
    { w: quinto, rotulo: 'PESO AFERIDO (KG)', valor: q.pesoAferido, alinhar: 'right' },
    { w: quinto, rotulo: 'CUBAGEM (M³)', valor: q.cubagem, alinhar: 'right' },
    { w: 0, rotulo: 'QUANTIDADE DE VOLUMES (UND)', valor: q.volumes, alinhar: 'right' },
  ]);
  if (q.outras.length) y = p.linhaDeCampos(y, 22, [{ w: 0, rotulo: 'OUTRAS QUANTIDADES DA CARGA', valor: q.outras.join('   |   ') }]);
  return y;
}

function componentes(p: Pintor, c: CteLido, y0: number): number {
  const lista = c.prestacao.componentes.slice(0, LIMITE_COMPONENTES);
  const omitidos = c.prestacao.componentes.length - lista.length;
  const WT = 130; // área dos totais, à direita
  const COLUNAS = 4;
  const wPar = (LARGURA - WT) / COLUNAS;
  const linhas = Math.max(2, Math.ceil(lista.length / COLUNAS));
  const h = Math.max(44, 11 + linhas * 9.5);
  const y = p.titulo('COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO', y0);
  p.caixa(MX, y, LARGURA - WT, h);
  for (let k = 0; k < COLUNAS; k += 1) {
    const x = MX + k * wPar;
    if (k > 0) p.linha(x, y, x, y + h);
    p.texto('NOME', x + 2, y + 1.6, 40, { tam: 4.8, cor: COR_ROTULO });
    p.texto('VALOR', x + wPar - 42, y + 1.6, 40, { tam: 4.8, cor: COR_ROTULO, alinhar: 'right' });
  }
  lista.forEach((comp, i) => {
    const x = MX + (i % COLUNAS) * wPar;
    const yy = y + 9 + Math.floor(i / COLUNAS) * 9.5;
    p.texto(limparTexto(comp.nome), x + 2, yy, wPar - 46, { tam: 6.4 });
    p.texto(numBr(comp.valor), x + wPar - 44, yy, 42, { tam: 6.4, alinhar: 'right' });
  });
  const xt = MX + LARGURA - WT;
  p.campo(xt, y, WT, h / 2, 'VALOR TOTAL DA PRESTAÇÃO DO SERVIÇO', numBr(c.prestacao.valorTotal), { negrito: true, tam: 8.5, alinhar: 'right' });
  p.campo(xt, y + h / 2, WT, h / 2, 'VALOR A RECEBER', numBr(c.prestacao.valorReceber), { negrito: true, tam: 8.5, alinhar: 'right' });
  if (omitidos > 0) {
    p.texto(`(${omitidos} demais componentes no XML)`, MX, y + h + 1.5, LARGURA, { tam: 6, cor: '#555' });
    return y + h + 9;
  }
  return y + h;
}

function classificacaoTributaria(i: IcmsCte): string {
  if (!i.grupo) return '';
  const grupo = i.grupo.toLowerCase();
  const descricao = grupo === 'icmssn' ? 'Simples Nacional' : grupo === 'icmsoutrauf' ? 'ICMS devido à UF de origem da prestação (outra UF)' : SITUACAO_TRIBUTARIA[i.cst] ?? '';
  return limparTexto([i.cst, descricao].filter(Boolean).join(' - '));
}

function impostos(p: Pintor, c: CteLido, y0: number): number {
  const i = c.imposto.icms;
  const retido = /^icms60$/i.test(i.grupo); // o MOC põe a base, a alíquota e o valor da ST retida nos mesmos campos
  const credito = i.creditoOutorgado !== '' && Number(i.creditoOutorgado) !== 0;
  const y = p.titulo('INFORMAÇÕES RELATIVAS AO IMPOSTO', y0);
  const w = (fracao: number) => LARGURA * fracao;
  const celulas = [
    { w: w(credito ? 0.27 : 0.4), rotulo: 'CLASSIFICAÇÃO TRIBUTÁRIA DO SERVIÇO', valor: classificacaoTributaria(i) },
    { w: w(0.15), rotulo: retido ? 'BASE CÁLC. ICMS ST RETIDO' : 'BASE DE CÁLCULO', valor: numBr(i.baseCalculo), alinhar: 'right' as const },
    { w: w(credito ? 0.11 : 0.15), rotulo: retido ? 'ALÍQUOTA DO ICMS ST' : 'ALÍQUOTA DO ICMS', valor: numBr(i.aliquota), alinhar: 'right' as const },
    { w: w(0.15), rotulo: retido ? 'VALOR DO ICMS ST RETIDO' : 'VALOR DO ICMS', valor: numBr(i.valor), alinhar: 'right' as const },
    { w: credito ? w(0.12) : 0, rotulo: '% RED. BC. CALC.', valor: numBr(i.percentualReducao), alinhar: 'right' as const },
  ];
  if (credito) celulas.push({ w: 0, rotulo: 'CRÉDITO OUTORGADO/PRESUMIDO', valor: numBr(i.creditoOutorgado), alinhar: 'right' as const });
  return p.linhaDeCampos(y, 22, celulas);
}

/** IBS e CBS (NT 2025.001): o DACTE do MOC 4.00 não tem quadro para eles; aparece só quando o XML traz imp/IBSCBS, com o que o XML diz. */
function ibsCbs(p: Pintor, c: CteLido, y0: number): number {
  const g = c.imposto.ibsCbs;
  if (!g) return y0;
  const w = LARGURA / 10;
  const num = (v: string) => numBr(v);
  let y = p.titulo('INFORMAÇÕES RELATIVAS AO IBS E À CBS', y0);
  y = p.linhaDeCampos(y, 22, [
    { w, rotulo: 'CST IBS/CBS', valor: limparTexto(g.cst), alinhar: 'right' },
    { w, rotulo: 'CLASS. TRIBUTÁRIA', valor: limparTexto(g.classificacao), alinhar: 'right' },
    { w, rotulo: 'BC IBS/CBS', valor: num(g.baseCalculo), alinhar: 'right' },
    { w, rotulo: 'ALÍQ. IBS UF (%)', valor: numBr(g.aliquotaIbsUf, 2, 4), alinhar: 'right' },
    { w, rotulo: 'VALOR IBS UF', valor: num(g.valorIbsUf), alinhar: 'right' },
    { w, rotulo: 'ALÍQ. IBS MUN. (%)', valor: numBr(g.aliquotaIbsMun, 2, 4), alinhar: 'right' },
    { w, rotulo: 'VALOR IBS MUN.', valor: num(g.valorIbsMun), alinhar: 'right' },
    { w, rotulo: 'VALOR DO IBS', valor: num(g.valorIbs), alinhar: 'right' },
    { w, rotulo: 'ALÍQ. CBS (%)', valor: numBr(g.aliquotaCbs, 2, 4), alinhar: 'right' },
    { w: 0, rotulo: 'VALOR DA CBS', valor: num(g.valorCbs), alinhar: 'right' },
  ]);
  if (c.prestacao.valorLiquido || c.imposto.valorTotalDfe) {
    y = p.linhaDeCampos(y, 22, [
      { w: LARGURA * 0.5, rotulo: 'VALOR LÍQUIDO DA PRESTAÇÃO (SEM TRIBUTOS)', valor: num(c.prestacao.valorLiquido), alinhar: 'right' },
      { w: 0, rotulo: 'VALOR TOTAL DO DF-E', valor: num(c.imposto.valorTotalDfe), alinhar: 'right' },
    ]);
  }
  return y;
}

/** CT-e complementado, substituído ou anulado: o leiaute 4.00 e o 3.00 trazem a chave de cada um; o MOC não tem quadro para elas. */
function referencias(p: Pintor, c: CteLido, y0: number): number {
  let y = p.titulo('CT-E DE REFERÊNCIA', y0);
  for (const r of c.referencias.slice(0, LIMITE_OCORRENCIAS)) {
    p.caixa(MX, y, LARGURA, 12);
    p.texto(ROTULO_REFERENCIA[r.tipo], MX + 3, y + 3.3, 110, { fonte: NEGRITO, tam: 6.4 });
    p.texto(chaveBr(r.chave), MX + 116, y + 2.7, LARGURA - 120, { tam: 7.6 });
    y += 12;
  }
  return y;
}

// ── Documentos originários e de transporte anterior ──────────────────

const ALTURA_CABECALHO_DOC = 9.5;
const ALTURA_LINHA_DOC = 9.5;
/** Posições (relativas ao grupo de colunas) de TP DOC., CNPJ/CPF do emitente, série/número e chave de acesso. */
const X_TIPO = 2;
const X_EMITENTE = 36;
const X_NUMERO = 98;
const X_CHAVE = 142;

/** Uma tabela que pode continuar nas folhas adicionais: documentos originários, de transporte anterior ou veículos novos. */
interface SecaoDeTabela {
  titulo: string;
  total: number;
  /** Itens que passaram do limite e ficaram só no XML. */
  omitidos: number;
  /** Como chamar os itens no aviso dos que ficaram de fora: "documentos", "veículos". */
  unidade: string;
  /** Desenha, a partir do item `inicio`, o que couber entre `y0` e `yLimite` (título incluído); devolve onde acabou e o próximo item. */
  desenhar: (titulo: string, inicio: number, y0: number, yLimite: number) => { y: number; proximo: number };
}

function linhaDoDocumento(p: Pintor, d: DocumentoCte, x: number, y: number) {
  const wGrupo = LARGURA / 2;
  const yt = y + 2.2;
  p.texto(limparTexto(d.rotulo), x + X_TIPO, yt, X_EMITENTE - X_TIPO - 2, { tam: 6.2 });
  p.texto(docBr(d.emitente), x + X_EMITENTE, yt, X_NUMERO - X_EMITENTE - 2, { tam: 6.2 });
  if (d.chave) {
    // O número da NF-e ou do CT-e e a chave de 44 dígitos (sem espaços, para a busca do leitor de PDF achar a chave inteira).
    const serieNumero = [d.serie, d.numero].filter(Boolean).join('/');
    p.texto(limparTexto(serieNumero), x + X_NUMERO, yt, X_CHAVE - X_NUMERO - 2, { fonte: NEGRITO, tam: 6.2 });
    p.texto(limparTexto(d.chave), x + X_CHAVE, yt + 0.4, wGrupo - X_CHAVE - 2, { tam: 5.4 });
    return;
  }
  const identificacao = [d.serie && d.numero ? `${d.serie}/${d.numero}` : d.numero || d.serie, d.descricao].filter(Boolean).join(' - ');
  p.texto(limparTexto(identificacao), x + X_NUMERO, yt, wGrupo - X_NUMERO - 2, { tam: 6.2 });
}

/**
 * Tabela em dois grupos de colunas lado a lado (TP DOC., CNPJ/CPF emitente, série/número), como no modelo do MOC. Preenche o grupo da
 * esquerda de cima para baixo e depois o da direita, equilibrando os dois quando sobra espaço. Devolve onde acabou e o próximo documento.
 */
function tabelaDocumentos(p: Pintor, titulo: string, docs: DocumentoCte[], inicio: number, y0: number, yLimite: number): { y: number; proximo: number } {
  const wGrupo = LARGURA / 2;
  const y = p.titulo(titulo, y0);
  const restantes = docs.length - inicio;
  const capacidade = Math.max(1, Math.floor((yLimite - y - ALTURA_CABECALHO_DOC) / ALTURA_LINHA_DOC));
  const linhas = Math.max(1, Math.min(capacidade, Math.ceil(restantes / 2)));
  const h = ALTURA_CABECALHO_DOC + linhas * ALTURA_LINHA_DOC;
  p.caixa(MX, y, LARGURA, h);
  p.linha(MX, y + ALTURA_CABECALHO_DOC, MX + LARGURA, y + ALTURA_CABECALHO_DOC);
  for (let g = 0; g < 2; g += 1) {
    const x = MX + g * wGrupo;
    p.texto('TP DOC.', x + X_TIPO, y + 2.6, X_EMITENTE - X_TIPO - 2, { tam: 4.8, cor: COR_ROTULO });
    p.texto('CNPJ/CPF EMITENTE', x + X_EMITENTE, y + 2.6, X_NUMERO - X_EMITENTE - 2, { tam: 4.8, cor: COR_ROTULO });
    p.texto('SÉRIE/Nº DOCUMENTO', x + X_NUMERO, y + 2.6, wGrupo - X_NUMERO - 2, { tam: 4.8, cor: COR_ROTULO });
    if (g === 1) p.linha(x, y, x, y + h);
  }
  for (let r = 1; r < linhas; r += 1) linhaFina(p, MX, y + ALTURA_CABECALHO_DOC + r * ALTURA_LINHA_DOC, MX + LARGURA);
  const fim = Math.min(docs.length, inicio + 2 * linhas);
  for (let k = inicio; k < fim; k += 1) {
    const idx = k - inicio;
    const grupo = idx < linhas ? 0 : 1;
    const linha = grupo === 0 ? idx : idx - linhas;
    linhaDoDocumento(p, docs[k], MX + grupo * wGrupo, y + ALTURA_CABECALHO_DOC + linha * ALTURA_LINHA_DOC);
  }
  return { y: y + h, proximo: fim };
}

/** Larguras das colunas da tabela de veículos novos: chassi, cor, marca/modelo, valor unitário e frete unitário (a última completa a linha). */
const COLUNAS_VEICULOS = [120, 170, 87, 95];

/** "Informações sobre os veículos novos transportados" (item 2.21.4 do MOC): uma linha por veículo, na largura da página. */
function tabelaVeiculos(p: Pintor, titulo: string, veiculos: VeiculoNovoCte[], inicio: number, y0: number, yLimite: number): { y: number; proximo: number } {
  const y = p.titulo(titulo, y0);
  const capacidade = Math.max(1, Math.floor((yLimite - y - ALTURA_CABECALHO_DOC) / ALTURA_LINHA_DOC));
  const linhas = Math.min(capacidade, veiculos.length - inicio);
  const h = ALTURA_CABECALHO_DOC + linhas * ALTURA_LINHA_DOC;
  const xs = COLUNAS_VEICULOS.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1] + w], [MX]);
  const rotulos = ['CHASSI', 'COR', 'MARCA/MODELO', 'VR. UNIT. DO VEÍCULO', 'FRETE UNITÁRIO'];
  p.caixa(MX, y, LARGURA, h);
  p.linha(MX, y + ALTURA_CABECALHO_DOC, MX + LARGURA, y + ALTURA_CABECALHO_DOC);
  rotulos.forEach((rotulo, i) => {
    const x = xs[i];
    const w = (i < xs.length - 1 ? xs[i + 1] : MX + LARGURA) - x;
    if (i > 0) p.linha(x, y, x, y + h);
    p.texto(rotulo, x + 2, y + 2.6, w - 4, { tam: 4.8, cor: COR_ROTULO });
  });
  for (let r = 1; r < linhas; r += 1) linhaFina(p, MX, y + ALTURA_CABECALHO_DOC + r * ALTURA_LINHA_DOC, MX + LARGURA);
  for (let k = 0; k < linhas; k += 1) {
    const v = veiculos[inicio + k];
    const yt = y + ALTURA_CABECALHO_DOC + k * ALTURA_LINHA_DOC + 2.2;
    const valores = [limparTexto(v.chassi), limparTexto(v.cor), limparTexto(v.modelo), numBr(v.valorUnitario), numBr(v.frete)];
    valores.forEach((valor, i) => {
      const x = xs[i];
      const w = (i < xs.length - 1 ? xs[i + 1] : MX + LARGURA) - x;
      p.texto(valor, x + 2, yt, w - 4, { tam: 6.2, alinhar: i >= 3 ? 'right' : 'left' });
    });
  }
  return { y: y + h, proximo: inicio + linhas };
}

// ── Blocos que seguem os documentos ──────────────────────────────────

function blocoFluxo(p: Pintor, c: CteLido): Bloco {
  const rotulo = (destino: string) => `SIGLA OU CÓDIGO INT. DA FILIAL/PORTO/ESTAÇÃO/AEROPORTO DE ${destino}`;
  return {
    altura: 8.5 + 22,
    desenhar: (y0) => {
      const y = p.titulo('PREVISÃO DO FLUXO DA CARGA', y0);
      const w = LARGURA / 3;
      return p.linhaDeCampos(y, 22, [
        { w, rotulo: rotulo('ORIGEM'), valor: limparTexto(c.fluxo.origem) },
        { w, rotulo: rotulo('PASSAGEM'), valor: limparTexto(c.fluxo.passagens.join(', ')) },
        { w: 0, rotulo: rotulo('DESTINO'), valor: limparTexto(c.fluxo.destino) },
      ]);
    },
  };
}

/** As observações gerais: xObs e o que mais o XML traz de texto livre sobre o transporte (sem inventar nada). */
function textoDasObservacoes(c: CteLido): string {
  const o = c.observacoes;
  const linhas: string[] = [];
  if (o.geral) linhas.push(o.geral);
  if (o.caracteristicaTransporte) linhas.push(`Característica adicional do transporte: ${o.caracteristicaTransporte}`);
  if (o.caracteristicaServico) linhas.push(`Característica adicional do serviço: ${o.caracteristicaServico}`);
  if (o.municipioOrigemCalculo || o.municipioDestinoCalculo) {
    linhas.push(`Município para cálculo do frete - origem: ${o.municipioOrigemCalculo || '-'}; destino: ${o.municipioDestinoCalculo || '-'}`);
  }
  if (o.emissor) linhas.push(`Funcionário emissor: ${o.emissor}`);
  // o recebedor que retira a carga muda quem a entrega: o DACTE avisa; o CT-e globalizado repete aqui o que o campo do cabeçalho não comportou
  if (c.retira.indicador === '0') linhas.push(`O recebedor retira a carga no destino${c.retira.detalhes ? `: ${c.retira.detalhes}` : '.'}`);
  if (c.globalizado.indicador && c.globalizado.informacao.length > 60) linhas.push(`CT-e globalizado: ${c.globalizado.informacao}`);
  if (o.informacoesFisco) linhas.push(`Informações adicionais de interesse do Fisco: ${o.informacoesFisco}`);
  let texto = limparTexto(linhas.join('\n'), true);
  // Texto livre muito longo não vira dezenas de páginas: o resto fica só no XML.
  if (texto.length > LIMITE_TEXTO) texto = `${texto.slice(0, LIMITE_TEXTO)}\n… (texto completo no XML)`;
  return texto;
}

const ALTURA_OBSERVACOES_MIN = 40;
const ALTURA_OBSERVACOES_MAX = 100;

/** Caixa de observações da primeira folha; o que passar da altura máxima continua em folha adicional (devolvido em `resto`). */
function blocoObservacoes(p: Pintor, texto: string): { bloco: Bloco; resto: string } {
  const w = LARGURA - 6;
  const natural = p.altura(texto || ' ', w, 6.8) + 10;
  const cabe = natural <= ALTURA_OBSERVACOES_MAX;
  const altura = Math.max(ALTURA_OBSERVACOES_MIN, Math.min(natural, ALTURA_OBSERVACOES_MAX));
  // quando continua, a última linha da caixa fica para o aviso
  const corte = cabe ? texto.length : prefixoQueCabe(p, texto, w, altura - 10 - 8, 6.8);
  return {
    resto: texto.slice(corte).trimStart(),
    bloco: {
      altura: 8.5 + altura,
      desenhar: (y0) => {
        const y = p.titulo('OBSERVAÇÕES GERAIS', y0);
        p.caixa(MX, y, LARGURA, altura);
        p.texto(texto.slice(0, corte), MX + 3, y + 3, w, { tam: 6.8, altura: altura - 5 });
        if (!cabe) p.texto('CONTINUA NA FOLHA SEGUINTE', MX, y + altura - 8, LARGURA - 3, { fonte: NEGRITO, tam: 5.6, alinhar: 'right' });
        return y + altura;
      },
    },
  };
}

function blocoModal(p: Pintor, c: CteLido): Bloco {
  const m: ModalCte = c.modal;
  const nome = MODAL[m.codigo];
  const titulo = `INFORMAÇÕES ESPECÍFICAS DO MODAL${nome ? ` ${nome}` : ''}`;
  if (m.detalhes.length) {
    // modais que não são o rodoviário: os campos do grupo, como estão no XML
    const texto = limparTexto(m.detalhes.map((d) => `${CAMPO_MODAL[d.campo] ?? d.campo}: ${d.valor}`).join('   |   '));
    const altura = Math.min(Math.max(22, p.altura(texto, LARGURA - 4, 6.4) + 10), 70);
    return {
      altura: 8.5 + altura,
      desenhar: (y0) => {
        const y = p.titulo(titulo, y0);
        p.campo(MX, y, LARGURA, altura, 'DADOS DO MODAL (CAMPOS DO XML)', texto, { multilinha: true, tam: 6.4 });
        return y + altura;
      },
    };
  }
  const ordens = limparTexto(m.ordensColeta.slice(0, LIMITE_OCORRENCIAS).map((o) => {
    const emitente = [docBr(o.emitente), o.ie ? `IE ${o.ie}` : '', o.uf].filter(Boolean).join(' ');
    return `${[o.serie, o.numero].filter(Boolean).join('/')} de ${fmtData(o.dataEmissao)} - ${emitente}`;
  }).join('   |   '));
  const altura = ordens ? Math.min(Math.max(22, p.altura(ordens, LARGURA - 164, 6.2) + 10), 60) : 22;
  return {
    altura: 8.5 + altura,
    desenhar: (y0) => {
      const y = p.titulo(titulo, y0);
      if (!ordens) {
        p.campo(MX, y, LARGURA, altura, 'RNTRC DA EMPRESA', limparTexto(m.rntrc));
      } else {
        p.campo(MX, y, 160, altura, 'RNTRC DA EMPRESA', limparTexto(m.rntrc));
        p.campo(MX + 160, y, LARGURA - 160, altura, 'ORDENS DE COLETA ASSOCIADAS (SÉRIE/Nº - EMISSÃO - EMITENTE)', ordens, { multilinha: true, tam: 6.2 });
      }
      return y + altura;
    },
  };
}

const ALTURA_USO_MIN = 40;
const ALTURA_USO_MAX = 100;

/** Itens de texto livre (ObsCont, ObsFisco) dentro de uma caixa; quando mais de uma linha, um destaque tracejado separa os itens (item 2.8). */
function desenharItens(p: Pintor, x: number, y: number, w: number, h: number, itens: string[]) {
  let yy = y + 10;
  const limite = y + h - 2;
  for (let i = 0; i < itens.length; i += 1) {
    const altura = p.altura(itens[i], w - 6, 6.2);
    if (yy + altura > limite) {
      p.texto(itens[i], x + 3, yy, w - 6, { tam: 6.2, altura: Math.max(0, limite - yy) });
      return;
    }
    p.texto(itens[i], x + 3, yy, w - 6, { tam: 6.2 });
    yy += altura + 2;
    if (i < itens.length - 1) linhaTracejada(p, x + 3, yy - 1, x + w - 3);
  }
}

function blocoUso(p: Pintor, c: CteLido): Bloco {
  const w = LARGURA / 2;
  const emissor = c.observacoes.usoEmissor.slice(0, LIMITE_OCORRENCIAS).map((i) => limparTexto(i.campo ? `${i.campo}: ${i.texto}` : i.texto)).filter(Boolean);
  const fisco = c.observacoes.fisco.slice(0, LIMITE_OCORRENCIAS).map((i) => limparTexto(i.campo ? `${i.campo}: ${i.texto}` : i.texto)).filter(Boolean);
  const alturaDe = (itens: string[]) => 10 + itens.reduce((acc, t) => acc + p.altura(t, w - 6, 6.2) + 2, 0) + 2;
  const h = Math.max(ALTURA_USO_MIN, Math.min(ALTURA_USO_MAX, Math.max(alturaDe(emissor), alturaDe(fisco))));
  return {
    altura: h,
    desenhar: (y) => {
      p.caixa(MX, y, w, h);
      p.caixa(MX + w, y, w, h);
      p.texto('USO EXCLUSIVO DO EMISSOR DO CT-E', MX, y + 2.4, w, { fonte: NEGRITO, tam: 5.8, alinhar: 'center' });
      p.texto('RESERVADO AO FISCO', MX + w, y + 2.4, w, { fonte: NEGRITO, tam: 5.8, alinhar: 'center' });
      desenharItens(p, MX, y, w, h, emissor);
      desenharItens(p, MX + w, y, w, h, fisco);
      return y + h;
    },
  };
}

// ── Montagem ─────────────────────────────────────────────────────────

function desenhar(c: CteLido, op: OpcoesDacte): Promise<Buffer> {
  return montarPdf({ titulo: `DACTE CT-e ${c.numero} série ${c.serie}`, assunto: `Chave de acesso ${c.chave}`, semCompressao: op.semCompressao }, (doc) => {
    const p = new Pintor(doc);
    const folhas: PosicaoFolha[] = [];

    /** Folha nova com o cabeçalho completo (item 2.12 do MOC); devolve o `y` logo abaixo dele. */
    const novaFolha = (primeira = false): number => {
      if (!primeira) doc.addPage();
      const cab = cabecalho(p, c, TOPO);
      folhas.push(cab.folha);
      return cab.y;
    };

    let y = novaFolha(true);
    y = inicioETermino(p, c, y);
    y = partesDoTransporte(p, c, y);
    y = carga(p, c, y);
    y = componentes(p, c, y + GAP);
    y = impostos(p, c, y + GAP);
    if (c.imposto.ibsCbs) y = ibsCbs(p, c, y + GAP);
    if (c.referencias.length) y = referencias(p, c, y + GAP);

    const secaoDeDocumentos = (titulo: string, todos: DocumentoCte[]): SecaoDeTabela => {
      const docs = todos.slice(0, LIMITE_DOCUMENTOS);
      return { titulo, total: docs.length, omitidos: todos.length - docs.length, unidade: 'documentos', desenhar: (t, ini, y0, lim) => tabelaDocumentos(p, t, docs, ini, y0, lim) };
    };
    const secoes: SecaoDeTabela[] = [secaoDeDocumentos('DOCUMENTOS ORIGINÁRIOS', c.documentos)];
    if (c.documentosAnteriores.length) secoes.push(secaoDeDocumentos('DOCUMENTOS DE TRANSPORTE ANTERIOR', c.documentosAnteriores));
    if (c.veiculosNovos.length) {
      const veiculos = c.veiculosNovos.slice(0, LIMITE_DOCUMENTOS);
      secoes.push({
        titulo: 'INFORMAÇÕES SOBRE OS VEÍCULOS NOVOS TRANSPORTADOS', total: veiculos.length, omitidos: c.veiculosNovos.length - veiculos.length, unidade: 'veículos',
        desenhar: (t, ini, y0, lim) => tabelaVeiculos(p, t, veiculos, ini, y0, lim),
      });
    }
    let secao = 0;
    let inicio = 0;
    /** Desenha as tabelas de `yIni` até `yLimite`, passando de uma seção à seguinte enquanto houver lugar. Devolve o `y` final. */
    const preencherDocumentos = (yIni: number, yLimite: number): number => {
      let yy = yIni;
      while (secao < secoes.length) {
        const s = secoes[secao];
        const limite = s.omitidos > 0 ? yLimite - 9 : yLimite;
        if (limite - yy < 8.5 + ALTURA_CABECALHO_DOC + ALTURA_LINHA_DOC) break;
        const r = s.desenhar(inicio > 0 ? `${s.titulo} (continuação)` : s.titulo, inicio, yy, limite);
        yy = r.y;
        inicio = r.proximo;
        if (inicio < s.total) break;
        if (s.omitidos > 0) {
          p.texto(`(${s.omitidos} demais ${s.unidade} no XML)`, MX, yy + 1.5, LARGURA, { tam: 6, cor: '#555' });
          yy += 9;
        }
        secao += 1;
        inicio = 0;
        if (secao < secoes.length) yy += GAP;
      }
      return yy;
    };

    const obs = blocoObservacoes(p, textoDasObservacoes(c));
    const rodape: Bloco[] = [blocoFluxo(p, c), obs.bloco, blocoModal(p, c), blocoUso(p, c)];
    const alturaRodape = rodape.reduce((acc, b) => acc + GAP + b.altura, 0);

    // Na primeira folha ficam todos os quadros; os documentos que não couberem seguem nas folhas adicionais (modelo do MOC, itens 2.12 e 5).
    const yDocs = y + GAP;
    const minimoDocs = 8.5 + ALTURA_CABECALHO_DOC + 2 * ALTURA_LINHA_DOC;
    const rodapeNaPrimeiraFolha = yDocs + minimoDocs + alturaRodape <= LIMITE_Y;
    y = preencherDocumentos(yDocs, rodapeNaPrimeiraFolha ? LIMITE_Y - alturaRodape : LIMITE_Y);
    const desenharRodape = () => {
      for (const b of rodape) {
        if (y + GAP + b.altura > LIMITE_Y) y = novaFolha();
        y = b.desenhar(y + GAP);
      }
    };
    if (rodapeNaPrimeiraFolha) desenharRodape();
    while (secao < secoes.length) {
      y = novaFolha();
      y = preencherDocumentos(y + GAP, LIMITE_Y);
    }
    if (!rodapeNaPrimeiraFolha) desenharRodape();

    // observações que não couberam na primeira folha
    let resto = obs.resto;
    while (resto) {
      if (LIMITE_Y - y < 60) y = novaFolha();
      else y += GAP;
      y = p.titulo('OBSERVAÇÕES GERAIS (continuação)', y);
      const w = LARGURA - 6;
      const disponivel = LIMITE_Y - y;
      const natural = p.altura(resto, w, 6.8) + 10;
      const cabe = natural <= disponivel;
      const altura = cabe ? natural : disponivel;
      // o máximo com 1 garante que cada volta consome texto, mesmo que algo estranho no cálculo da altura não deixe caber nada
      const corte = cabe ? resto.length : Math.max(1, prefixoQueCabe(p, resto, w, altura - 10 - 8, 6.8));
      p.caixa(MX, y, LARGURA, altura);
      p.texto(resto.slice(0, corte), MX + 3, y + 3, w, { tam: 6.8, altura: altura - 5 });
      if (!cabe) p.texto('CONTINUA NA FOLHA SEGUINTE', MX, y + altura - 8, LARGURA - 3, { fonte: NEGRITO, tam: 5.6, alinhar: 'right' });
      y += altura;
      resto = resto.slice(corte).trimStart();
      if (resto) y = novaFolha();
    }

    // número da folha, marcas d'água e rodapé em todas as folhas
    const total = folhas.length;
    const marca = op.cancelada ? 'CANCELADA' : op.denegada ? 'DENEGADA' : c.homologacao ? 'SEM VALOR FISCAL' : '';
    for (let i = 0; i < total; i += 1) {
      doc.switchToPage(i);
      p.texto(`FOLHA ${i + 1}/${total}`, folhas[i].x, folhas[i].y, folhas[i].w, { fonte: NEGRITO, tam: 9, alinhar: 'center' });
      p.texto('DACTE gerado pelo InTAX a partir do XML do CT-e. O documento fiscal é o arquivo XML (Ajuste SINIEF 09/07); confira a autenticidade pela chave de acesso.', MX, RODAPE_Y, LARGURA, { tam: 5.6, cor: '#666', alinhar: 'center' });
      if (marca) marcaDagua(doc, marca, op.cancelada || op.denegada ? '#c62828' : '#555555');
    }
  });
}

/**
 * Gera o DACTE do CT-e (modelo 57) a partir do XML (cteProc ou CTe). Lança ErroLeituraCte (um ErroLeituraDocumento, com mensagem
 * para a tela) se o XML não for um CT-e legível do modelo 57: o CT-e OS (67), o CT-e Simplificado e a GTV-e têm outro documento auxiliar.
 */
export async function gerarDacte(xml: string, opcoes: OpcoesPdf = {}): Promise<Buffer> {
  return desenhar(lerCte(xml), opcoes);
}
