/**
 * Camada QUALIDADE: o cadastro está completo e coerente? Descrição insuficiente, unidade ausente ou incompatível com a descrição, campos obrigatórios extras vazios,
 * datas e saldos inválidos, item inativo/bloqueado que ainda tem saldo ou uso, item sem data de movimentação (conforme o parâmetro do projeto).
 * NCM e grupo vazios são casos das camadas NCM e Grupos (cada célula da tabela única precisa refletir o próprio problema); código e estabelecimento, da Identificação.
 */
import type { AnalisadorCamada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ev, justificar, montarResultado } from './base';
import { parametrosDe } from './contexto';
import { novoCaso } from './dependencias';
import { campoDe, dataBr, dataIsoValida, motivoDescricaoInsuficiente, numeroBr, txt, vazio } from './texto';
import { GRANDEZAS, classificarUnidade, grandezasNaDescricao } from './unidades';

export class AnalisadorQualidade implements AnalisadorCamada {
  readonly camada = 'QUALIDADE' as const;

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const par = parametrosDe(contexto);
    const casos: CasoProposto[] = [];
    const c = (x: Parameters<typeof novoCaso>[0]) => casos.push(novoCaso(x));
    const obrigatorios = par.camposObrigatorios ?? [];
    const sinalizaSemData = (par.semDataMovimentacao ?? 'SINALIZAR') === 'SINALIZAR' && itens.some((i) => !!i.ultimaMovimentacao); // base sem nenhuma data: não há o que cobrar item a item
    const politica = par.politicaUnidade ?? {};

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
        c({ camada: 'QUALIDADE', tipo: 'SEM_DATA_MOVIMENTACAO', itens: id, problema: 'Item sem data de última movimentação', evidencia: [ev('Origem', 'Coluna da última movimentação na base importada'), ev('Parâmetro do projeto', 'itens sem data são sinalizados')], atual: { codigo: it.codigo, ultimaMovimentacao: null },
          justificativa: justificar('Sem data não dá para aplicar o corte de movimentação; a ausência de movimento, por si só, não determina bloqueio.', 'obter a data no ERP, ou definir no projeto como tratar itens sem data (anteriores ao corte).') });
      }
      if (it.saldo != null && !Number.isFinite(it.saldo)) {
        c({ camada: 'QUALIDADE', tipo: 'SALDO_INVALIDO', itens: id, problema: 'Saldo não numérico', evidencia: [ev('Origem', 'Coluna do saldo na base importada')], atual: { codigo: it.codigo },
          justificativa: justificar('Saldo ilegível impede avaliar impacto de consolidação e de inativação.', 'conferir a coluna do saldo e reimportar.') });
      } else if (it.saldo != null && it.saldo < 0) {
        c({ camada: 'QUALIDADE', tipo: 'SALDO_NEGATIVO', itens: id, problema: `Saldo negativo (${numeroBr(it.saldo)})`, evidencia: [ev('Origem', 'Coluna do saldo na base importada'), ev('Saldo', numeroBr(it.saldo))], atual: { codigo: it.codigo, saldo: it.saldo },
          justificativa: justificar('Saldo negativo é indício de movimentação lançada em outro código ou de erro de baixa, não conclusão.', 'investigar a movimentação do item antes de qualquer consolidação ou inativação.') });
      }
      if (it.ativo === false) {
        const comSaldo = it.saldo != null && Number.isFinite(it.saldo) && it.saldo > 0;
        const recente = !!contexto.corteMovimentacao && !!it.ultimaMovimentacao && it.ultimaMovimentacao >= contexto.corteMovimentacao;
        if (comSaldo || recente) {
          c({ camada: 'QUALIDADE', tipo: 'ITEM_INATIVO_COM_USO', itens: id, problema: `Item inativo/bloqueado ${comSaldo ? `com saldo (${numeroBr(it.saldo as number)})` : `com movimentação desde ${dataBr(contexto.corteMovimentacao)}`}`,
            evidencia: [ev('Origem', 'Situação (ativo/inativo/bloqueado) na base importada'), ev('Saldo', it.saldo == null ? 'sem saldo' : numeroBr(it.saldo)), ev('Última movimentação', it.ultimaMovimentacao ? dataBr(it.ultimaMovimentacao) : 'sem data')],
            atual: { codigo: it.codigo, ativo: 'inativo', saldo: it.saldo, ultimaMovimentacao: it.ultimaMovimentacao },
            justificativa: justificar('Item bloqueado que ainda tem estoque ou uso recente é inconsistente: ou o bloqueio está errado, ou o saldo precisa de destino.', 'decidir com o cliente entre reativar o item ou dar destino ao saldo antes de manter o bloqueio.') });
        }
      }
    }
    // Cobertura: campo que a base não traz não se verifica; diz-se quantos itens ficaram de fora em vez de silenciar.
    const falta: [string, number][] = [];
    if (itens.length && !itens.some((i) => i.ultimaMovimentacao)) falta.push(['nenhuma data de movimentação (corte e uso não verificados)', itens.length]);
    if (itens.length && !itens.some((i) => i.saldo != null)) falta.push(['nenhum saldo (inativo com saldo e saldo negativo não verificados)', itens.length]);
    if (itens.length && !itens.some((i) => txt(i.descricao))) falta.push(['nenhuma descrição utilizável', itens.length]);
    const semDados = falta.length ? { motivo: `A base não traz: ${falta.map(([m]) => m).join('; ')}`, itens: Math.max(...falta.map(([, n]) => n)) } : null;
    return montarResultado('QUALIDADE', itens, casos, semDados);
  }
}
