/**
 * DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) em PDF, retrato A4, gerado a partir do XML da NF-e (modelo 55).
 * Segue os blocos do leiaute do MOC: canhoto, identificação do emitente, chave de acesso com código de barras, destinatário,
 * fatura, cálculo do imposto, transportador, itens (em quantas páginas forem precisas), ISSQN e dados adicionais.
 * O documento fiscal é o XML (Ajuste SINIEF 07/05, cláusula quarta): o DANFE só mostra o que o XML traz e diz isso no rodapé.
 */
import {
  fmtCep, fmtChave, fmtData, fmtDocumento, fmtFone, fmtHora, fmtNumero, fmtNumeroNota, fmtNumeroSeHouver, limparTexto,
} from './formatos-danfe';
import { ErroLeituraNfe, ItemNfe, NfeLida, ParteNfe, lerNfe } from './nfe-leitor';
import { A4, Alinhamento, NEGRITO, NORMAL, OpcoesPdf, Pintor, marcaDagua, montarPdf, prefixoQueCabe } from './pintor';

/** Opções do DANFE: as comuns a todos os PDF (cancelada, denegada e semCompressao). */
export type OpcoesDanfe = OpcoesPdf;

const PAGINA = A4;
const MX = 14;
const LARGURA = PAGINA.largura - 2 * MX;
const TOPO = 14;
const LIMITE_Y = 806;
const RODAPE_Y = 824;
const LIMITE_TEXTO_ADICIONAL = 20000;

const FRETE: Record<string, string> = {
  '0': '0-Emitente', '1': '1-Destinatário', '2': '2-Terceiros', '3': '3-Próprio Rem.', '4': '3-Próprio Dest.', '9': '9-Sem Frete',
};

const enderecoEmLinhas = (p: ParteNfe): string[] => {
  const e = p.endereco;
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ') + (e.complemento ? ` - ${e.complemento}` : '');
  const cidade = [e.municipio, e.uf].filter(Boolean).join(' - ');
  return [rua, [e.bairro, e.cep ? `CEP ${fmtCep(e.cep)}` : ''].filter(Boolean).join(' - '), cidade, e.fone ? `Fone: ${fmtFone(e.fone)}` : ''].filter(Boolean);
};

const enderecoCompleto = (p: ParteNfe): string => {
  const e = p.endereco;
  return [[e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro, [e.municipio, e.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' - ');
};

// ── Blocos da primeira página ────────────────────────────────────────

function canhoto(p: Pintor, n: NfeLida, y: number): number {
  const emissao = fmtData(n.dataEmissao);
  const dest = n.destinatario ? `${n.destinatario.nome}${enderecoCompleto(n.destinatario) ? ` - ${enderecoCompleto(n.destinatario)}` : ''}` : '';
  p.caixa(MX, y, 438, 26);
  p.texto(
    limparTexto(`RECEBEMOS DE ${n.emitente.nome} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. EMISSÃO: ${emissao} VALOR TOTAL: R$ ${fmtNumero(n.totais.valorNota)} DESTINATÁRIO: ${dest}`),
    MX + 3, y + 3, 432, { tam: 6, altura: 22 },
  );
  p.campo(MX, y + 26, 100, 24, 'DATA DE RECEBIMENTO', '');
  p.campo(MX + 100, y + 26, 338, 24, 'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', '');
  p.caixa(MX + 438, y, LARGURA - 438, 50);
  p.texto('NF-e', MX + 438, y + 6, LARGURA - 438, { fonte: NEGRITO, tam: 12, alinhar: 'center' });
  p.texto(`Nº ${fmtNumeroNota(n.numero)}`, MX + 438, y + 24, LARGURA - 438, { fonte: NEGRITO, tam: 8, alinhar: 'center' });
  p.texto(`SÉRIE ${n.serie}`, MX + 438, y + 35, LARGURA - 438, { tam: 7.5, alinhar: 'center' });
  const yLinha = y + 56;
  p.doc.lineWidth(0.5).strokeColor('#000').dash(3, { space: 2 }).moveTo(MX, yLinha).lineTo(MX + LARGURA, yLinha).stroke().undash();
  return yLinha + 6;
}

/** Devolve o y seguinte e onde escrever "FOLHA n/N" (preenchido no fim, quando se sabe o total de páginas). */
function cabecalho(p: Pintor, n: NfeLida, y: number): { y: number; folha: { x: number; y: number; w: number } } {
  const ALTURA = 98;
  const WEMIT = 240;
  const WDANFE = 96;
  const WCHAVE = LARGURA - WEMIT - WDANFE;

  // emitente
  p.caixa(MX, y, WEMIT, ALTURA);
  const nomeEmit = limparTexto(n.emitente.nome);
  const hNome = Math.min(p.altura(nomeEmit, WEMIT - 10, 9.5, NEGRITO), 34);
  p.texto(nomeEmit, MX + 5, y + 8, WEMIT - 10, { fonte: NEGRITO, tam: 9.5, alinhar: 'center', altura: 34 });
  p.texto(enderecoEmLinhas(n.emitente).map((l) => limparTexto(l)).join('\n'), MX + 5, y + 12 + hNome, WEMIT - 10, { tam: 7, alinhar: 'center', altura: ALTURA - 16 - hNome });

  // DANFE
  const xd = MX + WEMIT;
  p.caixa(xd, y, WDANFE, ALTURA);
  p.texto('DANFE', xd, y + 5, WDANFE, { fonte: NEGRITO, tam: 13, alinhar: 'center' });
  p.texto('Documento Auxiliar da Nota Fiscal Eletrônica', xd + 4, y + 22, WDANFE - 8, { tam: 6.2, alinhar: 'center', altura: 24 });
  p.texto('0 - ENTRADA', xd + 6, y + 47, 56, { tam: 6.5 });
  p.texto('1 - SAÍDA', xd + 6, y + 55, 56, { tam: 6.5 });
  p.caixa(xd + 66, y + 47, 20, 16);
  p.texto(n.tipoOperacao, xd + 66, y + 49.5, 20, { fonte: NEGRITO, tam: 11, alinhar: 'center' });
  p.texto(`Nº ${fmtNumeroNota(n.numero)}`, xd, y + 68, WDANFE, { fonte: NEGRITO, tam: 8, alinhar: 'center' });
  p.texto(`SÉRIE ${n.serie}`, xd, y + 78, WDANFE, { tam: 7.5, alinhar: 'center' });

  // chave de acesso
  const xc = xd + WDANFE;
  p.caixa(xc, y, WCHAVE, ALTURA);
  p.codigoDeBarras(xc + 8, y + 7, WCHAVE - 16, 36, n.chave);
  p.texto('CHAVE DE ACESSO', xc + 3, y + 48, WCHAVE - 6, { tam: 4.8, cor: '#333' });
  p.texto(fmtChave(n.chave), xc + 3, y + 54.5, WCHAVE - 6, { fonte: NEGRITO, tam: 7.2, alinhar: 'center' });
  p.linha(xc, y + 68, xc + WCHAVE, y + 68);
  p.texto('Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora', xc + 6, y + 73, WCHAVE - 12, { tam: 6.4, alinhar: 'center', altura: 24 });

  return { y: y + ALTURA, folha: { x: xd, y: y + 87.5, w: WDANFE } };
}

function identificacao(p: Pintor, n: NfeLida, y0: number): number {
  const prot = n.protocolo;
  const dataProt = prot ? `${prot.numero} - ${fmtData(prot.dataHora)} ${fmtHora(prot.dataHora)}`.trim() : '';
  let y = p.linhaDeCampos(y0, 22, [
    { w: 358, rotulo: 'NATUREZA DA OPERAÇÃO', valor: limparTexto(n.naturezaOperacao) },
    { w: 0, rotulo: 'PROTOCOLO DE AUTORIZAÇÃO DE USO', valor: dataProt, negrito: true },
  ]);
  y = p.linhaDeCampos(y, 22, [
    { w: 190, rotulo: 'INSCRIÇÃO ESTADUAL', valor: n.emitente.ie },
    { w: 190, rotulo: 'INSCRIÇÃO ESTADUAL DO SUBST. TRIBUTÁRIO', valor: n.emitente.ieSt },
    { w: 0, rotulo: 'CNPJ / CPF', valor: fmtDocumento(n.emitente.documento) },
  ]);
  return y;
}

function destinatario(p: Pintor, n: NfeLida, y0: number): number {
  const d = n.destinatario;
  const e = d?.endereco;
  let y = p.titulo('DESTINATÁRIO / REMETENTE', y0);
  y = p.linhaDeCampos(y, 22, [
    { w: 340, rotulo: 'NOME / RAZÃO SOCIAL', valor: limparTexto(d?.nome) },
    { w: 130, rotulo: 'CNPJ / CPF', valor: fmtDocumento(d?.documento ?? '') },
    { w: 0, rotulo: 'DATA DA EMISSÃO', valor: fmtData(n.dataEmissao) },
  ]);
  y = p.linhaDeCampos(y, 22, [
    { w: 260, rotulo: 'ENDEREÇO', valor: limparTexto([e?.logradouro, e?.numero].filter(Boolean).join(', ') + (e?.complemento ? ` - ${e.complemento}` : '')) },
    { w: 140, rotulo: 'BAIRRO / DISTRITO', valor: limparTexto(e?.bairro) },
    { w: 70, rotulo: 'CEP', valor: fmtCep(e?.cep ?? '') },
    { w: 0, rotulo: 'DATA DA SAÍDA / ENTRADA', valor: fmtData(n.dataSaida) },
  ]);
  y = p.linhaDeCampos(y, 22, [
    { w: 200, rotulo: 'MUNICÍPIO', valor: limparTexto(e?.municipio) },
    { w: 110, rotulo: 'FONE / FAX', valor: fmtFone(e?.fone ?? '') },
    { w: 30, rotulo: 'UF', valor: e?.uf ?? '' },
    { w: 130, rotulo: 'INSCRIÇÃO ESTADUAL', valor: d?.ie ?? '' },
    { w: 0, rotulo: 'HORA DA SAÍDA / ENTRADA', valor: fmtHora(n.dataSaida) },
  ]);
  return y;
}

function fatura(p: Pintor, n: NfeLida, y0: number): number {
  if (!n.duplicatas.length) return y0;
  const POR_LINHA = 6;
  const W = LARGURA / POR_LINHA;
  const mostradas = n.duplicatas.slice(0, POR_LINHA * 4);
  let y = p.titulo('FATURA / DUPLICATAS', y0);
  const linhas = Math.ceil(mostradas.length / POR_LINHA);
  for (let l = 0; l < linhas; l += 1) {
    for (let c = 0; c < POR_LINHA; c += 1) {
      const d = mostradas[l * POR_LINHA + c];
      const x = MX + c * W;
      p.caixa(x, y, W, 24);
      if (!d) continue;
      p.texto(`Num.: ${d.numero}`, x + 2, y + 2, W - 4, { tam: 6.2 });
      p.texto(`Venc.: ${fmtData(d.vencimento)}`, x + 2, y + 9, W - 4, { tam: 6.2 });
      p.texto(`Valor: R$ ${fmtNumero(d.valor)}`, x + 2, y + 16, W - 4, { fonte: NEGRITO, tam: 6.2 });
    }
    y += 24;
  }
  if (n.duplicatas.length > mostradas.length) {
    p.texto(`(mais ${n.duplicatas.length - mostradas.length} duplicata(s) no XML)`, MX, y + 1, LARGURA, { tam: 5.5, cor: '#555' });
    y += 7;
  }
  return y;
}

function impostos(p: Pintor, n: NfeLida, y0: number): number {
  const t = n.totais;
  const W = LARGURA / 8;
  const num = (v: string) => fmtNumero(v);
  let y = p.titulo('CÁLCULO DO IMPOSTO', y0);
  y = p.linhaDeCampos(y, 22, [
    { w: W, rotulo: 'BASE DE CÁLCULO DO ICMS', valor: num(t.baseIcms), alinhar: 'right' },
    { w: W, rotulo: 'VALOR DO ICMS', valor: num(t.valorIcms), alinhar: 'right' },
    { w: W, rotulo: 'BASE DE CÁLC. ICMS S.T.', valor: num(t.baseIcmsSt), alinhar: 'right' },
    { w: W, rotulo: 'VALOR DO ICMS SUBST.', valor: num(t.valorIcmsSt), alinhar: 'right' },
    { w: W, rotulo: 'V. IMP. IMPORTAÇÃO', valor: num(t.valorImpostoImportacao), alinhar: 'right' },
    { w: W, rotulo: 'V. ICMS DESONERADO', valor: num(t.valorIcmsDesonerado), alinhar: 'right' },
    { w: W, rotulo: 'VALOR DO FCP', valor: num(t.valorFcp), alinhar: 'right' },
    { w: W, rotulo: 'V. TOTAL DOS PRODUTOS', valor: num(t.valorProdutos), alinhar: 'right' },
  ]);
  y = p.linhaDeCampos(y, 22, [
    { w: W, rotulo: 'VALOR DO FRETE', valor: num(t.frete), alinhar: 'right' },
    { w: W, rotulo: 'VALOR DO SEGURO', valor: num(t.seguro), alinhar: 'right' },
    { w: W, rotulo: 'DESCONTO', valor: num(t.desconto), alinhar: 'right' },
    { w: W, rotulo: 'OUTRAS DESPESAS', valor: num(t.outras), alinhar: 'right' },
    { w: W, rotulo: 'VALOR DO IPI', valor: num(t.ipi), alinhar: 'right' },
    { w: W, rotulo: 'V. APROX. DOS TRIBUTOS', valor: num(t.tributosAproximados), alinhar: 'right' },
    { w: W * 2, rotulo: 'VALOR TOTAL DA NOTA', valor: num(t.valorNota), alinhar: 'right', negrito: true },
  ]);
  return y;
}

function transportador(p: Pintor, n: NfeLida, y0: number): number {
  const t = n.transporte;
  const tr = t.transportadora;
  const soma = (campo: 'quantidade' | 'pesoBruto' | 'pesoLiquido') => t.volumes.reduce((acc, v) => acc + (Number(v[campo]) || 0), 0);
  const primeiro = t.volumes[0];
  let y = p.titulo('TRANSPORTADOR / VOLUMES TRANSPORTADOS', y0);
  y = p.linhaDeCampos(y, 22, [
    { w: 205, rotulo: 'NOME / RAZÃO SOCIAL', valor: limparTexto(tr?.nome) },
    { w: 85, rotulo: 'FRETE', valor: FRETE[t.modalidadeFrete] ?? t.modalidadeFrete },
    { w: 60, rotulo: 'CÓDIGO ANTT', valor: t.rntc },
    { w: 70, rotulo: 'PLACA DO VEÍCULO', valor: t.placa },
    { w: 25, rotulo: 'UF', valor: t.ufPlaca },
    { w: 0, rotulo: 'CNPJ / CPF', valor: fmtDocumento(tr?.documento ?? '') },
  ]);
  y = p.linhaDeCampos(y, 22, [
    { w: 240, rotulo: 'ENDEREÇO', valor: limparTexto(tr?.endereco.logradouro) },
    { w: 160, rotulo: 'MUNICÍPIO', valor: limparTexto(tr?.endereco.municipio) },
    { w: 25, rotulo: 'UF', valor: tr?.endereco.uf ?? '' },
    { w: 0, rotulo: 'INSCRIÇÃO ESTADUAL', valor: tr?.ie ?? '' },
  ]);
  y = p.linhaDeCampos(y, 22, [
    { w: 80, rotulo: 'QUANTIDADE', valor: t.volumes.length ? fmtNumero(String(soma('quantidade')), 0, 0) : '' },
    { w: 140, rotulo: 'ESPÉCIE', valor: limparTexto(primeiro?.especie) },
    { w: 110, rotulo: 'MARCA', valor: limparTexto(primeiro?.marca) },
    { w: 100, rotulo: 'NUMERAÇÃO', valor: limparTexto(primeiro?.numeracao) },
    { w: 68, rotulo: 'PESO BRUTO', valor: t.volumes.length ? fmtNumero(String(soma('pesoBruto')), 3, 3) : '', alinhar: 'right' },
    { w: 0, rotulo: 'PESO LÍQUIDO', valor: t.volumes.length ? fmtNumero(String(soma('pesoLiquido')), 3, 3) : '', alinhar: 'right' },
  ]);
  return y;
}

// ── Itens ────────────────────────────────────────────────────────────

interface Coluna { rotulo: string; w: number; alinhar: Alinhamento; valor: (i: ItemNfe) => string }
const COLUNAS: Coluna[] = [
  { rotulo: 'CÓDIGO PRODUTO', w: 46, alinhar: 'left', valor: (i) => limparTexto(i.codigo) },
  { rotulo: 'DESCRIÇÃO DO PRODUTO / SERVIÇO', w: 131, alinhar: 'left', valor: () => '' },
  { rotulo: 'NCM/SH', w: 36, alinhar: 'left', valor: (i) => i.ncm },
  { rotulo: 'O/CST', w: 22, alinhar: 'center', valor: (i) => i.origemCst },
  { rotulo: 'CFOP', w: 22, alinhar: 'center', valor: (i) => i.cfop },
  { rotulo: 'UN', w: 16, alinhar: 'center', valor: (i) => limparTexto(i.unidade) },
  { rotulo: 'QUANT.', w: 40, alinhar: 'right', valor: (i) => fmtNumero(i.quantidade, 2, 4) },
  { rotulo: 'V. UNIT.', w: 42, alinhar: 'right', valor: (i) => fmtNumero(i.valorUnitario, 2, 4) },
  { rotulo: 'V. TOTAL', w: 44, alinhar: 'right', valor: (i) => fmtNumero(i.valorTotal) },
  { rotulo: 'V. DESC.', w: 28, alinhar: 'right', valor: (i) => fmtNumeroSeHouver(i.desconto) },
  { rotulo: 'BC ICMS', w: 38, alinhar: 'right', valor: (i) => fmtNumero(i.baseIcms) },
  { rotulo: 'V. ICMS', w: 32, alinhar: 'right', valor: (i) => fmtNumero(i.valorIcms) },
  { rotulo: 'V. IPI', w: 28, alinhar: 'right', valor: (i) => fmtNumeroSeHouver(i.valorIpi) },
  { rotulo: 'ALÍQ. ICMS', w: 21.14, alinhar: 'right', valor: (i) => fmtNumero(i.aliquotaIcms) },
  { rotulo: 'ALÍQ. IPI', w: 21.14, alinhar: 'right', valor: (i) => fmtNumeroSeHouver(i.aliquotaIpi) },
];
const COL_DESCRICAO = 1;

function cabecalhoDaTabela(p: Pintor, y: number): number {
  const ALTURA = 16;
  let x = MX;
  COLUNAS.forEach((c) => {
    p.texto(c.rotulo, x + 1, y + 2.5, c.w - 2, { tam: 4.8, cor: '#333', alinhar: c.alinhar === 'right' ? 'right' : c.alinhar === 'center' ? 'center' : 'left', altura: 12 });
    x += c.w;
  });
  p.linha(MX, y + ALTURA, MX + LARGURA, y + ALTURA);
  return y + ALTURA;
}

function descricaoDoItem(i: ItemNfe): string {
  const base = limparTexto(i.descricao);
  const extra = limparTexto(i.infAdicional);
  return extra ? `${base}\n${extra}` : base;
}

function linhaDoItem(p: Pintor, i: ItemNfe, y: number, h: number) {
  let x = MX;
  COLUNAS.forEach((c, idx) => {
    if (idx === COL_DESCRICAO) p.texto(descricaoDoItem(i), x + 1.5, y + 2, c.w - 3, { tam: 6, altura: h - 2 });
    else p.texto(c.valor(i), x + 1.5, y + 2, c.w - 3, { tam: 6, alinhar: c.alinhar });
    x += c.w;
  });
}

/** Moldura e divisórias das colunas da parte da tabela que ficou nesta página. */
function fecharTabela(p: Pintor, yTopo: number, yFim: number) {
  p.caixa(MX, yTopo, LARGURA, yFim - yTopo);
  let x = MX;
  COLUNAS.slice(0, -1).forEach((c) => {
    x += c.w;
    p.linha(x, yTopo, x, yFim);
  });
}

// ── Resto do documento ───────────────────────────────────────────────

function issqn(p: Pintor, n: NfeLida, y0: number): number {
  if (!n.issqn) return y0;
  const W = LARGURA / 4;
  let y = p.titulo('CÁLCULO DO ISSQN', y0 + 4);
  y = p.linhaDeCampos(y, 22, [
    { w: W, rotulo: 'INSCRIÇÃO MUNICIPAL', valor: n.emitente.im },
    { w: W, rotulo: 'VALOR TOTAL DOS SERVIÇOS', valor: fmtNumero(n.issqn.valorServicos), alinhar: 'right' },
    { w: W, rotulo: 'BASE DE CÁLCULO DO ISSQN', valor: fmtNumero(n.issqn.baseCalculo), alinhar: 'right' },
    { w: W, rotulo: 'VALOR DO ISSQN', valor: fmtNumero(n.issqn.valorIss), alinhar: 'right' },
  ]);
  return y;
}

// ── Montagem ─────────────────────────────────────────────────────────

function desenhar(n: NfeLida, op: OpcoesDanfe): Promise<Buffer> {
  return montarPdf({ titulo: `DANFE NF-e ${n.numero} série ${n.serie}`, assunto: `Chave de acesso ${n.chave}`, semCompressao: op.semCompressao }, (doc) => {
    const p = new Pintor(doc);
    const folhas: { x: number; y: number; w: number }[] = [];

    let y = canhoto(p, n, TOPO);
    const cab = cabecalho(p, n, y);
    folhas.push(cab.folha);
    y = identificacao(p, n, cab.y);
    y = destinatario(p, n, y + 6);
    y = fatura(p, n, y + 6);
    y = impostos(p, n, y + 6);
    y = transportador(p, n, y + 6);

    /** Nova página com um cabeçalho curto (emitente, número e chave) no topo. */
    const novaPagina = (continuacao: string): number => {
      doc.addPage();
      const alto = TOPO;
      p.caixa(MX, alto, LARGURA, 40);
      p.texto(limparTexto(n.emitente.nome), MX + 5, alto + 5, 380, { fonte: NEGRITO, tam: 9 });
      p.texto(`DANFE - ${continuacao}`, MX + 5, alto + 17, 380, { tam: 7 });
      p.texto(`Chave de acesso: ${fmtChave(n.chave)}`, MX + 5, alto + 28, 400, { tam: 6.8 });
      p.texto(`NF-e Nº ${fmtNumeroNota(n.numero)}   SÉRIE ${n.serie}`, MX + 400, alto + 8, LARGURA - 405, { fonte: NEGRITO, tam: 8, alinhar: 'right' });
      folhas.push({ x: MX + 400, y: alto + 22, w: LARGURA - 405 });
      return alto + 46;
    };

    // itens
    y = p.titulo('DADOS DOS PRODUTOS / SERVIÇOS', y + 6);
    let topoTabela = y;
    y = cabecalhoDaTabela(p, y);
    p.doc.font(NORMAL).fontSize(6);
    for (const item of n.itens) {
      const hDesc = p.altura(descricaoDoItem(item), COLUNAS[COL_DESCRICAO].w - 3, 6);
      const h = Math.max(10, hDesc + 4);
      if (y + h > LIMITE_Y) {
        fecharTabela(p, topoTabela, y);
        y = p.titulo('DADOS DOS PRODUTOS / SERVIÇOS (continuação)', novaPagina('continuação dos itens'));
        topoTabela = y;
        y = cabecalhoDaTabela(p, y);
      }
      linhaDoItem(p, item, y, h);
      y += h;
      p.linha(MX, y, MX + LARGURA, y);
    }
    fecharTabela(p, topoTabela, y);

    y = issqn(p, n, y);

    // dados adicionais (pode continuar na página seguinte quando o texto é longo)
    const WESQ = LARGURA * 0.7;
    let texto = limparTexto([n.informacoesComplementares, n.informacoesFisco].filter(Boolean).join('\n'), true);
    // Texto livre muito longo não vira dezenas de páginas: o resto fica só no XML.
    if (texto.length > LIMITE_TEXTO_ADICIONAL) texto = `${texto.slice(0, LIMITE_TEXTO_ADICIONAL)}\n… (texto completo no XML)`;
    if (n.homologacao) texto = `${texto ? `${texto}\n` : ''}NF-e emitida em ambiente de homologação - sem valor fiscal.`;
    let continuaAdicionais = false;
    if (LIMITE_Y - y < 70) y = novaPagina('dados adicionais');
    else y += 6;
    for (;;) {
      y = p.titulo(continuaAdicionais ? 'DADOS ADICIONAIS (continuação)' : 'DADOS ADICIONAIS', y);
      const disponivel = Math.max(LIMITE_Y - y, 50);
      const altura = Math.max(p.altura(texto || ' ', WESQ - 6, 6.8) + 12, 56);
      const cabe = altura <= disponivel;
      const hCaixa = cabe ? altura : disponivel;
      const corte = cabe ? texto.length : prefixoQueCabe(p, texto, WESQ - 6, hCaixa - 12, 6.8);
      p.caixa(MX, y, WESQ, hCaixa);
      p.texto('INFORMAÇÕES COMPLEMENTARES', MX + 2, y + 1.6, WESQ - 4, { tam: 4.8, cor: '#333' });
      p.texto(texto.slice(0, corte), MX + 3, y + 8, WESQ - 6, { tam: 6.8, altura: hCaixa - 10 });
      p.campo(MX + WESQ, y, LARGURA - WESQ, hCaixa, 'RESERVADO AO FISCO', '');
      y += hCaixa;
      texto = texto.slice(corte).trimStart();
      if (!texto) break;
      continuaAdicionais = true;
      y = novaPagina('continuação dos dados adicionais');
    }

    // número de folhas, marcas d'água e rodapé em todas as páginas
    const total = folhas.length;
    const marca = op.cancelada ? 'CANCELADA' : op.denegada ? 'DENEGADA' : n.homologacao ? 'SEM VALOR FISCAL' : '';
    for (let i = 0; i < total; i += 1) {
      doc.switchToPage(i);
      p.texto(`FOLHA ${i + 1}/${total}`, folhas[i].x, folhas[i].y, folhas[i].w, { fonte: NEGRITO, tam: 7.5, alinhar: 'center' });
      p.texto('DANFE gerado pelo InTAX a partir do XML da NF-e. O documento fiscal é o arquivo XML (Ajuste SINIEF 07/05); confira a autenticidade pela chave de acesso.', MX, RODAPE_Y, LARGURA, { tam: 5.6, cor: '#666', alinhar: 'center' });
      if (marca) marcaDagua(doc, marca, op.cancelada || op.denegada ? '#c62828' : '#555555');
    }
  });
}

/**
 * Gera o DANFE da NF-e (modelo 55) a partir do XML (nfeProc ou NFe). Lança ErroLeituraNfe se o XML não for uma NF-e modelo 55.
 */
export async function gerarDanfe(xml: string, opcoes: OpcoesDanfe = {}): Promise<Buffer> {
  const nfe = lerNfe(xml);
  if (nfe.modelo && nfe.modelo !== '55') throw new ErroLeituraNfe(`O DANFE só é gerado para NF-e modelo 55 (este documento é modelo ${nfe.modelo}).`);
  return desenhar(nfe, opcoes);
}
