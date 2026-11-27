import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseLegalService } from '../../base-legal/base-legal.service';
import { LimiteUso, comPrazo } from '../../ia-consultoria/util';
import type { Usuario } from '../dados/constantes';
import { validarCamada } from '../dados/constantes';
import { criterioPorChave, textoDoValor, valorCriterio, type CriteriosGravados } from './catalogo';
import { SanCriteriosService } from './criterios.service';
import { lerNormalizacao, montarPromptNormalizacao } from './normalizacao';

const PRAZO_MS = 30_000;
export const NOTA_IA_INDISPONIVEL = 'Gravado como verificação manual porque a IA não estava disponível para conferir se a frase se encaixa num critério ajustável.';

/**
 * Normaliza um critério escrito à mão (mesma ponte de IA do parecer do saneamento: BaseLegalService.ia, com prazo). Encaixado num critério
 * ajustável: devolve a PROPOSTA (nada é gravado; o usuário confirma pelo ajuste). Não encaixado: grava como verificação manual. IA fora do ar,
 * lenta ou com resposta ilegível: grava como verificação manual com uma nota. Nunca lança erro por falha da IA.
 */
@Injectable()
export class SanCriteriosIaService {
  private readonly log = new Logger(SanCriteriosIaService.name);
  private readonly limite = new LimiteUso(60, 60 * 60_000, 'Muitos critérios enviados à IA seguidos. Aguarde um pouco.');

  constructor(private readonly criterios: SanCriteriosService, private readonly base: BaseLegalService) {}

  async normalizar(projetoId: string, camadaTexto: string, textoBruto: unknown, usuario?: Usuario) {
    const camada = validarCamada(String(camadaTexto));
    const texto = String(textoBruto ?? '').replace(/\s+/g, ' ').trim();
    if (texto.length < 5) throw new BadRequestException('Escreva o critério em uma frase.');
    // O projeto (e a camada ligada nele) antes de qualquer chamada paga à IA: projeto inexistente é 404; camada desligada, 400.
    const lista = await this.criterios.listar(projetoId);
    const ativas = lista.camadas.map((x) => x.camada);
    if (!ativas.includes(camada)) throw new BadRequestException('Esta camada não está ligada neste projeto.');
    const comoManual = async (explicacao: string, nota: string | null, iaDisponivel: boolean) => {
      const r = await this.criterios.incluirManual(projetoId, camada, texto, usuario, nota);
      return { resultado: 'MANUAL' as const, iaDisponivel, explicacao, manual: r.manual, camadas: r.camadas, historico: r.historico };
    };
    if (!this.base.iaConfigurada()) return comoManual('A IA não está disponível agora.', NOTA_IA_INDISPONIVEL, false);
    // Limite por usuário: pelo e-mail ou, sem ele, pelo id (sem nenhum dos dois, um balde comum).
    this.limite.consumir(usuario?.email || (usuario as { id?: string } | undefined)?.id || 'sem-usuario');
    let resposta: string;
    try {
      resposta = await comPrazo(this.base.ia(montarPromptNormalizacao(camada, texto), PRAZO_MS), PRAZO_MS + 5_000);
    } catch (e) {
      this.log.warn(`Normalização de critério sem resposta da IA: ${(e as Error).message}`);
      return comoManual('A IA não respondeu a tempo.', NOTA_IA_INDISPONIVEL, false);
    }
    const n = lerNormalizacao(resposta);
    if (n.tipo === 'MANUAL') return comoManual(n.explicacao, null, true);
    // Proposta para camada desligada no projeto (a IA escolheu outra camada): não vira ajuste; fica como verificação manual.
    if (!ativas.includes(n.camada)) return comoManual('O critério corresponde a uma camada que não está ligada neste projeto.', null, true);
    const c = criterioPorChave(n.camada, n.chave)!;
    const atual = lista.camadas.find((x) => x.camada === n.camada)?.criterios.find((x) => x.id === c.id)?.parametro?.valor
      ?? valorCriterio({} as CriteriosGravados, n.camada, n.chave);
    return {
      resultado: 'PROPOSTA' as const, iaDisponivel: true, explicacao: n.explicacao,
      proposta: { camada: n.camada, chave: n.chave, valor: n.valor, criterio: n.criterio, criterioId: c.id, textoValor: n.textoValor, textoAtual: textoDoValor(c.parametro!, atual), igualAoAtual: atual === n.valor },
    };
  }
}
