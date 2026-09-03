import { Injectable, NotFoundException, BadGatewayException, BadRequestException } from '@nestjs/common';

/**
 * Consulta pública de CNPJ via BrasilAPI (dados oficiais da Receita
 * Federal, sem necessidade de chave de API). Chamada feita no backend
 * para evitar CORS no navegador e manter o mesmo padrão de fetch
 * server-side já usado em noticias.service.ts.
 *
 * BrasilAPI devolve 403 sem um User-Agent "de navegador" — confirmado
 * testando direto no container (a requisição sem header apanha do
 * bloqueio anti-bot deles).
 */
@Injectable()
export class CnpjService {
  async consultar(cnpj: string) {
    const digits = String(cnpj || '').replace(/\D/g, '');
    if (digits.length !== 14) {
      throw new BadRequestException('CNPJ deve ter 14 dígitos.');
    }

    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SimuladorFAL/1.0)' },
    });
    if (resp.status === 404) {
      throw new NotFoundException('CNPJ não encontrado na Receita Federal.');
    }
    if (resp.status >= 400 && resp.status < 500) {
      // BrasilAPI devolve 400 com uma mensagem própria pra CNPJ com dígito
      // verificador inválido — repassa em vez de um "falha genérica".
      const body = await resp.json().catch(() => null);
      throw new BadRequestException(body?.message || 'CNPJ inválido.');
    }
    if (!resp.ok) {
      throw new BadGatewayException('Falha ao consultar a BrasilAPI.');
    }
    const data = await resp.json();

    return {
      razao_social: data.razao_social || '',
      nome_fantasia: data.nome_fantasia || '',
      uf: data.uf || '',
      municipio: data.municipio || '',
      cnae_descricao: data.cnae_fiscal_descricao || '',
      situacao: data.descricao_situacao_cadastral || '',
    };
  }
}
