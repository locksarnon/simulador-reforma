/**
 * Camada IDENTIFICACAO: o item tem como ser identificado de forma estável? Códigos ausentes, repetidos (por estabelecimento), com formato estranho, que diferem
 * só por zeros à esquerda, o mesmo código com descrições diferentes em estabelecimentos distintos, estabelecimento ausente (quando o projeto o exige) e códigos antigos.
 * Funções puras; o código é sempre texto (zeros à esquerda importam).
 */
import type { AnalisadorCamada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ev, justificar, montarResultado, rotuloItem } from './base';
import { parametrosDe } from './contexto';
import { novoCaso } from './dependencias';
import { agrupar, campoExtra, chaveEstab, semAcento, txt } from './texto';

const descNorm = (d: string) => semAcento(d).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export class AnalisadorIdentificacao implements AnalisadorCamada {
  readonly camada = 'IDENTIFICACAO' as const;

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const par = parametrosDe(contexto);
    const casos: CasoProposto[] = [];
    const c = (x: Parameters<typeof novoCaso>[0]) => casos.push(novoCaso(x));

    for (const it of itens) {
      const cod = it.codigo ?? '';
      if (!txt(cod)) {
        c({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_AUSENTE', itens: [it.id], problema: 'Item sem código no ERP: não dá para identificá-lo de forma estável',
          evidencia: [ev('Origem', 'Coluna do código na base importada'), ev('Descrição', it.descricao)], atual: { codigo: null, descricao: it.descricao },
          justificativa: justificar('Sem código, decisões e histórico do item não têm âncora.', 'obter o código no ERP (ou na planilha de origem) e reimportar; o item não recebe decisão até lá.') });
      } else {
        if (cod !== txt(cod) || /[\s\u0000-\u001f\u007f ]/.test(txt(cod))) {
          const soPontas = !/[\s\u0000-\u001f\u007f ]/.test(txt(cod));
          c({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_FORMATO', itens: [it.id], problema: soPontas ? 'Código com espaços nas pontas' : 'Código com espaço ou caractere de controle no meio',
            evidencia: [ev('Origem', 'Coluna do código na base importada'), ev('Código lido', JSON.stringify(cod))], atual: { codigo: cod },
            proposta: soPontas ? { codigo: txt(cod) } : {},
            justificativa: justificar('O código com espaços ou caracteres invisíveis não casa com o mesmo código em outros arquivos (XML, SPED).', soPontas ? 'remover os espaços das pontas no cadastro.' : 'conferir no ERP qual é o código correto; o motor não altera o miolo do código.') });
        }
      }
      if (par.exigeEstabelecimento && !chaveEstab(it)) {
        c({ camada: 'IDENTIFICACAO', tipo: 'ESTABELECIMENTO_AUSENTE', itens: [it.id], problema: 'Item sem estabelecimento, e o projeto exige estabelecimento em todo item',
          evidencia: [ev('Origem', 'Coluna do estabelecimento/depósito na base importada'), ev('Código', cod)], atual: { codigo: cod, estabelecimento: null },
          justificativa: justificar('O mesmo código pode existir em estabelecimentos diferentes; sem o estabelecimento a identidade fica ambígua.', 'informar o estabelecimento de origem do item.') });
      }
    }

    // Repetidos: mesmo código no mesmo estabelecimento (um caso por conjunto de linhas).
    const comCodigo = itens.filter((i) => txt(i.codigo));
    for (const [k, grupo] of agrupar(comCodigo, (i) => `${chaveEstab(i)}\u0000${txt(i.codigo)}`)) {
      if (grupo.length < 2) continue;
      const [estab, cod] = k.split('\u0000');
      const iguais = new Set(grupo.map((i) => descNorm(i.descricao))).size === 1;
      c({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_REPETIDO', itens: grupo.map((i) => i.id), problema: `O código ${cod} aparece ${grupo.length} vezes${estab ? ` no estabelecimento ${estab}` : ''}`,
        evidencia: [ev('Origem', 'Coluna do código na base importada'), ev('Linhas com o código', grupo.length), ev('Descrições', iguais ? 'iguais' : 'diferentes'), ...grupo.slice(0, 5).map((i) => ev('Descrição', i.descricao))],
        atual: { codigo: cod, estabelecimento: estab || null },
        justificativa: justificar('Código repetido não identifica o item: não dá para saber de qual linha é a decisão.', iguais ? 'linhas iguais: tratar como repetição de extração (remover a repetida) ou como duplicidade de cadastro.' : 'descrições diferentes: o mesmo código representa produtos distintos; corrigir a identificação no ERP.') });
    }

    // Códigos numéricos que diferem só por zeros à esquerda ("001" e "1") no mesmo estabelecimento.
    const numericos = comCodigo.filter((i) => /^\d+$/.test(txt(i.codigo)));
    for (const [k, grupo] of agrupar(numericos, (i) => `${chaveEstab(i)}\u0000${txt(i.codigo).replace(/^0+(?=\d)/, '')}`)) {
      const distintos = [...new Set(grupo.map((i) => txt(i.codigo)))].sort();
      if (distintos.length < 2) continue;
      const [estab] = k.split('\u0000');
      c({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_ZEROS_ESQUERDA', itens: grupo.map((i) => i.id), problema: `Códigos que diferem só por zeros à esquerda: ${distintos.join(', ')}${estab ? ` (estabelecimento ${estab})` : ''}`,
        evidencia: [ev('Origem', 'Coluna do código na base importada'), ...grupo.slice(0, 6).map((i) => ev(`Código ${i.codigo}`, i.descricao))], atual: { codigos: distintos.join(' | ') },
        justificativa: justificar('Planilhas costumam perder ou criar zeros à esquerda; os códigos podem ser o mesmo item (ou itens distintos que se confundem).', 'conferir no ERP se são o mesmo produto; se forem, tratar na camada de duplicidade, sem reescrever o código.') });
    }

    // Mesmo código em estabelecimentos diferentes, com descrições diferentes: o código não identifica o mesmo produto.
    for (const [cod, grupo] of agrupar(comCodigo, (i) => txt(i.codigo))) {
      const estabs = new Set(grupo.map(chaveEstab));
      if (estabs.size < 2) continue;
      const descs = new Set(grupo.map((i) => descNorm(i.descricao)));
      if (descs.size < 2) continue;
      c({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_DESCRICOES_DIVERGENTES', itens: grupo.map((i) => i.id), problema: `O código ${cod} tem descrições diferentes em ${estabs.size} estabelecimentos`,
        evidencia: [ev('Origem', 'Códigos iguais em estabelecimentos distintos'), ...grupo.slice(0, 6).map((i) => ev(rotuloItem(i), i.descricao))], atual: { codigo: cod },
        justificativa: justificar('O mesmo código deveria ser o mesmo produto em todos os estabelecimentos; descrições diferentes indicam produtos distintos com o mesmo código.', 'confirmar com o cliente se é o mesmo produto (padronizar a descrição) ou produtos diferentes (criar código próprio).') });
    }

    // Códigos antigos: o vínculo antigo → novo precisa ser preservado; o código antigo em uso por outro item é colisão.
    const porCodigo = new Map<string, ItemTrabalho[]>();
    for (const [k, g] of agrupar(comCodigo, (i) => `${chaveEstab(i)}\u0000${txt(i.codigo)}`)) porCodigo.set(k, g);
    for (const it of itens) {
      const antigo = campoExtra(it, 'codigoAntigo', 'codigo_antigo', 'codAntigo');
      if (!antigo || antigo === txt(it.codigo)) continue;
      const outro = (porCodigo.get(`${chaveEstab(it)}\u0000${antigo}`) ?? []).filter((o) => o.id !== it.id);
      if (outro.length) {
        c({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_ANTIGO_EM_USO', itens: [it.id, ...outro.map((o) => o.id)], problema: `O código antigo ${antigo} do item ${it.codigo} é o código atual de outro item`,
          evidencia: [ev('Origem', 'Campo "código antigo" da base importada'), ev('Item', `${it.codigo} — ${it.descricao}`), ev('Outro item com o código', `${outro[0].codigo} — ${outro[0].descricao}`)], atual: { codigo: it.codigo, codigoAntigo: antigo },
          justificativa: justificar('Código antigo reaproveitado por outro item mistura históricos (documentos, SPED, inventário).', 'confirmar se o outro item é o mesmo produto (consolidação) ou se o código foi reutilizado; registrar o vínculo.') });
      } else {
        c({ camada: 'IDENTIFICACAO', tipo: 'CODIGO_ANTIGO', itens: [it.id], problema: `Item com código antigo informado (${antigo}): o vínculo antigo → atual precisa ficar registrado`,
          evidencia: [ev('Origem', 'Campo "código antigo" da base importada'), ev('Código atual', it.codigo), ev('Código antigo', antigo)], atual: { codigo: it.codigo, codigoAntigo: antigo },
          impactos: ['Histórico de alteração do item no SPED: registro 0205 (COD_ANT_ITEM, DT_INI, DT_FIM); o campo COD_ANT_ITEM do 0200 não é preenchido (Guia Prático da EFD ICMS/IPI 3.2.4)'],
          justificativa: justificar('Documentos antigos citam o código antigo; sem o vínculo o histórico se perde.', 'registrar o vínculo código antigo → atual, com data e justificativa, no De/para.') });
      }
    }

    return montarResultado('IDENTIFICACAO', itens, casos);
  }
}
