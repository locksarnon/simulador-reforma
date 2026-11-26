/**
 * Relatório de fechamento (PDF padrão FAL/InTAX): monta o DocumentoPdf que o PdfService desenha. Todo texto sai de regras sobre os números reais
 * da versão liberada; não há parágrafo genérico. Só caracteres do alfabeto latino (a fonte padrão do PDF não tem setas).
 */
import type { DocumentoPdf, SecaoPdf } from '../../pdf/pdf.service';
import type { DadosEntrega } from '../dados/portas';
import type { Camada } from '../tipos';
import {
  CASO_PENDENTE, ROTULO_CAMADA, celula, comMilhar, construirModelo, dataBr, nomeCliente, obj, paraData, origemDaFinalidade, pct1, rotuloDoCampo, rotuloObrigacao, rotuloTipoAjuste, textoSemEscrituracaoEntregue, txt,
  mapaDoModelo, type Modelo,
} from './modelo';

const n = comMilhar;
/** Finalidade confirmada por decisão (do grupo, exceção ou do consultor); a só informada no cadastro não conta. */
const finalidadeConfirmada = (m: Modelo, i: Modelo['itens'][number]) => !!i.finalidade && !origemDaFinalidade(m, i).startsWith('Informada no cadastro');
const plural = (q: number, um: string, varios: string) => `${n(q)} ${q === 1 ? um : varios}`;
const parte = (a: number, b: number) => (b > 0 ? pct1(a / b) : '0,0%');

const TIPOS_DECISAO: Record<string, string> = { aprovar: 'aprovações', rejeitar: 'rejeições', desfazer: 'reversões', importar: 'incorporações de reimportação' };

function comentarioDaCamada(m: Modelo, camada: Camada): string | null {
  const c = m.porCamada.get(camada);
  const casos = m.casosPorCamada.get(camada) ?? {};
  const nCasos = Object.values(casos).reduce((s, x) => s + x, 0);
  if (!c) return null;
  const s = c.porSituacao;
  const pendentes = s.PENDENTE ?? 0;
  const analisados = c.total - pendentes;
  if (analisados === 0 && nCasos === 0) return camada === 'ESTOQUE' ? null : `${ROTULO_CAMADA[camada]}: camada ainda não executada para este cadastro; nenhum dos ${plural(c.total, 'item', 'itens')} foi analisado nela.`;

  const partes: string[] = [];
  partes.push(`${ROTULO_CAMADA[camada]}: ${n(analisados)} de ${n(c.total)} itens analisados (${parte(analisados, c.total)}), sendo ${n(s.SEM_PROBLEMA ?? 0)} sem problema e ${n(s.APROVADO ?? 0)} com ajuste aprovado.`);
  if (nCasos === 0) partes.push('Nenhum caso foi aberto.');
  else {
    const det = [`${n(casos.APROVADO ?? 0)} aprovado(s)`];
    if (casos.REJEITADO) det.push(`${n(casos.REJEITADO)} rejeitado(s), mantido o cadastro como estava`);
    const abertos = (casos.PROPOSTO ?? 0) + (casos.RASCUNHO ?? 0);
    if (abertos) det.push(`${n(abertos)} ainda em aberto`);
    if (casos.AGUARDANDO_INFORMACAO) det.push(`${n(casos.AGUARDANDO_INFORMACAO)} aguardando informação`);
    partes.push(`${plural(nCasos, 'caso gerado', 'casos gerados')}: ${det.join('; ')}.`);
  }
  const ajustados = m.itensAjustadosPorCamada.get(camada)?.size ?? 0;
  if (ajustados) partes.push(`${plural(ajustados, 'item teve', 'itens tiveram')} campo ajustado por decisão aprovada.`);

  if (camada === 'DUPLICIDADE' || camada === 'QUALIDADE') {
    const tipo = camada === 'DUPLICIDADE' ? 'UNIFICACAO' : 'INATIVACAO';
    const linhas = mapaDoModelo(m).filter((l) => l.tipo === tipo && (!m.liberada || l.situacao === 'APROVADA'));
    if (linhas.length) {
      const alertas = linhas.filter((l) => l.alertas.length).length;
      partes.push(camada === 'DUPLICIDADE'
        ? `${plural(linhas.length, 'código deixa', 'códigos deixam')} de existir por unificação, com o saldo concentrado no código que fica (lista na aba "De para e equivalências" do Excel)${alertas ? `; ${plural(alertas, 'linha pede', 'linhas pedem')} conferência antes do ajuste (unidade diferente ou saldo não informado)` : ''}.`
        : `${plural(linhas.length, 'item sem movimentação desde o corte e sem saldo será inativado', 'itens sem movimentação desde o corte e sem saldo serão inativados')} (lista na aba "De para e equivalências" do Excel)${alertas ? `; ${plural(alertas, 'linha pede', 'linhas pedem')} conferência do saldo antes` : ''}.`);
    }
  }
  if (camada === 'DUPLICIDADE' && m.vinculos.length) partes.push(`${plural(m.vinculos.length, 'vínculo de código antigo e novo registrado', 'vínculos de código antigo e novo registrados')}, com data e justificativa.`);
  if (camada === 'GRUPOS_FINALIDADE') partes.push(`Finalidade confirmada em ${n(m.itens.filter((i) => finalidadeConfirmada(m, i)).length)} de ${n(m.itens.length)} itens.`);
  if (camada === 'NCM') partes.push(`NCM de 8 dígitos em ${n(m.itens.filter((i) => i.ncm.replace(/\D/g, '').length === 8).length)} de ${n(m.itens.length)} itens.`);
  if (camada === 'NOMES_UNIDADES') {
    const desc = m.itens.filter((i) => i.camposAlterados.includes('descricao')).length; const un = m.itens.filter((i) => i.camposAlterados.includes('unidade')).length;
    if (desc || un) partes.push(`Descrições alteradas: ${n(desc)}; unidades alteradas: ${n(un)}.`);
  }
  if (camada === 'TRIBUTARIO') {
    const comClasse = m.itens.filter((i) => { const x = celula(m, i.id, 'TRIBUTARIO')?.situacao; return (x === 'APROVADO' || x === 'SEM_PROBLEMA') && txt(i.campos.cClassTrib ?? i.campos.c_class_trib); }).length;
    const excecoes = m.casos.filter((x) => x.camada === 'TRIBUTARIO' && x.tipo.startsWith('EXCECAO') && x.situacao === 'APROVADO').length;
    partes.push(`Itens com cClassTrib aprovado ou conferido: ${n(comClasse)}; exceções por item aprovadas: ${n(excecoes)}.`);
  }
  if (camada === 'OBRIGACOES') partes.push(`${plural(m.impactos.length, 'linha de impacto registrada', 'linhas de impacto registradas')}.`);
  if (c.revisar) partes.push(`${plural(c.revisar, 'item marcado', 'itens marcados')} para nova revisão por dependência de outra camada.`);
  if (pendentes) partes.push(`${plural(pendentes, 'item ainda sem análise', 'itens ainda sem análise')} nesta camada.`);
  return partes.join(' ');
}

function secaoImpactoSped(m: Modelo): SecaoPdf {
  const tipos = ['CADASTRAL_FUTURO', 'REGULARIZACAO_SALDO', 'ESCRITURACAO_ENTREGUE'];
  const norm = (t: string) => (t === 'ESCRITURACAO_JA_ENTREGUE' ? 'ESCRITURACAO_ENTREGUE' : t);
  const porTipo = new Map<string, typeof m.impactos>();
  for (const i of m.impactos) { const k = norm(i.tipo); const l = porTipo.get(k); if (l) l.push(i); else porTipo.set(k, [i]); }
  const registros = (l: typeof m.impactos) => [...new Set(l.map((i) => i.registro).filter(Boolean))].sort().join(', ') || '-';
  const obrigacoes = (l: typeof m.impactos) => [...new Set(l.map((i) => rotuloObrigacao(i.obrigacao)))].join(', ') || '-';
  const s: SecaoPdf = { titulo: 'Impacto nas obrigações (SPED)', paragrafos: [], tabela: undefined };
  if (m.impactos.length === 0) {
    s.paragrafos = [
      'Nenhuma linha de impacto nas obrigações foi registrada nesta versão. Os ajustes aprovados no cadastro não geraram registro a conferir no SPED ou na NF-e, ou a camada de obrigações ainda não foi executada.',
      `Escrituração já entregue: ${textoSemEscrituracaoEntregue(m)}.`,
    ];
    return s;
  }
  const cad = porTipo.get('CADASTRAL_FUTURO') ?? []; const sal = porTipo.get('REGULARIZACAO_SALDO') ?? []; const ent = porTipo.get('ESCRITURACAO_ENTREGUE') ?? [];
  const outros = m.impactos.filter((i) => !tipos.includes(norm(i.tipo)));
  s.paragrafos = [
    `${plural(m.impactos.length, 'linha de impacto registrada', 'linhas de impacto registradas')}, classificadas em três grupos: ajuste cadastral futuro (vale a partir da data de início, sem mexer no que já foi escriturado), regularização de saldo (acerto de saldo, inventário ou correlação de códigos) e impacto em escrituração já entregue (período transmitido com o cadastro anterior).`,
    cad.length ? `Ajuste cadastral futuro: ${plural(cad.length, 'linha', 'linhas')} (${registros(cad)}). Atualizar o cadastro no ERP e nos arquivos das próximas competências.` : 'Ajuste cadastral futuro: nenhuma linha.',
    sal.length ? `Regularização de saldo: ${plural(sal.length, 'linha', 'linhas')} (${registros(sal)}). Conferir saldos, inventário e vínculo com documentos antes de aplicar.` : 'Regularização de saldo: nenhuma linha.',
    ent.length ? `Escrituração já entregue: ${plural(ent.length, 'linha', 'linhas')} (${registros(ent)}). Avaliar se os períodos anteriores precisam de retificação; a retificação e a transmissão não fazem parte deste serviço e exigem análise e autorização próprias.` : `Escrituração já entregue: ${textoSemEscrituracaoEntregue(m)}.`,
  ];
  if (outros.length) s.paragrafos.push(`${plural(outros.length, 'linha sem tipo de ajuste reconhecido', 'linhas sem tipo de ajuste reconhecido')}: classificar antes de aplicar.`);
  const anteriores = m.impactos.filter((i) => i.avaliarAnteriores).length;
  const semLeiaute = m.impactos.filter((i) => !i.leiaute || /n[aã]o confirmado/i.test(i.leiaute)).length;
  if (anteriores) s.paragrafos.push(`${plural(anteriores, 'linha pede', 'linhas pedem')} avaliação de períodos anteriores.`);
  if (semLeiaute) s.paragrafos.push(`Em ${plural(semLeiaute, 'linha', 'linhas')} a versão do leiaute ainda não foi confirmada no guia oficial vigente: conferir registro e campo antes de usar.`);
  s.tabela = {
    cabecalho: ['Tipo de ajuste', 'Linhas', 'Obrigações', 'Registros'], larguras: [0.34, 0.1, 0.3, 0.26],
    linhas: tipos.map((t) => { const l = porTipo.get(t) ?? []; return [rotuloTipoAjuste(t), n(l.length), obrigacoes(l), registros(l)]; }),
  };
  return s;
}

export function montarRelatorio(dados: DadosEntrega): DocumentoPdf {
  const m = construirModelo(dados);
  const v = dados.versao;
  const cliente = nomeCliente(m);
  const totalItens = m.itens.length;
  const completos = m.itens.filter((i) => m.camadas.every((c) => (celula(m, i.id, c)?.situacao ?? 'PENDENTE') !== 'PENDENTE')).length;
  const ajustados = new Set<string>(); for (const s of m.itensAjustadosPorCamada.values()) for (const id of s) ajustados.add(id);
  const casosTotal = m.casos.length;
  const aprovados = m.casos.filter((c) => c.situacao === 'APROVADO').length;
  const rejeitados = m.casos.filter((c) => c.situacao === 'REJEITADO').length;
  const pendentes = m.casos.filter((c) => CASO_PENDENTE.includes(c.situacao));
  const aguardando = pendentes.filter((c) => c.situacao === 'AGUARDANDO_INFORMACAO').length;
  const naoAprovados = pendentes.filter((c) => c.situacao !== 'AGUARDANDO_INFORMACAO' && Object.keys(c.proposta).length > 0).length;

  const secoes: SecaoPdf[] = [];

  // Resumo
  const resumo = [
    `Foram recebidos ${plural(totalItens, 'item', 'itens')} do cadastro de ${cliente}${m.dados.importacoes.length ? `, em ${plural(m.dados.importacoes.length, 'importação', 'importações')}` : ''}. Na versão ${v?.numero ?? '-'} (${txt(v?.rotulo)}), ${plural(aprovados, 'caso foi aprovado', 'casos foram aprovados')} e ${plural(ajustados.size, 'item teve', 'itens tiveram')} campo ajustado; ${plural(rejeitados, 'caso foi rejeitado', 'casos foram rejeitados')}, mantido o cadastro como estava.`,
    pendentes.length
      ? `Ficam pendentes ${plural(pendentes.length, 'caso', 'casos')} (${n(aguardando)} aguardando informação), que não integram esta entrega.`
      : 'Não há caso pendente nesta versão.',
    `${completos === totalItens && totalItens > 0 ? 'Todos os itens tiveram todas as camadas analisadas' : `${n(completos)} de ${n(totalItens)} itens tiveram todas as camadas analisadas (${parte(completos, totalItens)})`}; ${plural(m.impactos.length, 'linha de impacto', 'linhas de impacto')} nas obrigações e ${plural(m.vinculos.length, 'vínculo de código', 'vínculos de código')} registrados.`,
  ];
  const marcadasRevisar = [...m.porCamada.values()].reduce((s, x) => s + x.revisar, 0);
  if (marcadasRevisar) resumo.push(`Atenção: ${plural(marcadasRevisar, 'célula continua marcada', 'células continuam marcadas')} para revisão (a decisão anterior depende de dado que mudou); esses itens saem como "Aguardando revisão" e não como aprovados.`);
  secoes.push({ titulo: 'Resumo do fechamento', paragrafos: resumo });

  // Itens recebidos e analisados
  const imp = m.dados.importacoes.map((i) => obj(i));
  secoes.push({
    titulo: 'Itens recebidos e analisados',
    destaques: [
      { rotulo: 'Itens recebidos', valor: n(totalItens), detalhe: `${plural(m.camadas.length, 'camada', 'camadas')} de análise` },
      { rotulo: 'Com todas as camadas analisadas', valor: n(completos), detalhe: parte(completos, totalItens) },
      { rotulo: 'Com campo ajustado', valor: n(ajustados.size), detalhe: parte(ajustados.size, totalItens) },
    ],
    tabela: imp.length ? {
      cabecalho: ['Arquivo importado', 'Data', 'Aceitas', 'Rejeitadas', 'Pendentes'], larguras: [0.4, 0.16, 0.14, 0.15, 0.15],
      linhas: imp.slice(0, 20).map((i) => [txt(i.arquivo), dataBr(paraData(i.createdAt), false), n(Number(i.aceitas) || 0), n(Number(i.rejeitadas) || 0), n(Number(i.pendentes) || 0)]),
    } : undefined,
  });

  // Ajustes por categoria
  const camadasComCaso = [...new Set([...m.camadas, ...m.casosPorCamada.keys()])];
  secoes.push({
    titulo: 'Ajustes por categoria',
    paragrafos: [`${plural(casosTotal, 'caso gerado', 'casos gerados')} nas camadas de análise; aprovado é o que o consultor decidiu aplicar, rejeitado é o que ele manteve como estava.`],
    tabela: {
      cabecalho: ['Camada', 'Casos', 'Aprovados', 'Rejeitados', 'Aguardando', 'Em aberto', 'Itens ajustados'], larguras: [0.26, 0.1, 0.12, 0.12, 0.14, 0.12, 0.14],
      linhas: camadasComCaso.map((c) => {
        const r = m.casosPorCamada.get(c) ?? {};
        return [ROTULO_CAMADA[c as Camada] ?? c, n(Object.values(r).reduce((s, x) => s + x, 0)), n(r.APROVADO ?? 0), n(r.REJEITADO ?? 0), n(r.AGUARDANDO_INFORMACAO ?? 0), n((r.PROPOSTO ?? 0) + (r.RASCUNHO ?? 0)), n(m.itensAjustadosPorCamada.get(c)?.size ?? 0)];
      }),
    },
  });

  // Revisões executadas
  const porTipo = new Map<string, number>(); const porCampo = new Map<string, number>(); const quem = new Set<string>();
  for (const d of m.decisoes) {
    porTipo.set(d.tipo, (porTipo.get(d.tipo) ?? 0) + 1);
    if (d.usuario) quem.add(d.usuario);
    if (d.tipo === 'aprovar' && !d.campo.startsWith('caso:')) porCampo.set(d.campo, (porCampo.get(d.campo) ?? 0) + 1);
  }
  // menor e maior data num laço: Math.min(...lista) estoura a pilha com centenas de milhares de decisões
  let menorData = Infinity; let maiorData = -Infinity;
  for (const d of m.decisoes) {
    if (!d.quando) continue;
    const t = Number(d.quando);
    if (t < menorData) menorData = t;
    if (t > maiorData) maiorData = t;
  }
  const temDatas = Number.isFinite(menorData);
  const detalheTipos = [...porTipo].map(([t, q]) => `${n(q)} ${TIPOS_DECISAO[t] ?? t}`).join(', ');
  secoes.push({
    titulo: 'Revisões executadas',
    paragrafos: m.decisoes.length
      ? [`${plural(m.decisoes.length, 'registro', 'registros')} no histórico de alterações (${detalheTipos}), feitos por ${plural(quem.size, 'pessoa', 'pessoas')}${temDatas ? `, entre ${dataBr(new Date(menorData), false)} e ${dataBr(new Date(maiorData), false)}` : ''}. Cada alteração guarda o valor anterior, o novo valor, o fundamento, o responsável e a data.`]
      : ['Nenhuma alteração foi aplicada ao cadastro até esta versão.'],
    tabela: porCampo.size ? {
      cabecalho: ['Campo alterado', 'Alterações aprovadas'], larguras: [0.6, 0.4],
      linhas: [...porCampo].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, q]) => [rotuloDoCampo(c), n(q)]),
    } : undefined,
  });

  // Comentário por aspecto
  const comentarios = m.camadas.map((c) => comentarioDaCamada(m, c)).filter((x): x is string => !!x);
  secoes.push({ titulo: 'Comentário por aspecto tratado', paragrafos: comentarios.length ? comentarios : ['Nenhuma camada foi analisada até esta versão.'] });

  secoes.push(secaoImpactoSped(m));

  // Pendências e limitações
  const itens: string[] = [];
  if (pendentes.length) {
    const porCamada = new Map<string, number>(); for (const c of pendentes) porCamada.set(c.camada, (porCamada.get(c.camada) ?? 0) + 1);
    itens.push(`${plural(pendentes.length, 'caso pendente', 'casos pendentes')}: ${[...porCamada].map(([c, q]) => `${ROTULO_CAMADA[c as Camada] ?? c} ${n(q)}`).join('; ')}.`);
  }
  if (aguardando) itens.push(`${plural(aguardando, 'caso depende', 'casos dependem')} de informação do cliente; a lista detalhada está na aba "Pendências e histórico" do Excel.`);
  if (naoAprovados) itens.push(`${plural(naoAprovados, 'ajuste proposto', 'ajustes propostos')} e não aprovado${naoAprovados === 1 ? '' : 's'}: fora desta entrega.`);
  if (m.impactosExcluidos) itens.push(`${plural(m.impactosExcluidos, 'linha de impacto no SPED', 'linhas de impacto no SPED')} ligada${m.impactosExcluidos === 1 ? '' : 's'} a caso não aprovado: fora desta entrega.`);
  const incompletas = m.camadas.filter((c) => { const x = m.porCamada.get(c)!; return (x.porSituacao.PENDENTE ?? 0) > 0; });
  if (incompletas.length) itens.push(`Cobertura incompleta em: ${incompletas.map((c) => `${ROTULO_CAMADA[c]} (${parte(m.porCamada.get(c)!.total - (m.porCamada.get(c)!.porSituacao.PENDENTE ?? 0), totalItens)})`).join('; ')}.`);
  const semFin = m.itens.filter((i) => !finalidadeConfirmada(m, i)).length; const semNcm = m.itens.filter((i) => i.ncm.replace(/\D/g, '').length !== 8).length;
  if (semFin) itens.push(`${plural(semFin, 'item sem finalidade confirmada', 'itens sem finalidade confirmada')}: o enquadramento por cenário depende dela.`);
  if (semNcm) itens.push(`${plural(semNcm, 'item sem NCM de 8 dígitos', 'itens sem NCM de 8 dígitos')}: sem o NCM o enquadramento legal não é definido.`);
  const corte = obj(dados.projeto.parametros).corteMovimentacao;
  if (!(typeof corte === 'string' && corte)) itens.push('Itens sem movimentação a longa data: critério não aplicado, porque o corte de movimentação não foi definido na configuração do projeto.');
  const mod = obj(dados.projeto.modulos);
  const desligados = [mod.conciliacao === true ? '' : 'conciliação de estoque', mod.blocosKG === true ? '' : 'Blocos K e G', mod.arquivoErp === true ? '' : 'arquivo para o ERP'].filter(Boolean);
  if (desligados.length) itens.push(`Fora do escopo desta entrega: ${desligados.join(', ')}. O trabalho cobre o cadastro e o tratamento tributário dos itens, não a movimentação do estoque.`);
  itens.push('A análise se apoia na legislação e nas tabelas oficiais carregadas no sistema na data da versão; mudança posterior de norma ou de leiaute exige nova conferência.');
  secoes.push({ titulo: 'Pendências e limitações', itens });

  // Versão liberada
  const fotoCelulas = dados.celulas.length;
  secoes.push({
    titulo: 'Versão liberada',
    paragrafos: [
      `Versão ${v?.numero ?? '-'} — ${txt(v?.rotulo)}${v ? `, liberada em ${dataBr(paraData(v.criadaEm), false)}` : ''}. A versão congela ${plural(totalItens, 'item', 'itens')} e ${plural(fotoCelulas, 'situação de camada', 'situações de camada')}; somente decisões aprovadas até essa data compõem a entrega, e o Excel desta versão traz o cadastro saneado, o de/para de códigos, os cenários tributários, os impactos no SPED e o histórico por campo.`,
    ],
    destaques: [
      { rotulo: 'Casos aprovados', valor: n(aprovados), detalhe: `de ${n(casosTotal)} casos` },
      { rotulo: 'Pendentes', valor: n(pendentes.length), detalhe: `${n(aguardando)} aguardando informação` },
      { rotulo: 'Impactos SPED', valor: n(m.impactos.length), detalhe: `${n(m.vinculos.length)} vínculos de código` },
    ],
  });

  const subtitulo = [cliente, `Data-base ${dataBr(paraData(dados.projeto.data_base))}`, v ? `Versão ${v.numero}: ${v.rotulo}` : ''].filter(Boolean).join('  ·  ');
  return {
    titulo: 'Relatório de fechamento: saneamento de estoques e cadastro de produtos',
    marca: 'Consultoria tributária · FAL Agro',
    subtitulo,
    secoes,
    aviso: 'Material de apoio à decisão do cliente e do consultor; não constitui parecer jurídico nem tributário. As conclusões refletem o cadastro recebido e a legislação carregada na data da versão. A conferência final, a aplicação dos ajustes no ERP e a escrituração são de responsabilidade do contribuinte.',
  };
}
