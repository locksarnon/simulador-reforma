/**
 * DANFE NFC-e (Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica, modelo 65) em PDF, no formato de cupom de 80 mm.
 * Segue o "Manual de Padrões do DANFE NFC-e e QR Code" v4.2 (março/2017), com o QR Code centralizado (figura 5 do manual):
 * cabeçalho (divisão I), itens (II), totais e formas de pagamento (III), consulta pela chave de acesso (IV), consumidor (VI),
 * identificação e protocolo (VII), mensagem fiscal (VIII), QR Code (V) e mensagem de interesse do contribuinte (IX).
 * O manual proíbe pôr no cupom informação que não conste do XML (só o protocolo de autorização é exceção). Por isso não há
 * rodapé do InTAX: a origem do PDF fica só nos metadados do arquivo.
 *
 * A altura do cupom é a do conteúdo, e o pdfkit precisa do tamanho da página ao criar o arquivo. Então o desenho é feito em
 * duas etapas: primeiro o conteúdo vira uma lista de linhas já medidas (altura + como pintar), depois o arquivo é criado com
 * a altura somada e as linhas são pintadas. Um cupom que passa de ~12.500 pt (mais de 600 itens) continua em mais páginas da
 * mesma largura, com o cabeçalho das colunas repetido, porque os leitores de PDF só garantem páginas de até 14.400 pt.
 */
import { fmtCep, fmtData, fmtDocumento, fmtFone, fmtHora, fmtNumero, limparTexto } from './formatos-danfe';
import { EnderecoNfce, ItemNfce, NfceLida, PagamentoNfce, lerNfce } from './nfce-leitor';
import { Alinhamento, NEGRITO, NORMAL, OpcoesPdf, Pintor, marcaDagua, montarPdf } from './pintor';
import { matrizQr } from './qr';

/** Opções do DANFE NFC-e: as comuns a todos os PDF (cancelada, denegada e semCompressao). */
export type OpcoesDanfeNfce = OpcoesPdf;

const LARGURA_PAGINA = 226.77; // 80 mm
const MX = 8.5; // margem lateral de 3 mm (o manual pede pelo menos 2 mm)
const W = LARGURA_PAGINA - 2 * MX;
const MARGEM_Y = 9;
const ALTURA_MAXIMA = 12500;
const TAM = 7;
const LIMITE_TEXTO = 5000;
const MAXIMO_DE_PAGAMENTOS = 100; // o leiaute admite no máximo 100 formas de pagamento
const COMPRIMENTO_MARCA = 235; // a marca d'água na diagonal tem de caber na largura de 80 mm

/**
 * QR Code: o manual pede no mínimo 25 x 25 mm contando a margem de silêncio e, acima disso, margem de 10% da dimensão total;
 * 10% de cada lado também dá mais do que os 4 módulos que o padrão ISO 18004 exige.
 */
const LADO_QR_MINIMO = 104; // ≈ 36,7 mm
const MODULO_QR_MINIMO = 1.35; // ≈ 0,48 mm: abaixo disso o QR Code fica pequeno demais para a câmera do celular
const MARGEM_QR = 0.1;
const BYTES_MAXIMOS_QR = 2331; // capacidade da versão 40, nível M (ISO/IEC 18004)

/**
 * Meios de pagamento (tPag). Fonte: leiaute 4.00 da NF-e/NFC-e (MOC, Anexo I) e a tabela nacional de meios de pagamento, que
 * desde 01/07/2024 é publicada à parte (Informe Técnico 2024.002, versões 1.00 a 1.11, no Portal Nacional da NF-e). Mudanças
 * conhecidas do informe: o 05 passou de "Crédito Loja" a "Cartão da Loja (Private Label)", o 17 ganhou "Dinâmico" e entraram
 * o 20 (PIX estático) e o 91 (pagamento posterior). NÃO CONFIRMADO contra a v1.11 (06/03/2026): o documento não abriu. Os
 * nomes abaixo são os curtos que cabem no cupom; um código fora da lista sai como "Meio de pagamento NN" e o 99 usa o xPag.
 */
const FORMAS_DE_PAGAMENTO: Record<string, string> = {
  '01': 'Dinheiro',
  '02': 'Cheque',
  '03': 'Cartão de Crédito',
  '04': 'Cartão de Débito',
  '05': 'Cartão da Loja (Private Label)',
  '10': 'Vale Alimentação',
  '11': 'Vale Refeição',
  '12': 'Vale Presente',
  '13': 'Vale Combustível',
  '14': 'Duplicata Mercantil',
  '15': 'Boleto Bancário',
  '16': 'Depósito Bancário',
  '17': 'Pagamento Instantâneo (PIX)',
  '18': 'Transferência bancária, Carteira Digital',
  '19': 'Programa de fidelidade, Cashback, Crédito Virtual',
  '20': 'Pagamento Instantâneo (PIX) Estático',
  '90': 'Sem pagamento',
  '91': 'Pagamento Posterior',
};

/** Situações em que o XML de uma nota denegada vem com o protocolo da denegação (cStat 110, 301, 302 e 303). */
const STATUS_DENEGADO = ['110', '301', '302', '303'];

// ── Linhas medidas ───────────────────────────────────────────────────

/** Um trecho do cupom já medido. `pintar` recebe o Pintor do arquivo final: a medição usa outro documento, só para medir texto. */
interface Linha {
  altura: number;
  pintar: (p: Pintor, y: number) => void;
  /** Só as linhas dos itens podem abrir uma nova página. */
  quebravel?: boolean;
}

const espaco = (altura: number): Linha => ({ altura, pintar: () => {} });
const sem = (linhas: (Linha | null | undefined)[]): Linha[] => linhas.filter((l): l is Linha => !!l);

interface OpcoesBloco { tam?: number; fonte?: string; alinhar?: Alinhamento }

/** Texto na largura útil, quebrado em quantas linhas precisar. Sem texto não há linha. */
function texto(p: Pintor, txt: string, o: OpcoesBloco = {}): Linha | null {
  if (!txt) return null;
  const { tam = TAM, fonte = NORMAL, alinhar = 'left' } = o;
  const altura = p.altura(txt, W, tam, fonte);
  return { altura, pintar: (pf, y) => pf.texto(txt, MX, y, W, { fonte, tam, alinhar, altura: altura + 2 }) };
}

/** Rótulo em negrito e valor em fonte normal, lado a lado e centralizados; se o par não couber numa linha, quebra tudo em fonte normal. */
function rotuloEValor(p: Pintor, rotulo: string, valor: string, tam = TAM): Linha | null {
  if (!valor) return null;
  p.doc.font(NEGRITO).fontSize(tam);
  const wRotulo = p.doc.widthOfString(`${rotulo} `);
  p.doc.font(NORMAL).fontSize(tam);
  const wValor = p.doc.widthOfString(valor);
  if (wRotulo + wValor > W) return texto(p, `${rotulo} ${valor}`, { tam, alinhar: 'center' });
  const x = MX + (W - wRotulo - wValor) / 2;
  return {
    altura: p.altura('A', W, tam),
    pintar: (pf, y) => {
      pf.texto(`${rotulo} `, x, y, wRotulo + 2, { fonte: NEGRITO, tam });
      pf.texto(valor, x + wRotulo, y, wValor + 2, { tam });
    },
  };
}

/** Rótulo à esquerda e valor à direita (totais e pagamentos). */
function par(p: Pintor, rotulo: string, valor: string, negrito = false, tam = 7.5): Linha {
  const fonte = negrito ? NEGRITO : NORMAL;
  const wValor = 80;
  const wRotulo = W - wValor - 4;
  const hRotulo = p.altura(rotulo, wRotulo, tam, fonte);
  return {
    altura: Math.max(hRotulo, p.altura('A', W, tam, fonte)),
    pintar: (pf, y) => {
      pf.texto(rotulo, MX, y, wRotulo, { fonte, tam, altura: hRotulo + 2 });
      pf.texto(valor, MX + W - wValor, y, wValor, { fonte, tam, alinhar: 'right' });
    },
  };
}

/** Separador tracejado entre as divisões do cupom. */
const separador = (): Linha => ({
  altura: 7,
  pintar: (pf, y) => { pf.doc.lineWidth(0.4).strokeColor('#000').dash(1.5, { space: 1.5 }).moveTo(MX, y + 3.5).lineTo(MX + W, y + 3.5).stroke().undash(); },
});

const linhaFina = (): Linha => ({ altura: 2.5, pintar: (pf, y) => pf.linha(MX, y + 1, MX + W, y + 1) });

// ── Formatação ───────────────────────────────────────────────────────

const algarismos = (valor: string, casas: number) => String(valor ?? '').replace(/\D/g, '').padStart(casas, '0');
const numero = (valor: string | undefined): number => Number(String(valor ?? '').trim()) || 0;
const moeda = (valor: number): string => fmtNumero(valor.toFixed(2));

/** Texto limpo e limitado: um campo gigante (XML adulterado) não pode esticar o cupom. O leiaute já limita cada campo, bem abaixo disto. */
function curto(txt: string | undefined, max: number): string {
  const limpo = limparTexto(txt);
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

/**
 * Endereço sem o país em duas linhas, que é onde o texto quebra bem: rua, número, complemento e bairro; depois município, UF e
 * CEP. (Deixar o pdfkit quebrar uma linha só separava o CEP da numeração.)
 */
function enderecoEmLinhas(e: EnderecoNfce): string[] {
  const via = [e.logradouro, e.numero, e.complemento, e.bairro].filter(Boolean).join(', ');
  const cidade = [[e.municipio, e.uf].filter(Boolean).join(' - '), e.cep ? `CEP: ${fmtCep(e.cep)}` : ''].filter(Boolean).join(' - ');
  return [via, cidade].filter(Boolean).map((linha) => curto(linha, 200));
}

function nomeDaForma(pg: PagamentoNfce): string {
  const descricao = curto(pg.descricao, 60);
  if (pg.forma === '99') return descricao || 'Outros';
  return FORMAS_DE_PAGAMENTO[pg.forma] ?? (descricao || `Meio de pagamento ${curto(pg.forma, 6) || 'não informado'}`);
}

const DATA_COM_FUSO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const minutosDoFuso = (fuso: string) => (fuso === 'Z' ? 0 : (fuso[0] === '-' ? -1 : 1) * (Number(fuso.slice(1, 3)) * 60 + Number(fuso.slice(4, 6))));

/**
 * O manual manda imprimir as datas "convertidas para o horário local". A emissão já vem no horário do emitente, e a SEFAZ pode
 * carimbar a autorização em outro fuso (o de Brasília, por exemplo, para um emitente de Mato Grosso). Esta função leva a data
 * `iso` para o fuso de `referencia` (a emissão). Se um dos dois textos não tem fuso, devolve `iso` como está.
 */
function noFusoDe(iso: string, referencia: string): string {
  const a = DATA_COM_FUSO.exec(iso);
  const b = DATA_COM_FUSO.exec(referencia);
  if (!a || !b) return iso;
  const instante = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]), Number(a[4]), Number(a[5]), Number(a[6])) - minutosDoFuso(a[7]) * 60000;
  const local = new Date(instante + minutosDoFuso(b[7]) * 60000);
  const dois = (v: number) => String(v).padStart(2, '0');
  return `${local.getUTCFullYear()}-${dois(local.getUTCMonth() + 1)}-${dois(local.getUTCDate())}T${dois(local.getUTCHours())}:${dois(local.getUTCMinutes())}:${dois(local.getUTCSeconds())}${b[7]}`;
}

/** Texto livre (infCpl, infAdFisco): mantém as quebras de linha e corta o que passa do limite, com aviso. */
function textoLivre(txt: string): string {
  const limpo = limparTexto(txt, true);
  return limpo.length > LIMITE_TEXTO ? `${limpo.slice(0, LIMITE_TEXTO)}\n… (texto completo no XML)` : limpo;
}

// ── Situação da nota ─────────────────────────────────────────────────

interface Situacao { contingencia: boolean; denegada: boolean; cancelada: boolean; homologacao: boolean }

function situacaoDaNota(n: NfceLida, op: OpcoesPdf): Situacao {
  return {
    // O aviso de contingência é do cupom impresso na emissão, antes da autorização. A nota de contingência que já tem protocolo
    // foi autorizada depois: "pendente de autorização" seria falso, e vale o protocolo.
    contingencia: n.contingencia && !n.protocolo,
    denegada: !!op.denegada || (!!n.protocolo && STATUS_DENEGADO.includes(n.protocolo.status)),
    cancelada: !!op.cancelada,
    homologacao: n.homologacao,
  };
}

// ── Divisões do cupom ────────────────────────────────────────────────

/** Divisão I: CNPJ, razão social, endereço completo sem o país e o nome do documento. */
function cabecalho(p: Pintor, n: NfceLida): Linha[] {
  const e = n.emitente;
  const fone = e.endereco.fone ? `Fone: ${fmtFone(e.endereco.fone)}` : '';
  return sem([
    texto(p, e.documento ? `${e.tipoDocumento || 'CNPJ'}: ${curto(fmtDocumento(e.documento), 30)}` : '', { tam: 7.5, alinhar: 'center' }),
    texto(p, curto(e.nome, 120), { tam: 8.5, fonte: NEGRITO, alinhar: 'center' }),
    ...enderecoEmLinhas(e.endereco).map((linha) => texto(p, linha, { alinhar: 'center' })),
    texto(p, fone, { alinhar: 'center' }),
    texto(p, 'Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica', { alinhar: 'center' }),
  ]);
}

/** Aviso em destaque logo abaixo do cabeçalho, entre dois blocos de linhas (figura 6 do manual). */
function faixaDeContingencia(): Linha {
  const altura = 30;
  const wCentro = 150;
  const xCentro = MX + (W - wCentro) / 2;
  return {
    altura,
    pintar: (pf, y) => {
      pf.doc.lineWidth(0.4).strokeColor('#000');
      for (let ly = y + 2; ly < y + altura - 1; ly += 3.2) {
        pf.doc.moveTo(MX, ly).lineTo(xCentro - 3, ly).stroke();
        pf.doc.moveTo(xCentro + wCentro + 3, ly).lineTo(MX + W, ly).stroke();
      }
      pf.texto('EMITIDA EM CONTINGÊNCIA', xCentro, y + 5, wCentro, { fonte: NEGRITO, tam: 10, alinhar: 'center' });
      pf.texto('Pendente de autorização', xCentro, y + 18, wCentro, { fonte: NEGRITO, tam: 7.5, alinhar: 'center' });
    },
  };
}

// Colunas da divisão II. Cada item ocupa duas linhas: código e descrição (que quebra) e, embaixo, quantidade, unidade, valor
// unitário e valor total. A largura de 80 mm não comporta as seis colunas da figura 2 do manual numa linha só.
const COD_W = 50;
const TAM_CODIGO = 6.5;
const ENTRE_COLUNAS = 3;
const X_DESC = MX + COD_W + ENTRE_COLUNAS;
const W_DESC = W - COD_W - ENTRE_COLUNAS;
const COL_TOTAL = { x: MX + W - 48, w: 48 };
const COL_UNIT = { x: COL_TOTAL.x - 46, w: 44 };
const COL_UN = { x: COL_UNIT.x - 22, w: 20 };
const COL_QTDE = { x: X_DESC, w: COL_UN.x - 2 - X_DESC };

/** Cabeçalho das colunas dos itens; repete no alto de cada página quando o cupom continua em outra. */
function cabecalhoDosItens(p: Pintor): Linha[] {
  const tam = 6.5;
  const h = p.altura('A', W, tam, NEGRITO);
  const rotulo = (pf: Pintor, txt: string, c: { x: number; w: number }, y: number, alinhar: Alinhamento = 'left') => pf.texto(txt, c.x, y, c.w, { fonte: NEGRITO, tam, alinhar });
  return [
    { altura: h, pintar: (pf, y) => { rotulo(pf, 'Código', { x: MX, w: COD_W }, y); rotulo(pf, 'Descrição', { x: X_DESC, w: W_DESC }, y); } },
    {
      altura: h + 1,
      pintar: (pf, y) => {
        rotulo(pf, 'Qtde', COL_QTDE, y, 'right');
        rotulo(pf, 'UN', COL_UN, y);
        rotulo(pf, 'Vl Unit', COL_UNIT, y, 'right');
        rotulo(pf, 'Vl Total', COL_TOTAL, y, 'right');
      },
    },
    linhaFina(),
  ];
}

function linhaDoItem(p: Pintor, i: ItemNfce): Linha {
  const codigo = curto(i.codigo, 60);
  const descricao = curto(i.descricao, 240);
  const linha = p.altura('A', W, TAM);
  const hCodigo = codigo ? p.altura(codigo, COD_W, TAM_CODIGO) : 0;
  const hDescricao = descricao ? p.altura(descricao, W_DESC, TAM) : 0;
  const h1 = Math.max(hCodigo, hDescricao, linha);
  return {
    altura: h1 + linha + 3,
    quebravel: true,
    pintar: (pf, y) => {
      pf.texto(codigo, MX, y, COD_W, { tam: TAM_CODIGO, altura: hCodigo + 2 });
      pf.texto(descricao, X_DESC, y, W_DESC, { tam: TAM, altura: hDescricao + 2 });
      const y2 = y + h1;
      pf.texto(fmtNumero(i.quantidade, 0, 4), COL_QTDE.x, y2, COL_QTDE.w, { tam: TAM, alinhar: 'right' });
      pf.texto(curto(i.unidade, 6), COL_UN.x, y2, COL_UN.w, { tam: TAM });
      pf.texto(fmtNumero(i.valorUnitario, 2, 4), COL_UNIT.x, y2, COL_UNIT.w, { tam: TAM, alinhar: 'right' });
      pf.texto(fmtNumero(i.valorTotal), COL_TOTAL.x, y2, COL_TOTAL.w, { tam: TAM, alinhar: 'right' });
    },
  };
}

/** Divisão II: detalhe dos itens (código, descrição, quantidade, unidade, valor unitário e valor total). */
function itens(p: Pintor, n: NfceLida, cabecalho: Linha[]): Linha[] {
  const omitidos = n.totalItens - n.itens.length;
  return sem([
    ...cabecalho,
    ...n.itens.map((i) => linhaDoItem(p, i)),
    omitidos > 0 ? texto(p, `(mais ${omitidos} ${omitidos === 1 ? 'item' : 'itens'} no XML)`, { alinhar: 'center' }) : null,
  ]);
}

/**
 * Divisão III: quantidade de itens, valor total, acréscimos e descontos, valor a pagar, formas de pagamento e troco.
 * O valor total inclui os serviços do ISSQN (vServ). Descontos, acréscimos e o valor a pagar só aparecem quando existem.
 */
function totais(p: Pintor, n: NfceLida): Linha[] {
  const t = n.totais;
  const somaItens = n.itens.reduce((acc, i) => acc + numero(i.valorTotal), 0);
  const valorTotal = t.valorProdutos || t.valorServicos ? numero(t.valorProdutos) + numero(t.valorServicos) : somaItens;
  const desconto = t.desconto ? numero(t.desconto) : n.itens.reduce((acc, i) => acc + numero(i.desconto), 0);
  const frete = numero(t.frete);
  const seguro = numero(t.seguro);
  const outras = numero(t.outras);
  const valorAPagar = t.valorNota ? numero(t.valorNota) : valorTotal - desconto + frete + seguro + outras;
  const ajustado = desconto !== 0 || frete !== 0 || seguro !== 0 || outras !== 0 || Math.abs(valorAPagar - valorTotal) > 0.005;
  const troco = numero(n.troco);
  const pagamentos = n.pagamentos.slice(0, MAXIMO_DE_PAGAMENTOS);
  return sem([
    par(p, 'Qtde. total de itens', fmtNumero(String(n.totalItens), 0, 0)),
    par(p, 'Valor total R$', moeda(valorTotal), !ajustado),
    desconto !== 0 ? par(p, 'Desconto R$', moeda(desconto)) : null,
    frete !== 0 ? par(p, 'Frete R$', moeda(frete)) : null,
    seguro !== 0 ? par(p, 'Seguro R$', moeda(seguro)) : null,
    outras !== 0 ? par(p, 'Outras despesas R$', moeda(outras)) : null,
    ajustado ? par(p, 'Valor a Pagar R$', moeda(valorAPagar), true) : null,
    pagamentos.length ? espaco(3) : null,
    pagamentos.length ? par(p, 'FORMA PAGAMENTO', 'VALOR PAGO R$') : null,
    ...pagamentos.map((pg) => par(p, nomeDaForma(pg), fmtNumero(pg.valor))),
    troco > 0 ? espaco(1.5) : null,
    troco > 0 ? par(p, 'Troco R$', moeda(troco)) : null,
  ]);
}

/** Divisão IV: endereço de consulta e a chave de acesso em 11 blocos de 4 dígitos. */
function consultaPelaChave(p: Pintor, n: NfceLida): Linha[] {
  return sem([
    texto(p, n.urlChave ? 'Consulte pela Chave de Acesso em' : 'Chave de Acesso', { fonte: NEGRITO, alinhar: 'center' }),
    texto(p, curto(n.urlChave, 200), { tam: 6.5, alinhar: 'center' }),
    texto(p, n.chave.replace(/(.{4})(?=.)/g, '$1 '), { alinhar: 'center' }), // 11 blocos de 4; não é o fmtChave, que só agrupa dígitos
  ]);
}

/** Divisão VI: CNPJ, CPF ou identificação de estrangeiro do consumidor, com nome e endereço quando houver; ou "não identificado". */
function consumidor(p: Pintor, n: NfceLida): Linha[] {
  const c = n.consumidor;
  const nome = curto(c?.nome, 120);
  const endereco = c ? enderecoEmLinhas(c.endereco) : [];
  let primeira: Linha | null;
  if (c && c.documento) {
    const rotulo = c.tipoDocumento === 'CNPJ' ? 'CONSUMIDOR CNPJ:' : c.tipoDocumento === 'CPF' ? 'CONSUMIDOR CPF:' : 'CONSUMIDOR Id. Estrangeiro:';
    // CNPJ e CPF levam a máscara; o documento de estrangeiro (passaporte etc.) é impresso como está.
    primeira = rotuloEValor(p, rotulo, curto(c.tipoDocumento === 'ESTRANGEIRO' ? c.documento : fmtDocumento(c.documento), 30));
  } else {
    primeira = texto(p, nome || endereco.length ? 'CONSUMIDOR' : 'CONSUMIDOR NÃO IDENTIFICADO', { fonte: NEGRITO, alinhar: 'center' });
  }
  return sem([primeira, texto(p, nome, { alinhar: 'center' }), ...endereco.map((linha) => texto(p, linha, { alinhar: 'center' }))]);
}

/** Divisão VII: número, série e data de emissão, protocolo e data da autorização (ou da denegação). */
function identificacao(p: Pintor, n: NfceLida, s: Situacao): Linha[] {
  const emissao = [
    n.numero ? `NFC-e nº ${algarismos(n.numero, 9)}` : 'NFC-e',
    n.serie ? `Série ${algarismos(n.serie, 3)}` : '',
    fmtData(n.dataEmissao),
    fmtHora(n.dataEmissao),
  ].filter(Boolean).join(' ');
  const evento = s.denegada ? 'denegação' : 'autorização';
  const prot = n.protocolo;
  const dataDoProtocolo = prot ? noFusoDe(prot.dataHora, n.dataEmissao) : '';
  return sem([
    texto(p, emissao, { fonte: NEGRITO, alinhar: 'center' }),
    prot ? rotuloEValor(p, `Protocolo de ${evento}:`, curto(prot.numero, 20)) : null,
    prot ? rotuloEValor(p, `Data de ${evento}`, [fmtData(dataDoProtocolo), fmtHora(dataDoProtocolo)].filter(Boolean).join(' ')) : null,
  ]);
}

/** Divisão VIII: aviso de contingência, de homologação e as mensagens fiscais do XML (infAdFisco). */
function mensagensFiscais(p: Pintor, n: NfceLida, s: Situacao): Linha[] {
  return sem([
    s.contingencia ? texto(p, 'EMITIDA EM CONTINGÊNCIA', { fonte: NEGRITO, tam: 10.5, alinhar: 'center' }) : null,
    s.contingencia ? texto(p, 'Pendente de autorização', { tam: 9, alinhar: 'center' }) : null,
    // O texto do manual, centralizado e em caixa alta; a quebra de linha é nossa, para não sobrar "VALOR FISCAL" sozinho.
    s.homologacao ? texto(p, 'EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO –\nSEM VALOR FISCAL', { fonte: NEGRITO, tam: 8, alinhar: 'center' }) : null,
    texto(p, textoLivre(n.informacoesFisco), { alinhar: 'center' }),
  ]);
}

/**
 * Divisão V: QR Code centralizado, com a margem de silêncio em volta (10% do lado do bloco em cada lado). O texto é o do XML,
 * sem nenhuma troca de caractere. Sem texto no XML, ou grande demais para um QR Code, não há bloco.
 */
function blocoDoQrCode(n: NfceLida): Linha | null {
  if (!n.qrCode || Buffer.byteLength(n.qrCode, 'utf8') > BYTES_MAXIMOS_QR) return null;
  let modulos: number;
  try {
    modulos = matrizQr(n.qrCode).length;
  } catch {
    return null;
  }
  const lado = Math.min(W, Math.max(LADO_QR_MINIMO, (modulos * MODULO_QR_MINIMO) / (1 - 2 * MARGEM_QR)));
  const margem = lado * MARGEM_QR;
  const x = MX + (W - lado) / 2;
  return { altura: lado, pintar: (pf, y) => pf.qrCode(x + margem, y + margem, lado - 2 * margem, n.qrCode) };
}

/** Divisão IX: tributos totais (Lei 12.741, quando o XML traz o valor e as informações complementares não o repetem) e as informações complementares. */
function mensagensDoContribuinte(p: Pintor, n: NfceLida): Linha[] {
  const complementares = textoLivre(n.informacoesComplementares);
  const tributos = numero(n.totais.tributosAproximados);
  const mostrarTributos = tributos > 0 && !/12\.?741/.test(complementares);
  return sem([
    mostrarTributos ? texto(p, `Tributos Totais Incidentes (Lei Federal 12.741/2012): R$${fmtNumero(n.totais.tributosAproximados)}`, { tam: 6.5, alinhar: 'center' }) : null,
    texto(p, complementares, { tam: 6.5 }),
  ]);
}

// ── Montagem ─────────────────────────────────────────────────────────

interface Cupom {
  linhas: Linha[];
  /** Cabeçalho das colunas dos itens, repetido no alto das páginas que continuam a lista. */
  cabecalhoDaContinuacao: Linha[];
}

function montarCupom(p: Pintor, n: NfceLida, s: Situacao): Cupom {
  const cabecalhoDaContinuacao = cabecalhoDosItens(p);
  const consumidorEIdentificacao = [...consumidor(p, n), espaco(3), ...identificacao(p, n, s)];
  const fiscais = mensagensFiscais(p, n, s);
  const qr = blocoDoQrCode(n);
  const contribuinte = mensagensDoContribuinte(p, n);
  const linhas = sem([
    ...cabecalho(p, n),
    s.contingencia ? espaco(4) : null,
    s.contingencia ? faixaDeContingencia() : null,
    separador(),
    ...itens(p, n, cabecalhoDaContinuacao),
    separador(),
    ...totais(p, n),
    separador(),
    ...consultaPelaChave(p, n),
    espaco(5),
    ...consumidorEIdentificacao,
    fiscais.length ? espaco(4) : null,
    ...fiscais,
    qr ? espaco(5) : null,
    qr,
    contribuinte.length ? espaco(4) : null,
    ...contribuinte,
  ]);
  return { linhas, cabecalhoDaContinuacao };
}

interface Pagina { linhas: Linha[]; altura: number }

const somaDeAlturas = (linhas: Linha[]) => linhas.reduce((acc, l) => acc + l.altura, 0);

/** Distribui as linhas em páginas de no máximo ALTURA_MAXIMA, abrindo página nova só entre dois itens. */
function paginar({ linhas, cabecalhoDaContinuacao }: Cupom): Pagina[] {
  const paginas: Pagina[] = [];
  const abrir = (): { atual: Linha[]; altura: number } => ({ atual: paginas.length ? [...cabecalhoDaContinuacao] : [], altura: 2 * MARGEM_Y + (paginas.length ? somaDeAlturas(cabecalhoDaContinuacao) : 0) });
  let { atual, altura } = abrir();
  for (const l of linhas) {
    if (l.quebravel && atual.length && altura + l.altura > ALTURA_MAXIMA) {
      paginas.push({ linhas: atual, altura });
      ({ atual, altura } = abrir());
    }
    atual.push(l);
    altura += l.altura;
  }
  paginas.push({ linhas: atual, altura });
  return paginas;
}

async function desenhar(n: NfceLida, op: OpcoesDanfeNfce): Promise<Buffer> {
  const situacao = situacaoDaNota(n, op);

  // 1ª etapa: mede. O PDF desta etapa é descartado; ele só existe para o pdfkit medir o texto.
  let cupom: Cupom = { linhas: [], cabecalhoDaContinuacao: [] };
  await montarPdf({ titulo: 'medição', assunto: 'medição', tamanho: [LARGURA_PAGINA, 100], semCompressao: true }, (doc) => {
    cupom = montarCupom(new Pintor(doc, MX, W), n, situacao);
  });
  const paginas = paginar(cupom);

  // 2ª etapa: cria o arquivo com a altura do conteúdo e pinta.
  const marca = situacao.cancelada ? 'CANCELADA' : situacao.denegada ? 'DENEGADA' : situacao.homologacao ? 'SEM VALOR FISCAL' : '';
  const corDaMarca = situacao.cancelada || situacao.denegada ? '#c62828' : '#555555';
  return montarPdf(
    { titulo: `DANFE NFC-e ${n.numero} série ${n.serie}`, assunto: `Chave de acesso ${n.chave}`, tamanho: [LARGURA_PAGINA, paginas[0].altura], semCompressao: op.semCompressao },
    (doc) => {
      const p = new Pintor(doc, MX, W);
      paginas.forEach((pagina, i) => {
        if (i > 0) doc.addPage({ size: [LARGURA_PAGINA, pagina.altura], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        let y = MARGEM_Y;
        for (const linha of pagina.linhas) {
          linha.pintar(p, y);
          y += linha.altura;
        }
      });
      if (marca) {
        paginas.forEach((pagina, i) => {
          doc.switchToPage(i);
          marcaDagua(doc, marca, corDaMarca, { largura: LARGURA_PAGINA, altura: pagina.altura }, COMPRIMENTO_MARCA);
        });
      }
    },
  );
}

/**
 * Gera o DANFE NFC-e (cupom de 80 mm) a partir do XML (nfeProc ou NFe). Lança ErroLeituraNfce (um ErroLeituraDocumento) se o XML
 * não for uma NFC-e modelo 65 legível; para uma NF-e modelo 55 a mensagem manda usar o DANFE.
 */
export async function gerarDanfeNfce(xml: string, opcoes: OpcoesDanfeNfce = {}): Promise<Buffer> {
  return desenhar(lerNfce(xml), opcoes);
}
