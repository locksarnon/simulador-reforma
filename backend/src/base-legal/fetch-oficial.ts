import { BadRequestException } from '@nestjs/common';
import { urlOficialValida } from './base-legal.deteccao';

export const MAX_REDIRECIONAMENTOS = 5;

/**
 * GET numa fonte oficial seguindo os redirecionamentos à mão: cada endereço (o inicial e cada Location) é conferido contra a
 * lista de sites oficiais ANTES de ser pedido, para o servidor nunca chegar a um endereço de fora (rede interna, metadados da
 * nuvem) por um redirecionamento. O `signal` do `init` vale para a cadeia toda (o prazo não reinicia a cada salto).
 */
export async function fetchOficial(
  url: string,
  init: RequestInit = {},
  maxRedirecionamentos = MAX_REDIRECIONAMENTOS,
): Promise<{ resp: Response; url: string }> {
  let atual = url;
  for (let saltos = 0; ; saltos++) {
    if (!urlOficialValida(atual)) {
      throw new BadRequestException(
        saltos === 0
          ? 'URL fora dos sites oficiais aceitos (gov.br, jus.br e leg.br, por https)'
          : 'A fonte oficial redirecionou para fora dos sites oficiais.',
      );
    }
    const resp = await fetch(atual, { ...init, redirect: 'manual' });
    const destino = resp.status >= 300 && resp.status < 400 ? resp.headers.get('location') : null;
    if (!destino) return { resp, url: atual };
    await resp.body?.cancel().catch(() => undefined);
    if (saltos >= maxRedirecionamentos) throw new BadRequestException('A fonte oficial redirecionou vezes demais.');
    try {
      atual = new URL(destino, atual).toString();
    } catch {
      throw new BadRequestException('A fonte oficial redirecionou para um endereço inválido.');
    }
  }
}
