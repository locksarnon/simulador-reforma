/**
 * PDF da POLÍTICA do saneamento (docs/saneamento-diretrizes.md, seção 7), no padrão visual FAL/InTAX: identificação, regras vigentes por
 * aspecto, procedimentos com fluxograma, quadro de consulta por grupo (cadastro), controles internos, seção fiscal (completa só com a
 * Fase 2), versão e pendências. Só regras aprovadas saem como vigentes; o
 * documento leva a marca RASCUNHO enquanto a situação for Rascunho ou houver regra não aprovada.
 */
import PDFDocument from 'pdfkit';
import { desenharTabela } from '../../../pdf/pdf.service';
import { CONTROLES_INTERNOS } from '../../diretrizes/conteudo/controles-internos';
import { ASPECTOS, ROTULO_ASPECTO, type Aspecto, type LinhaLimite } from '../../diretrizes/tipos';
import { desenharLogoFal, LOGO_FAL } from '../../../marca/logo-fal';
import { AMBAR, AMBAR_FUNDO, BORDA, BRANCO, CINZA, FUNDO_CARD, MARGEM, MARGEM_TOPO, SITE, TEXTO, VERDE, VERDE_ESCURO } from './estilo';
import { alturaFluxo, desenharFluxograma, type GeometriaNo } from './fluxograma';
import { dataBr, juntar, limpar, ordenarPt } from './texto';
import { diferencaDaPadrao, limiteNaoConfirmado, tabelasDoAnexo, textoGrupos, topicosDaRegra } from './topicos';
import type { DadosPolitica, RegraPolitica } from './tipos';
import { criteriosParaPolitica } from '../../criterios/politica';
import { CAMADAS } from '../../tipos';

/** Colunas do quadro de consulta. */
const COLUNA_QUADRO: Record<Aspecto, string> = { NOMES: 'Nomes', ATRIBUTOS: 'Atributos', UNIDADES: 'Unidades', LIMITES: 'Limites', FISCAL: 'Fiscal' };

export const TITULO_POLITICA = 'Política de estoques e cadastro de produtos';

/** Linha da seção fiscal quando o projeto não tem a Fase 2. */
export const NOTA_SEM_FASE2 = 'A seção tributária (finalidade, cClassTrib, CST e crédito do estoque de IBS e CBS por item e operação) é entregue com a Fase 2 (Tributário e Reforma).';

/** Seção de versão e pendências (citada no aviso de rascunho, no quadro e nas regras). */
const SECAO_PENDENCIAS = 8;
/** Seção dos critérios das análises (o que cada camada considera, com os valores do projeto e as verificações manuais). */
const SECAO_CRITERIOS = 7;

/** Rascunho = situação Rascunho ou qualquer regra ainda não aprovada. */
export const emRascunho = (d: DadosPolitica) => d.identificacao.situacao !== 'APROVADA' || d.regras.some((r) => r.situacao !== 'APROVADA');

const ordemCodigo = (a: RegraPolitica, b: RegraPolitica) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });

/**
 * Regra padrão do aspecto (a base de comparação das demais): a aprovada que vale para todos os grupos, senão a primeira aprovada pelo código.
 * As outras regras do aspecto mostram só o que difere dela.
 */
export function regraPadrao(regras: RegraPolitica[], aspecto: Aspecto): RegraPolitica | undefined {
  const doAspecto = regras.filter((r) => r.aspecto === aspecto && r.situacao === 'APROVADA').sort(ordemCodigo);
  return doAspecto.find((r) => r.abrangencia.todos) ?? doAspecto[0];
}

export function textoVersao(v: DadosPolitica['identificacao']['versao']): string {
  if (!v) return 'Base atual (sem versão liberada)';
  const rot = v.rotulo ? limpar(v.rotulo).trim() : '';
  return `Versão ${v.numero}${rot ? ` — ${rot}` : ''}`;
}

export type ResultadoPolitica = { pdf: Buffer; paginas: number; fluxogramas: { titulo: string; nos: GeometriaNo[] }[] };

export async function gerarPdfPolitica(dados: DadosPolitica): Promise<Buffer> {
  return (await renderizarPolitica(dados)).pdf;
}

/** Igual a gerarPdfPolitica, devolvendo também a posição das formas dos fluxogramas (conferência em teste). */
export function renderizarPolitica(d: DadosPolitica): Promise<ResultadoPolitica> {
  return new Promise((resolve, reject) => {
    const id = d.identificacao;
    const rascunho = emRascunho(d);
    const cliente = limpar(id.cliente).trim() || 'Cliente';
    const pdf = new PDFDocument({
      size: 'A4', bufferPages: true, margins: { top: MARGEM_TOPO, bottom: MARGEM, left: MARGEM, right: MARGEM },
      info: { Title: `${TITULO_POLITICA} - ${cliente}`.slice(0, 120), Author: 'InTAX - FAL Agro' },
    });
    const chunks: Buffer[] = [];
    const fluxogramas: ResultadoPolitica['fluxogramas'] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve({ pdf: Buffer.concat(chunks), paginas: paginasTotal, fluxogramas }));
    pdf.on('error', reject);
    let paginasTotal = 0;

    try {
      const largura = pdf.page.width - MARGEM * 2;
      const limiteInferior = pdf.page.height - 56;
      // já no topo da página, não abre outra (evita página em branco quando o bloco é maior que a página)
      const garantir = (h: number) => { if (pdf.y + h > limiteInferior && pdf.y > MARGEM_TOPO + 5) pdf.addPage(); };

      // ---- Escrita ----
      const tituloSecao = (texto: string, proximo = 60) => {
        garantir(26 + proximo);
        pdf.moveDown(0.4);
        pdf.font('Helvetica-Bold').fontSize(13.5).fillColor(VERDE_ESCURO).text(texto, MARGEM, pdf.y, { width: largura });
        pdf.rect(MARGEM, pdf.y + 2, 28, 2).fill(VERDE);
        pdf.y += 10;
      };
      const subtitulo = (texto: string, proximo = 50) => {
        garantir(20 + proximo);
        pdf.moveDown(0.3);
        pdf.font('Helvetica-Bold').fontSize(11).fillColor(VERDE_ESCURO).text(texto, MARGEM, pdf.y, { width: largura });
        pdf.y += 4;
      };
      const rotulo = (texto: string, proximo = 30) => {
        garantir(14 + proximo);
        pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(CINZA).text(texto.toLocaleUpperCase('pt-BR'), MARGEM, pdf.y, { width: largura });
        pdf.y += 3;
      };
      const paragrafo = (texto: string, o: { italico?: boolean; cor?: string; tam?: number } = {}) => {
        const t = limpar(texto);
        pdf.font(o.italico ? 'Helvetica-Oblique' : 'Helvetica').fontSize(o.tam ?? 9.5);
        garantir(Math.min(pdf.heightOfString(t, { width: largura, lineGap: 1.5 }), 60));
        pdf.fillColor(o.cor ?? TEXTO).text(t, MARGEM, pdf.y, { width: largura, lineGap: 1.5 });
        pdf.y += 5;
      };
      const marcadores = (lista: string[], recuo = 0) => {
        for (const item of lista) {
          const t = limpar(item);
          pdf.font('Helvetica').fontSize(9.5);
          const h = pdf.heightOfString(t, { width: largura - 14 - recuo, lineGap: 1 });
          garantir(h + 3);
          const y = pdf.y;
          pdf.fillColor(VERDE).font('Helvetica-Bold').text('›', MARGEM + recuo, y, { width: 12, lineBreak: false });
          pdf.fillColor(TEXTO).font('Helvetica').text(t, MARGEM + recuo + 14, y, { width: largura - 14 - recuo, lineGap: 1 });
          pdf.y += 3;
        }
      };
      /** Cartões rótulo/valor, dois por linha (o mesmo desenho da identificação). */
      const cartoes = (campos: [string, string][], corValor: (rotulo: string) => string = () => VERDE_ESCURO) => {
        const gap = 10;
        const wCel = (largura - gap) / 2;
        for (let i = 0; i < campos.length; i += 2) {
          const par = campos.slice(i, i + 2).map(([r, v]) => [r, limpar(v)] as const);
          pdf.font('Helvetica-Bold').fontSize(10);
          const h = Math.max(...par.map(([, v]) => pdf.heightOfString(v, { width: wCel - 20 }))) + 26;
          garantir(h + 6);
          const y0 = pdf.y;
          par.forEach(([r, v], j) => {
            const x = MARGEM + j * (wCel + gap);
            pdf.roundedRect(x, y0, wCel, h, 5).fillAndStroke(FUNDO_CARD, BORDA);
            pdf.fillColor(CINZA).font('Helvetica-Bold').fontSize(7.5).text(limpar(r).toLocaleUpperCase('pt-BR'), x + 10, y0 + 8, { width: wCel - 20, lineBreak: false });
            pdf.fillColor(corValor(r)).font('Helvetica-Bold').fontSize(10).text(v, x + 10, y0 + 19, { width: wCel - 20 });
          });
          pdf.x = MARGEM;
          pdf.y = y0 + h + 6;
        }
      };
      const tabela = (cabecalho: string[], linhas: string[][], larguras: number[]) => {
        pdf.y += 2;
        desenharTabela(pdf, { cabecalho, linhas: linhas.map((l) => l.map(limpar)), larguras }, { x: MARGEM, largura, limiteInferior });
        pdf.y += 8;
      };

      // ---- Cabeçalho da 1ª página (o mesmo do relatório de fechamento) ----
      pdf.rect(0, 0, pdf.page.width, 64).fill(VERDE);
      pdf.fillColor(BRANCO).font('Helvetica-Bold').fontSize(20).text('InTAX', MARGEM, 22, { lineBreak: false });
      const xInTax = MARGEM + pdf.widthOfString('InTAX');
      pdf.font('Helvetica').fontSize(10).text('por', xInTax + 8, 33, { lineBreak: false });
      const xLogo = xInTax + 8 + pdf.widthOfString('por') + 6;
      if (LOGO_FAL) {
        pdf.roundedRect(xLogo, 19, 72, 26, 4).fill(BRANCO);
        desenharLogoFal(pdf, xLogo + 5, 22, 20);
      } else pdf.text('FAL Agro', xLogo, 33, { lineBreak: false });
      pdf.font('Helvetica').fontSize(9).fillColor('#cfe3d6').text('Consultoria tributária · FAL Agro', MARGEM, 22, { width: largura, align: 'right', lineBreak: false });

      pdf.y = 90;
      pdf.font('Helvetica-Bold').fontSize(18).fillColor(VERDE_ESCURO).text(TITULO_POLITICA, MARGEM, pdf.y, { width: largura });
      pdf.rect(MARGEM, pdf.y + 4, 36, 3).fill(VERDE);
      pdf.y += 14;
      const vig = dataBr(id.vigencia);
      pdf.font('Helvetica').fontSize(10.5).fillColor(CINZA)
        .text([cliente, textoVersao(id.versao), vig ? `Vigência a partir de ${vig}` : ''].filter(Boolean).join('  ·  '), MARGEM, pdf.y, { width: largura });
      pdf.y += 10;

      if (rascunho) {
        const naoAprovadas = d.regras.filter((r) => r.situacao !== 'APROVADA').length;
        const aviso = naoAprovadas
          ? `${naoAprovadas === 1 ? 'Há 1 regra ainda não aprovada' : `Há ${naoAprovadas} regras ainda não aprovadas`}. Só as regras aprovadas estão vigentes; as demais constam em Pendências (seção ${SECAO_PENDENCIAS}).`
          : 'A política ainda não foi aprovada pelo responsável. As regras aprovadas estão listadas, mas a política só entra em vigor após a aprovação.';
        pdf.font('Helvetica').fontSize(9);
        const h = pdf.heightOfString(aviso, { width: largura - 110 }) + 16;
        const y0 = pdf.y;
        pdf.roundedRect(MARGEM, y0, largura, Math.max(h, 30), 5).fillAndStroke(AMBAR_FUNDO, AMBAR);
        pdf.fillColor(AMBAR).font('Helvetica-Bold').fontSize(11).text('RASCUNHO', MARGEM + 12, y0 + Math.max(h, 30) / 2 - 6, { width: 90, lineBreak: false });
        pdf.fillColor(TEXTO).font('Helvetica').fontSize(9).text(aviso, MARGEM + 100, y0 + 8, { width: largura - 110 });
        pdf.y = y0 + Math.max(h, 30) + 6;
      }

      // ---- 1. Identificação ----
      tituloSecao('1. Identificação', 120);
      const situacao = rascunho ? 'Rascunho' : 'Aprovada';
      const campos: [string, string][] = [
        ['Cliente', cliente],
        ['Projeto', limpar(id.projeto).trim() || 'Não informado'],
        ['Versão', textoVersao(id.versao)],
        ['Vigência', vig ? `A partir de ${vig}` : 'Não definida'],
        ['Situação', situacao],
        ['Aprovador', id.aprovador ? limpar(id.aprovador) : rascunho ? 'Pendente de aprovação' : 'Não informado'],
        ['Data de emissão', dataBr(id.dataEmissao) ?? 'Não informada'],
        ['ERP', id.erp ? limpar(id.erp) : 'Não informado'],
      ];
      cartoes(campos, (r) => (r === 'Situação' && rascunho ? AMBAR : VERDE_ESCURO));
      paragrafo(`Três partes: cadastro (seções 2 a 4: quadro por grupo, regras e procedimentos), controles internos (seção 5) e fiscal (seção 6); os critérios das análises estão na seção ${SECAO_CRITERIOS}.`, { cor: CINZA, tam: 9 });

      // ---- Regra (vigente ou em aprovação) ----
      const desenharRegra = (r: RegraPolitica, vigente: boolean) => {
        // A padrão do aspecto aparece inteira; as demais, só no que diferem dela.
        const padrao = regraPadrao(d.regras, r.aspecto);
        const completa = topicosDaRegra(r.conteudo);
        const comparar = !!padrao && padrao !== r;
        const tp = comparar ? diferencaDaPadrao(completa, topicosDaRegra(padrao.conteudo)) : completa;
        garantir(70);
        pdf.y += 4;
        pdf.font('Helvetica-Bold').fontSize(10.5).fillColor(VERDE_ESCURO).text(`Regra ${limpar(r.codigo)} — ${limpar(r.nome)}`, MARGEM, pdf.y, { width: largura });
        pdf.y += 2;
        const grupos = r.abrangencia.todos ? 'Aplicável a todos os grupos' : `Aplicável aos grupos: ${limpar(textoGrupos(r.abrangencia))}`;
        pdf.font('Helvetica').fontSize(9).fillColor(CINZA).text(grupos, MARGEM, pdf.y, { width: largura });
        const aprov = vigente
          ? [r.aprovadaPor ? `Aprovada por ${limpar(r.aprovadaPor)}` : 'Aprovada', dataBr(r.aprovadaEm) ? `em ${dataBr(r.aprovadaEm)}` : ''].filter(Boolean).join(' ')
          : 'Em aprovação: não vigente';
        pdf.font('Helvetica-Oblique').fontSize(8).fillColor(vigente ? CINZA : AMBAR).text(aprov, MARGEM, pdf.y + 1, { width: largura });
        pdf.y += 5;
        if (comparar) {
          const igual = !tp.topicos.length && !tp.tabelas.length;
          paragrafo(igual ? `Mesmo conteúdo da regra ${limpar(padrao.codigo)}; muda só a abrangência.` : `Igual à regra ${limpar(padrao.codigo)}, exceto:`, { cor: CINZA, tam: 9 });
        }
        marcadores([...tp.topicos, ...(r.observacao?.trim() ? [`Observação: ${r.observacao.trim()}`] : [])]);
        for (const t of tp.tabelas) {
          rotulo(t.titulo, 44);
          tabela(t.cabecalho, t.linhas, t.larguras);
        }
        pdf.y += 4;
      };

      // ---- 2. Quadro de consulta por grupo (o que o almoxarifado consulta: logo depois da identificação) ----
      tituloSecao('2. Quadro de consulta por grupo', 70);
      const porCodigo = new Map(d.regras.map((r) => [r.codigo, r]));
      const cel = (codigo: string | undefined) => {
        if (!codigo) return d.antesDasDiretrizes ? 'Não registrada' : 'Sem regra';
        const r = porCodigo.get(codigo);
        return r && r.situacao !== 'APROVADA' ? `${codigo} (em aprovação)` : codigo;
      };
      if (d.antesDasDiretrizes) paragrafo('Versão liberada antes das Diretrizes: regras não registradas. O quadro mostra só as regras que valiam pelos parâmetros do projeto congelados na versão.');
      else paragrafo(`Código da regra que vale para cada grupo em cada aspecto (seção 3). "Sem regra" indica aspecto ainda sem regra para o grupo; "em aprovação" indica regra ainda não vigente (seção ${SECAO_PENDENCIAS}).`);
      const grupos = ordenarPt([...new Set(d.quadro.map((q) => q.grupo))]);
      const porGrupo = new Map(d.quadro.map((q) => [q.grupo, q.codigos]));
      if (grupos.length) {
        tabela(
          ['Grupo', ...ASPECTOS.map((a) => COLUNA_QUADRO[a])],
          grupos.map((g) => [g, ...ASPECTOS.map((a) => cel(porGrupo.get(g)?.[a]))]),
          [0.3, 0.14, 0.14, 0.14, 0.14, 0.14],
        );
      } else paragrafo('Nenhum grupo importado.', { italico: true, cor: CINZA });

      // ---- 3. Regras vigentes por aspecto ----
      const aprovadas = d.regras.filter((r) => r.situacao === 'APROVADA');
      tituloSecao('3. Regras vigentes por aspecto', 90);
      paragrafo('Cada regra tem um código (letra do aspecto e número) usado no quadro de consulta da seção 2. Para cada grupo de itens vale uma regra por aspecto: a regra de grupos específicos prevalece sobre a regra de todos os grupos. Em cada aspecto, a primeira regra é a padrão; as demais mostram só o que difere dela. Abreviações e termos estão no Anexo.');
      ASPECTOS.forEach((a, i) => {
        subtitulo(`3.${i + 1} ${ROTULO_ASPECTO[a]}`, 70);
        const padrao = regraPadrao(d.regras, a);
        const doAspecto = aprovadas.filter((r) => r.aspecto === a).sort((x, y) => Number(y === padrao) - Number(x === padrao) || ordemCodigo(x, y));
        if (!doAspecto.length) {
          const emAprov = d.regras.some((r) => r.aspecto === a && r.situacao !== 'APROVADA');
          paragrafo(`Nenhuma regra aprovada neste aspecto${emAprov ? `; há regra em aprovação (seção ${SECAO_PENDENCIAS})` : ''}.`, { italico: true, cor: CINZA });
        }
        doAspecto.forEach((r) => desenharRegra(r, true));
      });

      // ---- 4. Procedimentos ----
      // Título, objetivo e fluxograma juntos: o fluxo inteiro numa página quando cabe numa página; se for maior, começa com
      // pelo menos 4 etapas antes de continuar na página seguinte.
      const inicioProcedimento = (p: (typeof d.procedimentos)[number]) => {
        pdf.font('Helvetica').fontSize(9.5);
        const hCab = 30 + pdf.heightOfString(limpar(p.objetivo), { width: largura, lineGap: 1.5 }) + 5 + 18;
        if (!p.fluxo.length) return hCab + 30;
        const inteiro = hCab + alturaFluxo(pdf, p.fluxo, MARGEM, largura);
        if (inteiro <= limiteInferior - MARGEM_TOPO - 10) return inteiro;
        return hCab + alturaFluxo(pdf, p.fluxo, MARGEM, largura, Math.min(4, p.fluxo.length));
      };
      tituloSecao('4. Procedimentos', d.procedimentos.length ? inicioProcedimento(d.procedimentos[0]) : 30);
      if (d.notaProcedimentos) paragrafo(d.notaProcedimentos, { italico: true, cor: CINZA });
      if (!d.procedimentos.length) paragrafo('Nenhum procedimento cadastrado.', { italico: true, cor: CINZA });
      d.procedimentos.forEach((p, i) => {
        const titulo = limpar(p.titulo);
        garantir(inicioProcedimento(p));
        subtitulo(`4.${i + 1} ${titulo}`, 0);
        paragrafo(p.objetivo);
        if (p.fluxo.length) {
          rotulo('Fluxograma', 0);
          pdf.y += 4;
          fluxogramas.push({ titulo, nos: desenharFluxograma(pdf, p.fluxo, { x: MARGEM, largura, limiteInferior, titulo }) });
        }
        if (p.regras.length) { rotulo('Regras práticas', 16); marcadores(p.regras); pdf.y += 3; }
        if (p.evidencias.length) { rotulo('Evidências a guardar', 16); marcadores(p.evidencias); pdf.y += 3; }
        if (p.fundamento?.trim()) { rotulo('Fundamento', 16); paragrafo(p.fundamento); }
        pdf.y += 6;
      });

      // ---- 5. Controles internos (fora das Diretrizes: rotinas de quem cadastra, aprova, movimenta e confere) ----
      const controles = d.controles ?? CONTROLES_INTERNOS;
      tituloSecao('5. Controles internos', 120);
      if (!controles.length) paragrafo('Nenhum controle interno cadastrado.', { italico: true, cor: CINZA });
      else {
        paragrafo('Rotinas que mantêm o cadastro e o estoque no padrão. Cada controle tem responsável, frequência e a evidência que prova que foi feito; quando segue um procedimento da seção 4, o fluxograma está indicado.');
        tabela(['Código', 'Controle', 'Responsável', 'Frequência'], controles.map((c) => [c.codigo, c.titulo, c.responsavel, c.frequencia]), [0.1, 0.34, 0.28, 0.28]);
      }
      const posProc = new Map(d.procedimentos.map((p, i) => [p.id, { n: i + 1, titulo: limpar(p.titulo) }]));
      controles.forEach((c, i) => {
        subtitulo(`5.${i + 1} ${limpar(c.codigo)} — ${limpar(c.titulo)}`, 110);
        paragrafo(c.objetivo);
        cartoes([['Responsável', c.responsavel], ['Frequência', c.frequencia]]);
        if (c.procedimento.length) { rotulo('Procedimento', 16); marcadores(c.procedimento.map((p, k) => `${k + 1}. ${p}`)); pdf.y += 3; }
        if (c.evidencia.length) { rotulo('Evidência a guardar', 16); marcadores(c.evidencia); pdf.y += 3; }
        const fluxo = c.fluxograma ? posProc.get(c.fluxograma) : undefined;
        if (fluxo) { rotulo('Fluxograma', 16); paragrafo(`Seção 4.${fluxo.n}, ${fluxo.titulo}.`); }
        pdf.y += 4;
      });

      // ---- 6. Seção fiscal (com a Fase 2; sem ela, uma linha) ----
      tituloSecao('6. Seção fiscal', 40);
      if (d.fiscal?.fase2) {
        const nFiscal = ASPECTOS.indexOf('FISCAL') + 1;
        const procFiscal = d.procedimentos.findIndex((p) => p.id === 'proc-classificacao-fiscal-item');
        paragrafo(`Classificação fiscal do item: regras da seção 3.${nFiscal} (${ROTULO_ASPECTO.FISCAL})${procFiscal >= 0 ? ` e procedimento da seção 4.${procFiscal + 1}` : ''}.`);
        const decisoes = (n: number | undefined) => (n === 1 ? '1 decisão aprovada' : `${(n ?? 0).toLocaleString('pt-BR')} decisões aprovadas`);
        if (d.fiscal.finalidadeAprovadas != null || d.fiscal.tributarioAprovadas != null) {
          cartoes([['Finalidade (tipo do item)', decisoes(d.fiscal.finalidadeAprovadas)], ['Tratamento tributário', decisoes(d.fiscal.tributarioAprovadas)]]);
        }
      } else paragrafo(NOTA_SEM_FASE2);

      // ---- 7. Critérios das análises (o que cada camada considera; ausente = critérios padrão do sistema) ----
      const criterios = d.criterios ?? criteriosParaPolitica(null, [...CAMADAS]);
      tituloSecao(`${SECAO_CRITERIOS}. Critérios das análises`, 60);
      paragrafo('O que cada camada de análise considerou, com os valores definidos no projeto. As verificações manuais foram acrescentadas pela equipe: o sistema não as aplica sozinho, elas são conferidas por quem revisa o cadastro.');
      if (!criterios.length) paragrafo('Nenhuma camada de análise no projeto.', { italico: true, cor: CINZA });
      criterios.forEach((c, i) => {
        subtitulo(`${SECAO_CRITERIOS}.${i + 1} ${limpar(c.camada)}`, 40);
        marcadores(c.itens.map((x) => (x.manual ? `Verificação manual: ${x.texto}` : x.texto)));
        pdf.y += 3;
      });

      // ---- 8. Versão e pendências ----
      tituloSecao(`${SECAO_PENDENCIAS}. Versão e pendências`, 60);
      subtitulo(`${SECAO_PENDENCIAS}.1 Versão`, 30);
      if (id.versao) {
        const lib = dataBr(id.versao.liberadaEm ?? null);
        paragrafo(`${textoVersao(id.versao)}${lib ? `, liberada em ${lib}` : ''}. A versão congela a base de itens e a política vigente na mesma data; esta política é reproduzível a partir dela.`);
      } else {
        paragrafo('Emitida sobre a base atual, sem versão liberada. O conteúdo pode mudar até a liberação de uma versão, que congela a base de itens e a política na mesma data.');
      }
      paragrafo(`Emitida em ${dataBr(id.dataEmissao) ?? 'data não informada'}${id.aprovador && !rascunho ? `; aprovada por ${limpar(id.aprovador)}` : ''}.`);

      subtitulo(`${SECAO_PENDENCIAS}.2 Pendências`, 30);
      const naoAprovadas = d.regras.filter((r) => r.situacao !== 'APROVADA').sort((a, b) => ASPECTOS.indexOf(a.aspecto) - ASPECTOS.indexOf(b.aspecto) || ordemCodigo(a, b));
      const semRegra = d.pendencias.gruposSemRegra.filter((g) => g.grupos.length).sort((a, b) => ASPECTOS.indexOf(a.aspecto) - ASPECTOS.indexOf(b.aspecto));
      const limitesPend: { regra: RegraPolitica; linha: LinhaLimite }[] = [];
      for (const r of [...d.regras].sort(ordemCodigo)) if (r.conteudo.aspecto === 'LIMITES') for (const l of r.conteudo.linhas) if (limiteNaoConfirmado(l)) limitesPend.push({ regra: r, linha: l });
      const outras = (d.pendencias.outras ?? []).filter((x) => x.trim());
      if (!naoAprovadas.length && !semRegra.length && !limitesPend.length && !outras.length) {
        paragrafo('Não há pendências: todas as regras estão aprovadas, todos os grupos têm regra em cada aspecto e todos os limites de caracteres estão confirmados.');
      }
      if (semRegra.length) {
        rotulo('Grupos sem regra', 20);
        marcadores(semRegra.map((g) => `${ROTULO_ASPECTO[g.aspecto]}: ${juntar(ordenarPt([...new Set(g.grupos)]))}.`));
        pdf.y += 4;
      }
      if (limitesPend.length) {
        rotulo('Limites de caracteres não confirmados', 44);
        tabela(['Regra', 'Destino', 'Campo', 'Situação'],
          limitesPend.map(({ regra, linha }) => [regra.codigo, linha.destino, linha.campo, linha.limite == null ? 'Limite não informado' : `${linha.limite} caracteres, sem confirmação`]),
          [0.12, 0.3, 0.28, 0.3]);
      }
      if (outras.length) { rotulo('Outras pendências', 20); marcadores(outras); pdf.y += 4; }
      if (naoAprovadas.length) {
        rotulo(`Regras em aprovação (${naoAprovadas.length})`, 40);
        paragrafo('Estas regras ainda não foram aprovadas e não estão vigentes; passam a valer quando aprovadas.', { cor: CINZA, tam: 9 });
        naoAprovadas.forEach((r) => desenharRegra(r, false));
      }

      // ---- Anexo: abreviações e termos (uma vez só, para todas as regras de nomes) ----
      const anexo = tabelasDoAnexo(d.regras);
      if (anexo.length) {
        tituloSecao('Anexo: abreviações e termos', 70);
        paragrafo('Valem para as regras de nomes (seção 3.1). Na descrição, a expressão completa pode ser trocada só pela abreviação aprovada; o termo proibido é trocado pelo indicado ou removido.');
        for (const t of anexo) { rotulo(t.titulo, 44); tabela(t.cabecalho, t.linhas, t.larguras); }
      }

      // ---- Cabeçalho corrido, marca d'água e rodapé em todas as páginas ----
      const paginas = pdf.bufferedPageRange();
      paginasTotal = paginas.count;
      for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
        pdf.switchToPage(i);
        const margemInferior = pdf.page.margins.bottom;
        pdf.page.margins.bottom = 0;
        if (rascunho) {
          pdf.save();
          pdf.rotate(-35, { origin: [pdf.page.width / 2, pdf.page.height / 2] });
          pdf.fillOpacity(0.07).fillColor(AMBAR).font('Helvetica-Bold').fontSize(96)
            .text('RASCUNHO', 0, pdf.page.height / 2 - 40, { width: pdf.page.width, align: 'center', lineBreak: false });
          pdf.restore();
          pdf.fillOpacity(1);
        }
        if (i > paginas.start) {
          // Logo da FAL no alto de toda página (regra da ferramenta: src/marca/logo-fal.ts).
          const wLogo = desenharLogoFal(pdf, MARGEM, 17, 18);
          pdf.font('Helvetica').fontSize(8).fillColor(CINZA)
            .text(`${TITULO_POLITICA}  ·  ${cliente}`, MARGEM + (wLogo ? wLogo + 10 : 0), 26, { width: largura - 90 - (wLogo ? wLogo + 10 : 0), lineBreak: false, ellipsis: true });
          if (rascunho) pdf.font('Helvetica-Bold').fillColor(AMBAR).text('RASCUNHO', MARGEM, 26, { width: largura, align: 'right', lineBreak: false });
          pdf.rect(MARGEM, 40, largura, 0.75).fill(BORDA);
        }
        const yRodape = pdf.page.height - 38;
        pdf.rect(MARGEM, yRodape, largura, 0.75).fill(BORDA);
        pdf.font('Helvetica').fontSize(8).fillColor(CINZA)
          .text(`InTAX por FAL Agro  ·  ${SITE}`, MARGEM, yRodape + 8, { width: largura - 80, lineBreak: false });
        pdf.text(`${i + 1} / ${paginas.count}`, MARGEM, yRodape + 8, { width: largura, align: 'right', lineBreak: false });
        pdf.link(MARGEM, yRodape + 6, pdf.widthOfString(`InTAX por FAL Agro  ·  ${SITE}`) + 4, 12, `https://${SITE}`);
        pdf.page.margins.bottom = margemInferior;
      }
      pdf.end();
    } catch (e) {
      reject(e);
    }
  });
}

