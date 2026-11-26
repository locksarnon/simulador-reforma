/**
 * Camada NCM (parte formal e de coerência; o enquadramento tributário é de outro agente): NCM ausente, com formato inválido (8 dígitos, texto, zero à esquerda), inexistente,
 * fora da vigência ou de classificação antiga (com sucessor), incompatível com a descrição (INDICAÇÃO: correspondência por texto não prova), divergente entre itens de
 * descrição idêntica e informação técnica insuficiente para confirmar a classificação. A tabela NCM entra por interface injetada (`TabelaNcm`).
 * O motor nunca copia a classificação de um item parecido: só aponta a divergência.
 */
import { normalizar } from '../../produtos/duplicidade';
import type { AnalisadorCamada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ev, justificar, montarResultado } from './base';
import { tabelaNcmDe } from './contexto';
import { novoCaso } from './dependencias';
import { agrupar, GENERICOS, motivoDescricaoInsuficiente, palavras, soDigitos, soTermosGenericos, txt, unicos } from './texto';

const LIMITACAO = 'A correspondência por texto é só uma indicação: a descrição oficial do NCM é genérica e o produto pode ter nome comercial; não prova erro nem acerto.';

/** Palavras com conteúdo (4+ letras, sem termos genéricos), reduzidas à raiz de 5 letras para comparar singular/plural e variações. */
const raizes = (t: string): Set<string> => new Set(palavras(t).filter((w) => w.length >= 4 && !GENERICOS.has(w) && !/\d/.test(w)).map((w) => w.slice(0, 5)));

export class AnalisadorNcm implements AnalisadorCamada {
  readonly camada = 'NCM' as const;

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const tabela = tabelaNcmDe(contexto);
    const casos: CasoProposto[] = [];
    const c = (x: Parameters<typeof novoCaso>[0]) => casos.push(novoCaso(x));
    const origem = ev('Origem', 'Coluna do NCM na base importada');

    for (const it of itens) {
      const id = [it.id]; const bruto = txt(it.ncm); const digitos = soDigitos(bruto);
      const insuficiente = motivoDescricaoInsuficiente(it.descricao) ?? (soTermosGenericos(it.descricao) ? 'Descrição só com termos genéricos' : null);
      if (insuficiente) {
        c({ camada: 'NCM', tipo: 'NCM_INFO_INSUFICIENTE', itens: id, problema: `Informação técnica insuficiente para ${bruto ? 'confirmar' : 'propor'} a classificação: ${insuficiente.toLowerCase()}`,
          evidencia: [ev('Origem', 'Descrição e NCM da base importada'), ev('Descrição', it.descricao), ev('NCM informado', bruto || 'vazio')], atual: { codigo: it.codigo, ncm: bruto || null, descricao: it.descricao },
          justificativa: justificar('Sem nome, composição ou aplicação do produto não há como confirmar o NCM nem indicar sucessor.', 'pedir ao cliente a ficha técnica (composição, aplicação, fabricante); nenhuma classificação é sugerida por semelhança.') });
      }
      if (!bruto) {
        c({ camada: 'NCM', tipo: 'NCM_AUSENTE', itens: id, problema: 'Item sem NCM', evidencia: [origem, ev('Descrição', it.descricao)], atual: { codigo: it.codigo, ncm: null },
          justificativa: justificar('O NCM é base do enquadramento tributário (IBS/CBS) e dos documentos fiscais.', 'classificar o item com a informação técnica do cliente; o motor não copia o NCM de item parecido.') });
        continue;
      }
      if (/^0+$/.test(digitos) && digitos.length > 0) {
        c({ camada: 'NCM', tipo: 'NCM_PREENCHIMENTO_INVALIDO', itens: id, problema: `NCM preenchido só com zeros (${bruto})`, evidencia: [origem, ev('Valor', bruto)], atual: { codigo: it.codigo, ncm: bruto },
          justificativa: justificar('Valor de preenchimento, não é classificação.', 'classificar o item; tratar como ausente até lá.') });
        continue;
      }
      if (!/^\d{8}$/.test(bruto)) {
        let proposto: string | null = null; let porque: string;
        if (digitos.length === 8 && /^[\d.\-\s]+$/.test(bruto)) { proposto = digitos; porque = 'o NCM veio com pontuação'; }
        else if (digitos.length === 7 && /^\d{7}$/.test(bruto)) { const cand = `0${digitos}`; if (!tabela || tabela.existe(cand)) proposto = cand; porque = 'provável perda do zero à esquerda (7 dígitos)'; }
        else porque = `${digitos.length} dígitos`;
        c({ camada: 'NCM', tipo: 'NCM_FORMATO', itens: id, problema: `NCM fora do formato de 8 dígitos (${bruto}): ${porque!}`, evidencia: [origem, ev('Valor', bruto), ev('Dígitos', digitos.length)], atual: { codigo: it.codigo, ncm: bruto },
          proposta: proposto ? { ncm: proposto } : {}, impactos: proposto ? ['Classificação nos documentos e SPED (0200, C170)'] : [],
          justificativa: justificar('O NCM deve ser texto de 8 dígitos; planilhas perdem zeros à esquerda.', proposto ? `conferir o NCM ${proposto} (${tabela ? 'existe na tabela' : 'tabela não consultada'}) e aprovar.` : 'obter o NCM correto com o cliente; o motor não completa dígitos por adivinhação.') });
        continue;
      }
      if (!tabela) continue;
      if (!tabela.existe(bruto)) {
        c({ camada: 'NCM', tipo: 'NCM_INEXISTENTE', itens: id, problema: `NCM ${bruto} não existe na tabela`, evidencia: [origem, ev('NCM', bruto)], atual: { codigo: it.codigo, ncm: bruto },
          justificativa: justificar('Código fora da tabela do Siscomex: erro de digitação ou código de outro sistema.', 'reclassificar o item com a informação técnica do cliente.') });
        continue;
      }
      if (!tabela.vigente(bruto, contexto.dataBase)) {
        const suc = tabela.sucessores(bruto);
        c({ camada: 'NCM', tipo: suc.length ? 'NCM_CLASSIFICACAO_ANTIGA' : 'NCM_NAO_VIGENTE', itens: id, problema: `NCM ${bruto} não consta como ativo na tabela atual do Siscomex${suc.length ? `; sucessor(es): ${suc.join(', ')}` : ''}`,
          evidencia: [origem, ev('NCM', bruto), ev('Limitação', 'A tabela só traz o status atual; a vigência por data não está disponível'), ...(suc.length ? [ev('Sucessores', suc.join(', '))] : [])], atual: { codigo: it.codigo, ncm: bruto },
          proposta: suc.length === 1 ? { ncm: suc[0] } : {}, impactos: ['Classificação nos documentos e SPED (0200, C170)'],
          justificativa: justificar('NCM que não consta como ativo na tabela atual deve ser substituído pelo vigente (a vigência na data-base do projeto não pôde ser verificada: só há o status atual).', suc.length === 1 ? `confirmar que o produto segue o sucessor ${suc[0]} (a sucessão pode se desdobrar por característica) e aprovar.` : suc.length ? 'escolher entre os sucessores conforme a característica do produto (informação do cliente).' : 'reclassificar o item.') });
        continue;
      }
      // Coerência com a descrição oficial (só indicação).
      const oficial = tabela.descricao(bruto);
      if (oficial && !insuficiente) {
        const item = raizes(it.descricao); const of = raizes(oficial);
        if (item.size >= 2 && of.size >= 1 && ![...item].some((r) => of.has(r))) {
          c({ camada: 'NCM', tipo: 'NCM_INCOMPATIVEL_DESCRICAO', itens: id, problema: `A descrição do item não tem relação textual com a descrição oficial do NCM ${bruto}`,
            evidencia: [origem, ev('Descrição do item', it.descricao), ev('Descrição oficial do NCM', oficial), ev('Limitação', LIMITACAO)], atual: { codigo: it.codigo, ncm: bruto },
            justificativa: justificar('Indicação por texto: nenhuma palavra de conteúdo do item aparece na descrição oficial do NCM.', 'conferir o produto com a informação técnica do cliente; só se confirmado o erro o NCM é reclassificado (nenhum NCM é proposto por semelhança).') });
        }
      }
    }

    // Itens de descrição idêntica (após normalizar) com NCMs diferentes: um deles está errado ou não são o mesmo produto.
    const comNcm = itens.filter((i) => /^\d{8}$/.test(txt(i.ncm)) && txt(i.descricao));
    const porChave = agrupar(comNcm, (i) => { const n = normalizar(i.descricao); return n.tokens.length >= 2 ? n.chave : ''; });
    for (const [chave, g] of porChave) {
      if (!chave || g.length < 2 || g.length > 50) continue;
      const ncms = unicos(g.map((i) => txt(i.ncm))).sort();
      if (ncms.length < 2) continue;
      c({ camada: 'NCM', tipo: 'NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS', itens: g.map((i) => i.id), problema: `${g.length} itens de descrição idêntica têm ${ncms.length} NCMs diferentes (${ncms.join(', ')})`,
        evidencia: [ev('Origem', 'Descrição e NCM da base importada'), ...g.slice(0, 6).map((i) => ev(`Código ${i.codigo}`, `${i.descricao} — NCM ${txt(i.ncm)}`))], atual: { codigos: g.slice(0, 20).map((i) => i.codigo).join(' | '), ncms: ncms.join(' | ') },
        justificativa: justificar('Itens que são o mesmo produto devem ter o mesmo NCM; se têm NCMs diferentes, ao menos um está errado (ou são produtos distintos descritos igual).', 'conferir com a informação técnica do cliente qual é o correto; o motor não escolhe um NCM copiando o do item parecido.') });
    }

    const comNcm8 = itens.filter((i) => /^\d{8}$/.test(txt(i.ncm))).length;
    const semDados = tabela ? null : { motivo: 'Tabela NCM não informada: existência, vigência e coerência com a descrição não foram verificadas (só a parte formal)', itens: comNcm8 };
    return montarResultado('NCM', itens, casos, semDados);
  }
}
