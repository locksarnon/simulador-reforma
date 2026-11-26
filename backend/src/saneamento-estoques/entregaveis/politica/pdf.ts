/**
 * PDF da POLÍTICA do saneamento (docs/saneamento-diretrizes.md, seção 7), no padrão visual FAL/InTAX: identificação, regras vigentes por
 * aspecto, procedimentos com fluxograma, quadro de consulta por grupo, versão e pendências. Só regras aprovadas saem como vigentes; o
 * documento leva a marca RASCUNHO enquanto a situação for Rascunho ou houver regra não aprovada.
 */
import PDFDocument from 'pdfkit';
import { desenharTabela } from '../../../pdf/pdf.service';
import { ASPECTOS, ROTULO_ASPECTO, type Aspecto, type LinhaLimite } from '../../diretrizes/tipos';
import { AMBAR, AMBAR_FUNDO, BORDA, BRANCO, CINZA, FUNDO_CARD, LOGO, MARGEM, MARGEM_TOPO, SITE, TEXTO, VERDE, VERDE_ESCURO } from './estilo';
import { alturaFluxo, desenharFluxograma, type GeometriaNo } from './fluxograma';
import { dataBr, juntar, limpar, ordenarPt } from './texto';
import { limiteNaoConfirmado, textoGrupos, topicosDaRegra } from './topicos';
import type { DadosPolitica, RegraPolitica } from './tipos';

/** Colunas do quadro de consulta. */
const COLUNA_QUADRO: Record<Aspecto, string> = { NOMES: 'Nomes', ATRIBUTOS: 'Atributos', UNIDADES: 'Unidades', LIMITES: 'Limites', FISCAL: 'Fiscal' };

export const TITULO_POLITICA = 'Política de estoques e cadastro de produtos';

/** Rascunho = situação Rascunho ou qualquer regra ainda não aprovada. */
export const emRascunho = (d: DadosPolitica) => d.identificacao.situacao !== 'APROVADA' || d.regras.some((r) => r.situacao !== 'APROVADA');

const ordemCodigo = (a: RegraPolitica, b: RegraPolitica) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });

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
      if (LOGO) {
        pdf.roundedRect(xLogo, 19, 72, 26, 4).fill(BRANCO);
        pdf.image(LOGO, xLogo + 5, 22, { height: 20 });
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
          ? `${naoAprovadas === 1 ? 'Há 1 regra ainda não aprovada' : `Há ${naoAprovadas} regras ainda não aprovadas`}. Só as regras aprovadas estão vigentes; as demais constam em Pendências (seção 5).`
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
      const gap = 10;
      const wCel = (largura - gap) / 2;
      for (let i = 0; i < campos.length; i += 2) {
        const par = campos.slice(i, i + 2);
        pdf.font('Helvetica-Bold').fontSize(10);
        const h = Math.max(...par.map(([, v]) => pdf.heightOfString(v, { width: wCel - 20 }))) + 26;
        garantir(h + 6);
        const y0 = pdf.y;
        par.forEach(([r, v], j) => {
          const x = MARGEM + j * (wCel + gap);
          pdf.roundedRect(x, y0, wCel, h, 5).fillAndStroke(FUNDO_CARD, BORDA);
          pdf.fillColor(CINZA).font('Helvetica-Bold').fontSize(7.5).text(r.toLocaleUpperCase('pt-BR'), x + 10, y0 + 8, { width: wCel - 20, lineBreak: false });
          pdf.fillColor(r === 'Situação' && rascunho ? AMBAR : VERDE_ESCURO).font('Helvetica-Bold').fontSize(10).text(v, x + 10, y0 + 19, { width: wCel - 20 });
        });
        pdf.x = MARGEM;
        pdf.y = y0 + h + 6;
      }

      // ---- Regra (vigente ou em aprovação) ----
      const desenharRegra = (r: RegraPolitica, vigente: boolean) => {
        const tp = topicosDaRegra(r.conteudo);
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
        marcadores([...tp.topicos, ...(r.observacao?.trim() ? [`Observação: ${r.observacao.trim()}`] : [])]);
        for (const t of tp.tabelas) {
          rotulo(t.titulo, 44);
          tabela(t.cabecalho, t.linhas, t.larguras);
        }
        pdf.y += 4;
      };

      // ---- 2. Regras vigentes por aspecto ----
      const aprovadas = d.regras.filter((r) => r.situacao === 'APROVADA');
      tituloSecao('2. Regras vigentes por aspecto', 90);
      paragrafo('Cada regra tem um código (letra do aspecto e número) usado no quadro de consulta da seção 4. Para cada grupo de itens vale uma regra por aspecto: a regra de grupos específicos prevalece sobre a regra de todos os grupos.');
      ASPECTOS.forEach((a, i) => {
        subtitulo(`2.${i + 1} ${ROTULO_ASPECTO[a]}`, 70);
        const doAspecto = aprovadas.filter((r) => r.aspecto === a).sort(ordemCodigo);
        if (!doAspecto.length) {
          const emAprov = d.regras.some((r) => r.aspecto === a && r.situacao !== 'APROVADA');
          paragrafo(`Nenhuma regra aprovada neste aspecto${emAprov ? '; há regra em aprovação (seção 5)' : ''}.`, { italico: true, cor: CINZA });
        }
        doAspecto.forEach((r) => desenharRegra(r, true));
      });

      // ---- 3. Procedimentos ----
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
      tituloSecao('3. Procedimentos', d.procedimentos.length ? inicioProcedimento(d.procedimentos[0]) : 30);
      if (d.notaProcedimentos) paragrafo(d.notaProcedimentos, { italico: true, cor: CINZA });
      if (!d.procedimentos.length) paragrafo('Nenhum procedimento cadastrado.', { italico: true, cor: CINZA });
      d.procedimentos.forEach((p, i) => {
        const titulo = limpar(p.titulo);
        garantir(inicioProcedimento(p));
        subtitulo(`3.${i + 1} ${titulo}`, 0);
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

      // ---- 4. Quadro de consulta por grupo ----
      tituloSecao('4. Quadro de consulta por grupo', 70);
      const porCodigo = new Map(d.regras.map((r) => [r.codigo, r]));
      const cel = (codigo: string | undefined) => {
        if (!codigo) return 'Sem regra';
        const r = porCodigo.get(codigo);
        return r && r.situacao !== 'APROVADA' ? `${codigo} (em aprovação)` : codigo;
      };
      paragrafo('Código da regra que vale para cada grupo em cada aspecto (seção 2). "Sem regra" indica aspecto ainda sem regra para o grupo; "em aprovação" indica regra ainda não vigente (seção 5).');
      const grupos = ordenarPt([...new Set(d.quadro.map((q) => q.grupo))]);
      const porGrupo = new Map(d.quadro.map((q) => [q.grupo, q.codigos]));
      if (grupos.length) {
        tabela(
          ['Grupo', ...ASPECTOS.map((a) => COLUNA_QUADRO[a])],
          grupos.map((g) => [g, ...ASPECTOS.map((a) => cel(porGrupo.get(g)?.[a]))]),
          [0.3, 0.14, 0.14, 0.14, 0.14, 0.14],
        );
      } else paragrafo('Nenhum grupo importado.', { italico: true, cor: CINZA });

      // ---- 5. Versão e pendências ----
      tituloSecao('5. Versão e pendências', 60);
      subtitulo('5.1 Versão', 30);
      if (id.versao) {
        const lib = dataBr(id.versao.liberadaEm ?? null);
        paragrafo(`${textoVersao(id.versao)}${lib ? `, liberada em ${lib}` : ''}. A versão congela a base de itens e a política vigente na mesma data; esta política é reproduzível a partir dela.`);
      } else {
        paragrafo('Emitida sobre a base atual, sem versão liberada. O conteúdo pode mudar até a liberação de uma versão, que congela a base de itens e a política na mesma data.');
      }
      paragrafo(`Emitida em ${dataBr(id.dataEmissao) ?? 'data não informada'}${id.aprovador && !rascunho ? `; aprovada por ${limpar(id.aprovador)}` : ''}.`);

      subtitulo('5.2 Pendências', 30);
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
          pdf.font('Helvetica').fontSize(8).fillColor(CINZA)
            .text(`${TITULO_POLITICA}  ·  ${cliente}`, MARGEM, 26, { width: largura - 90, lineBreak: false, ellipsis: true });
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

