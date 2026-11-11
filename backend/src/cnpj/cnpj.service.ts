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
      // Campos a mais (Painel da carteira e Pré-análise por CNPJ); os de cima continuam iguais para quem já usa.
      cnpj: digits,
      cnae_codigo: data.cnae_fiscal ? String(data.cnae_fiscal).padStart(7, '0') : '',
      cnaes_secundarios: Array.isArray(data.cnaes_secundarios)
        ? data.cnaes_secundarios.filter((c: { codigo?: number }) => c?.codigo).map((c: { codigo: number; descricao?: string }) => ({ codigo: String(c.codigo).padStart(7, '0'), descricao: c.descricao || '' }))
        : [],
      porte: data.porte || '',
      natureza_juridica: data.natureza_juridica || '',
      codigo_municipio_ibge: data.codigo_municipio_ibge ? String(data.codigo_municipio_ibge) : '',
      opcao_pelo_simples: data.opcao_pelo_simples ?? null,
      opcao_pelo_mei: data.opcao_pelo_mei ?? null,
      data_inicio_atividade: data.data_inicio_atividade || '',
      capital_social: typeof data.capital_social === 'number' ? data.capital_social : null,
      matriz_filial: data.descricao_identificador_matriz_filial || '',
      socios: Array.isArray(data.qsa) ? data.qsa.map((s: { nome_socio?: string; qualificacao_socio?: string }) => ({ nome: s.nome_socio || '', qualificacao: s.qualificacao_socio || '' })) : [],
    };
  }

  /** Centro geográfico do município (malha do IBGE), para o mapa da carteira; null se o IBGE não responder. */
  async centroideDoMunicipio(codigoIbge: string): Promise<{ latitude: number; longitude: number } | null> {
    if (!/^\d{7}$/.test(codigoIbge)) return null;
    try {
      const resp = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigoIbge}/metadados`);
      if (!resp.ok) return null;
      const [m] = (await resp.json()) as { centroide?: { latitude: number; longitude: number } }[];
      return m?.centroide ? { latitude: m.centroide.latitude, longitude: m.centroide.longitude } : null;
    } catch {
      return null;
    }
  }
}
