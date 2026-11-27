/**
 * Camada QUALIDADE: o cadastro está completo e coerente? Descrição insuficiente, unidade ausente ou incompatível com a descrição, campos obrigatórios extras vazios,
 * datas e saldos inválidos, item inativo/bloqueado que ainda tem saldo ou uso, item sem data de movimentação (conforme o tratamento escolhido na
 * importação: "Deixar para tratar depois" sinaliza à parte; "Considerar sem movimentação" o leva ao corte como item parado) e item
 * ativo sem movimentação desde o corte (candidato a inativação, por grupo: sem saldo propõe inativar; com saldo pede regularizar o saldo antes).
 * NCM e grupo vazios são casos das camadas NCM e Grupos (cada célula da tabela única precisa refletir o próprio problema); código e estabelecimento, da Identificação.
 */
import type { AnalisadorCamada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ev, justificar, montarResultado, rotuloItem, valorComum } from './base';
import { parametrosDe, unificacoesDe } from './contexto';
import { escalaDaBase, saldoNaEscala } from './conjuntos';
import { novoCaso } from './dependencias';
import { campoDe, dataBr, dataIsoValida, motivoDescricaoInsuficiente, numeroBr, txt, vazio } from './texto';
import { GRANDEZAS, classificarUnidade, grandezasNaDescricao } from './unidades';
import { textoDaDecisaoSemData } from '../sem-data-movimentacao';

export class AnalisadorQualidade implements AnalisadorCamada {
  readonly camada = 'QUALIDADE' as const;

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const par = parametrosDe(contexto);
    const casos: CasoProposto[] = [];
    const c = (x: Parameters<typeof novoCaso>[0]) => casos.push(novoCaso(x));
    const obrigatorios = par.camposObrigatorios ?? [];
    const tratamento = par.semDataMovimentacao ?? 'SINALIZAR';
    const sinalizaSemData = tratamento === 'SINALIZAR' && itens.some((i) => !!i.ultimaMovimentacao); // base sem nenhuma data: não há o que cobrar item a item
    // "Considerar sem movimentação" (escolha da importação): o item sem data entra no corte como parado, com a escolha na evidência.
    const semDataParado = tratamento === 'SEM_MOVIMENTACAO';
    const decisaoSemData = textoDaDecisaoSemData(par.semDataMovimentacaoDecisao);
    let semDataPendentes = 0;
    const politica = par.politicaUnidade ?? {};
    const corte = contexto.corteMovimentacao && dataIsoValida(txt(contexto.corteMovimentacao)) ? txt(contexto.corteMovimentacao) : null;
    const paradosPorGrupo = new Map<string, ItemTrabalho[]>();
    // Saldo nos textos: na escala da base (a mesma detecção da Duplicidade; base ×1.000.000 mostra 3, não 3.000.000). `atual` guarda o valor lido.
    const escala = escalaDaBase(itens);
    const sb = (v: number) => numeroBr(saldoNaEscala(v, escala) ?? v);
    let comDataSemCorte = 0;

    for (const it of itens) {
      const id = [it.id];
      const motivoDesc = motivoDescricaoInsuficiente(it.descricao);
      if (motivoDesc) {
        c({ camada: 'QUALIDADE', tipo: 'DESCRICAO_INSUFICIENTE', itens: id, problema: motivoDesc, evidencia: [ev('Origem', 'Coluna da descrição na base importada'), ev('Descrição', it.descricao)], atual: { codigo: it.codigo, descricao: it.descricao },
          justificativa: justificar('Uma descrição assim não permite classificar, comparar nem localizar o item (NCM, duplicidade e tratamento dependem dela).', 'completar a descrição com NOME + REFERÊNCIA + COMPLEMENTO; o motor não inventa característica.') });
      }
      if (vazio(it.unidade)) {
        c({ camada: 'QUALIDADE', tipo: 'UNIDADE_AUSENTE', itens: id, problema: 'Item sem unidade de medida', evidencia: [ev('Origem', 'Coluna da unidade na base importada'), ev('Descrição', it.descricao)], atual: { codigo: it.codigo, unidade: null },
          justificativa: justificar('Sem unidade não há como controlar estoque nem converter compra em estoque.', 'informar a unidade de estoque (a política sugere a menor unidade prática da medida).') });
      } else {
        const k = classificarUnidade(it.unidade, politica.regras ?? {});
        const doTexto = grandezasNaDescricao(it.descricao);
        if (k?.grandeza && ['padrao', 'menor', 'maior'].includes(k.nivel) && k.grandeza !== 'contagem' && doTexto.length === 1 && doTexto[0] !== k.grandeza) {
          c({ camada: 'QUALIDADE', tipo: 'UNIDADE_INCOMPATIVEL', itens: id, problema: `Unidade ${txt(it.unidade).toUpperCase()} (${GRANDEZAS[k.grandeza].rotulo.toLowerCase()}) não combina com a medida da descrição (${GRANDEZAS[doTexto[0]].rotulo.toLowerCase()})`,
            evidencia: [ev('Origem', 'Unidade e descrição da base importada'), ev('Unidade', it.unidade), ev('Descrição', it.descricao)], atual: { codigo: it.codigo, unidade: it.unidade, descricao: it.descricao },
            justificativa: justificar('É uma indicação por texto: a descrição cita uma medida de outra natureza que a da unidade, o que costuma ser erro de unidade ou de descrição.', 'conferir o item no ERP e corrigir a unidade ou a descrição; o motor não decide qual está errada.') });
        }
      }
      const faltam = obrigatorios.filter((n) => vazio(campoDe(it, n)));
      if (faltam.length) {
        c({ camada: 'QUALIDADE', tipo: 'CAMPO_OBRIGATORIO_VAZIO', itens: id, problema: `Campo(s) obrigatório(s) vazio(s): ${faltam.join(', ')}`, evidencia: [ev('Origem', 'Campos obrigatórios definidos no projeto'), ev('Campos vazios', faltam.join(', '))],
          atual: Object.fromEntries([['codigo', it.codigo], ...faltam.map((n) => [n, null])]),
          justificativa: justificar('O projeto definiu estes campos como obrigatórios para o cadastro saneado.', 'preencher com a informação do cliente; o motor não preenche por semelhança.') });
      }
      if (it.ultimaMovimentacao != null && txt(it.ultimaMovimentacao) !== '') {
        const d = txt(it.ultimaMovimentacao);
        if (!dataIsoValida(d)) {
          c({ camada: 'QUALIDADE', tipo: 'DATA_MOVIMENTACAO_INVALIDA', itens: id, problema: `Data de última movimentação ilegível: "${d}"`, evidencia: [ev('Origem', 'Coluna da última movimentação na base importada'), ev('Valor', d)], atual: { codigo: it.codigo, ultimaMovimentacao: d },
            justificativa: justificar('Sem data legível o item não entra no corte de movimentação.', 'conferir o formato da data na planilha (esperado dia/mês/ano) e reimportar.') });
        } else if (contexto.dataBase && d > contexto.dataBase) {
          c({ camada: 'QUALIDADE', tipo: 'DATA_MOVIMENTACAO_INVALIDA', itens: id, problema: `Última movimentação (${dataBr(d)}) posterior à data-base (${dataBr(contexto.dataBase)})`, evidencia: [ev('Origem', 'Coluna da última movimentação na base importada'), ev('Valor', dataBr(d))], atual: { codigo: it.codigo, ultimaMovimentacao: d },
            justificativa: justificar('Data no futuro em relação à data-base indica erro de formato ou extração fora do período.', 'conferir a data na planilha e a data-base do projeto.') });
        }
      } else if (sinalizaSemData) {
        semDataPendentes++;
        c({ camada: 'QUALIDADE', tipo: 'SEM_DATA_MOVIMENTACAO', itens: id, problema: 'Item sem data de última movimentação', evidencia: [ev('Origem', 'Coluna da última movimentação na base importada'), ev('Tratamento dos itens sem data', `Deixar para tratar depois: pendente, fora do corte de movimentação${decisaoSemData ? ` (escolha ${decisaoSemData})` : ''}`)], atual: { codigo: it.codigo, ultimaMovimentacao: null },
          justificativa: justificar('Sem data não dá para aplicar o corte de movimentação; a ausência de movimento, por si só, não determina bloqueio.', 'obter a data no ERP, ou escolher "Considerar sem movimentação" em Fase 1 > 1.1 Dados do projeto e analisar de novo.') });
      }
      if (it.saldo != null && !Number.isFinite(it.saldo)) {
        c({ camada: 'QUALIDADE', tipo: 'SALDO_INVALIDO', itens: id, problema: 'Saldo não numérico', evidencia: [ev('Origem', 'Coluna do saldo na base importada')], atual: { codigo: it.codigo },
          justificativa: justificar('Saldo ilegível impede avaliar impacto de consolidação e de inativação.', 'conferir a coluna do saldo e reimportar.') });
      } else if (it.saldo != null && it.saldo < 0) {
        c({ camada: 'QUALIDADE', tipo: 'SALDO_NEGATIVO', itens: id, problema: `Saldo negativo (${sb(it.saldo)})`, evidencia: [ev('Origem', 'Coluna do saldo na base importada'), ev('Saldo', sb(it.saldo))], atual: { codigo: it.codigo, saldo: it.saldo },
          justificativa: justificar('Saldo negativo é indício de movimentação lançada em outro código ou de erro de baixa, não conclusão.', 'investigar a movimentação do item antes de qualquer consolidação ou inativação.') });
      }
      // Sem movimentação desde o corte (item ativo ou de situação desconhecida, com data legível, ou sem data quando a escolha da importação foi
      // "Considerar sem movimentação"): candidato a inativação, tratado por grupo depois do laço.
      const mov = txt(it.ultimaMovimentacao);
      if (it.ativo !== false && ((mov && dataIsoValida(mov)) || (!mov && semDataParado))) {
        if (!corte) comDataSemCorte++;
        else if (!mov || mov < corte) { const g = txt(it.grupo) || SEM_GRUPO; const l = paradosPorGrupo.get(g); if (l) l.push(it); else paradosPorGrupo.set(g, [it]); }
      }
      if (it.ativo === false) {
        const comSaldo = it.saldo != null && Number.isFinite(it.saldo) && it.saldo > 0;
        const recente = !!contexto.corteMovimentacao && !!it.ultimaMovimentacao && it.ultimaMovimentacao >= contexto.corteMovimentacao;
        if (comSaldo || recente) {
          c({ camada: 'QUALIDADE', tipo: 'ITEM_INATIVO_COM_USO', itens: id, problema: `Item inativo/bloqueado ${comSaldo ? `com saldo (${sb(it.saldo as number)})` : `com movimentação desde ${dataBr(contexto.corteMovimentacao)}`}`,
            evidencia: [ev('Origem', 'Situação (ativo/inativo/bloqueado) na base importada'), ev('Saldo', it.saldo == null ? 'sem saldo' : sb(it.saldo)), ev('Última movimentação', it.ultimaMovimentacao ? dataBr(it.ultimaMovimentacao) : 'sem data')],
            atual: { codigo: it.codigo, ativo: 'inativo', saldo: it.saldo, ultimaMovimentacao: it.ultimaMovimentacao },
            justificativa: justificar('Item bloqueado que ainda tem estoque ou uso recente é inconsistente: ou o bloqueio está errado, ou o saldo precisa de destino.', 'decidir com o cliente entre reativar o item ou dar destino ao saldo antes de manter o bloqueio.') });
        }
      }
    }
    for (const caso of casosSemMovimentacao(paradosPorGrupo, corte, contexto, escala, decisaoSemData)) casos.push(caso);
    // Cobertura: campo que a base não traz não se verifica; diz-se quantos itens ficaram de fora em vez de silenciar.
    const falta: [string, number][] = [];
    if (itens.length && !itens.some((i) => i.ultimaMovimentacao)) falta.push(['nenhuma data de movimentação (corte e uso não verificados)', itens.length]);
    if (itens.length && !itens.some((i) => i.saldo != null)) falta.push(['nenhum saldo (inativo com saldo e saldo negativo não verificados)', itens.length]);
    if (itens.length && !itens.some((i) => txt(i.descricao))) falta.push(['nenhuma descrição utilizável', itens.length]);
    const motivos: string[] = [];
    if (falta.length) motivos.push(`A base não traz: ${falta.map(([m]) => m).join('; ')}`);
    // Sem corte não há como dizer o que está parado: o critério de itens sem movimentação a longa data não é aplicado, e isso é dito (não silenciado).
    if (comDataSemCorte) motivos.push(`Corte de movimentação não definido na configuração: o critério de itens sem movimentação a longa data (candidatos a inativação) não foi aplicado a ${comDataSemCorte} item(ns) ${semDataParado ? 'com data ou considerados sem movimentação' : 'com data'}`);
    // "Deixar para tratar depois": os itens sem data ficam pendentes (fora do corte), e a Cobertura diz quantos.
    if (semDataPendentes) motivos.push(`${semDataPendentes} item(ns) sem data de última movimentação deixados para tratar depois (pendentes): ficam fora do corte de movimentação até ter a data ou mudar o tratamento`);
    const semDados = motivos.length ? { motivo: motivos.join('. '), itens: Math.max(comDataSemCorte, semDataPendentes, ...falta.map(([, n]) => n)) } : null;
    return montarResultado('QUALIDADE', itens, casos, semDados);
  }
}

const SEM_GRUPO = '(sem grupo)';
const saldoZeroOuNulo = (i: ItemTrabalho) => i.saldo == null || i.saldo === 0;
const saldoTexto = (i: ItemTrabalho, escala: number) => (i.saldo == null ? 'não informado' : Number.isFinite(i.saldo) ? numeroBr(saldoNaEscala(i.saldo, escala) ?? i.saldo) : 'ilegível');
function faixaDeDatas(itens: ItemTrabalho[]): string {
  let min = ''; let max = '';
  let semData = 0;
  for (const i of itens) { const d = txt(i.ultimaMovimentacao); if (!d) { semData++; continue; } if (!min || d < min) min = d; if (d > max) max = d; }
  const faixa = !min ? '' : min === max ? dataBr(min) : `entre ${dataBr(min)} e ${dataBr(max)}`;
  return semData ? [faixa, `${semData === itens.length ? 'sem data' : `${semData} sem data`}`].filter(Boolean).join('; ') : faixa;
}
const exemplo = (i: ItemTrabalho, escala: number) => `${rotuloItem(i)}: ${txt(i.descricao).slice(0, 120)} · mov. ${txt(i.ultimaMovimentacao) ? dataBr(txt(i.ultimaMovimentacao)) : 'sem data'} · saldo ${saldoTexto(i, escala)}`;

/**
 * Itens sem movimentação desde o corte, por grupo (trabalho por conjunto, resultado por item):
 * - SEM_MOVIMENTACAO: sem saldo (zero ou não informado) → proposta de inativar (decisão PROPOR_INATIVACAO; aprovar grava ativo = não e gera
 *   o ajuste "consolidou/inativou" do checklist SPED).
 * - SEM_MOVIMENTACAO_COM_SALDO: com saldo (positivo, negativo ou ilegível) → não propõe inativar; pede regularizar o saldo antes (aprovar só
 *   registra a ciência).
 * Item que já está numa unificação de códigos (o código que fica, que recebe o saldo, ou um que sai) fica fora dos dois, e a evidência diz por quê.
 */
function casosSemMovimentacao(porGrupo: Map<string, ItemTrabalho[]>, corte: string | null, contexto: ContextoAnalise, escala = 1, decisaoSemData = ''): CasoProposto[] {
  if (!corte) return [];
  const unif = unificacoesDe(contexto);
  const out: CasoProposto[] = [];
  const fundamento = `Critério do projeto: última movimentação anterior ao corte de movimentação definido na configuração (${dataBr(corte)}), item ativo ou de situação não informada.`;
  for (const [grupo, lista] of porGrupo) {
    const emUnif: ItemTrabalho[] = []; const semSaldo: ItemTrabalho[] = []; const comSaldo: ItemTrabalho[] = [];
    for (const i of lista) (unif.has(i.id) ? emUnif : saldoZeroOuNulo(i) ? semSaldo : comSaldo).push(i);
    const papel = (i: ItemTrabalho) => { const u = unif.get(i.id)!; return u.papel === 'FICA' ? `código que fica na unificação, recebe ${u.outro}` : `sai na unificação para ${u.outro}`; };
    const foraUnif = emUnif.length
      ? [ev('Fora desta proposta', `${emUnif.length} item(ns) já em unificação de códigos (a inativação segue a unificação): ${emUnif.slice(0, 5).map((i) => `${rotuloItem(i)} (${papel(i)})`).join('; ')}${emUnif.length > 5 ? '; e outros' : ''}`)]
      : [];
    // Itens sem data que entraram por "Considerar sem movimentação": a evidência diz que não há data na base e quem decidiu tratá-los assim.
    const semDataEv = (l: ItemTrabalho[]) => {
      const n = l.filter((i) => !txt(i.ultimaMovimentacao)).length;
      return n ? [ev('Sem data de movimentação', `${n} item(ns): sem data de movimentação na base; tratado como sem movimentação por decisão ${decisaoSemData || 'na importação'}`)] : [];
    };
    const base = (l: ItemTrabalho[]) => [
      ev('Origem', 'Última movimentação, saldo e situação na base importada'), ev('Corte de movimentação (configuração do projeto)', dataBr(corte)), ev('Grupo', grupo),
      ...(l.length > 1 ? [ev('Itens do conjunto', l.length)] : []), ev('Última movimentação', faixaDeDatas(l)), ...semDataEv(l),
    ];
    if (semSaldo.length) {
      const naoInformado = semSaldo.filter((i) => i.saldo == null).length;
      out.push(novoCaso({
        camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO', itens: semSaldo.map((i) => i.id),
        problema: semSaldo.length === 1 ? `Item sem movimentação desde ${dataBr(corte)} e sem saldo: candidato a inativação` : `${semSaldo.length} itens do grupo "${grupo}" sem movimentação desde ${dataBr(corte)} e sem saldo: candidatos a inativação`,
        evidencia: [
          ...base(semSaldo), ...(naoInformado ? [ev('Saldo não informado', `${naoInformado} item(ns): conferir no ERP que estão zerados antes de inativar`)] : []), ...foraUnif,
          ...semSaldo.slice(0, 5).map((i) => ev(semSaldo.length > 1 ? 'Exemplo' : 'Item', exemplo(i, escala))),
        ],
        // `ativo` é booleano (a validação da proposta exige); o tipo do contrato só lista texto e número.
        atual: { ativo: valorComum(semSaldo.map((i) => i.ativo)) as never }, proposta: { decisao: 'PROPOR_INATIVACAO', ativo: false as never },
        impactos: ['Inativar o código no ERP depois de conferir documentos abertos, pedidos e planos de manutenção que o usem', 'Cadastro do item (0200) e inventário (H010): o código deixa de ser usado a partir da inativação; o histórico fica preservado'],
        justificativa: justificar('Item ativo sem movimentação desde o corte e sem saldo não tem uso nem estoque a preservar: mantê-lo ativo polui o cadastro e a classificação.', 'conferir que nenhum documento aberto ou plano de manutenção usa os códigos; aprovar inativa os itens deste conjunto.'),
        fundamento,
      }));
    }
    if (comSaldo.length) {
      let total = 0;
      for (const i of comSaldo) if (i.saldo != null && Number.isFinite(i.saldo)) total += i.saldo;
      out.push(novoCaso({
        camada: 'QUALIDADE', tipo: 'SEM_MOVIMENTACAO_COM_SALDO', itens: comSaldo.map((i) => i.id),
        problema: comSaldo.length === 1
          ? `Item sem movimentação desde ${dataBr(corte)}, mas com saldo (${saldoTexto(comSaldo[0], escala)}): regularizar o saldo antes de inativar`
          : `${comSaldo.length} itens do grupo "${grupo}" sem movimentação desde ${dataBr(corte)}, mas com saldo: regularizar o saldo antes de inativar`,
        evidencia: [...base(comSaldo), ev('Saldo somado (na unidade de cada item)', numeroBr(saldoNaEscala(total, escala) ?? total)), ...(escala !== 1 ? [ev('Escala do saldo', `a base traz o saldo multiplicado por ${numeroBr(escala)}: os saldos aqui já estão divididos`)] : []), ...foraUnif, ...comSaldo.slice(0, 10).map((i) => ev(comSaldo.length > 1 ? 'Exemplo' : 'Item', exemplo(i, escala)))],
        atual: { saldo: valorComum(comSaldo.map((i) => i.saldo)) }, proposta: { decisao: 'REGULARIZAR_SALDO' },
        impactos: ['Regularização de saldo: o inventário (H010) deve refletir o ajuste (baixa, inventário físico ou transferência) antes de qualquer inativação'],
        justificativa: justificar('Item sem movimento que ainda tem saldo não pode ser inativado: o saldo ficaria sem destino e o inventário divergiria do cadastro.', 'apurar o saldo com o cliente (inventário físico, baixa ou transferência para outro código) e rodar a análise de novo; aprovar só registra a ciência, não inativa.'),
        fundamento,
      }));
    }
  }
  return out;
}
