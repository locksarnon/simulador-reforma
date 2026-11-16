/**
 * Teste das chaves dos produtos Consulta CND e Consulta Dívida Ativa (gateway da API Serpro), sem custo:
 * 1) pede o token com as chaves do produto (401/400 = chaves recusadas);
 * 2) faz uma chamada propositalmente inválida (documento "0"): com acesso, o Serpro responde 400 (não bilhetado, segundo a
 *    documentação dos códigos de retorno); sem acesso ao produto, o gateway responde 401/403 antes de chegar à API.
 */
export const GATEWAY_SERPRO = 'https://gateway.apiserpro.serpro.gov.br';
export type ProdutoSerpro = 'cnd' | 'dividaAtiva' | 'nfe';
export const NOME_PRODUTO: Record<ProdutoSerpro, string> = { cnd: 'Consulta CND', dividaAtiva: 'Consulta Dívida Ativa', nfe: 'Consulta NF-e' };

export type TesteProduto = { produto: ProdutoSerpro; nome: string; ok: boolean; mensagem: string };

export async function testarProdutoSerpro(produto: ProdutoSerpro, chaves: { key: string; secret: string } | null, f: typeof fetch = fetch): Promise<TesteProduto> {
  const nome = NOME_PRODUTO[produto];
  if (!chaves) return { produto, nome, ok: false, mensagem: `${nome}: sem chaves cadastradas.` };
  try {
    const t = await f(`${GATEWAY_SERPRO}/token`, {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${chaves.key}:${chaves.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials', signal: AbortSignal.timeout(20_000),
    });
    if (!t.ok) return { produto, nome, ok: false, mensagem: `${nome}: o Serpro recusou as chaves (HTTP ${t.status}). Confira a Consumer Key e o Consumer Secret deste produto na Área do Cliente do Serpro.` };
    const { access_token } = (await t.json()) as { access_token: string };
    const h = { Authorization: `Bearer ${access_token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
    // NF-e: chave inválida ("0") volta 400, que o Serpro não cobra (códigos de retorno da Consulta NF-e).
    let r = produto === 'nfe' ? await f(`${GATEWAY_SERPRO}/nfe/1/0`, { headers: h, signal: AbortSignal.timeout(30_000) })
      : produto === 'cnd'
      ? await f(`${GATEWAY_SERPRO}/consulta-cnd/v1/certidao`, { method: 'POST', headers: h, body: JSON.stringify({ TipoContribuinte: 1, ContribuinteConsulta: '0', CodigoIdentificacao: '9001' }), signal: AbortSignal.timeout(30_000) })
      : await f(`${GATEWAY_SERPRO}/consulta-divida-ativa/api/v1/devedor/0`, { headers: h, signal: AbortSignal.timeout(30_000) });
    // Dívida Ativa: o swagger oficial tem também o endereço consulta-divida-ativa-df; o contrato libera um deles.
    if (produto === 'dividaAtiva' && r.status === 403) r = await f(`${GATEWAY_SERPRO}/consulta-divida-ativa-df/api/v1/devedor/0`, { headers: h, signal: AbortSignal.timeout(30_000) });
    if (r.status === 401 || r.status === 403) return { produto, nome, ok: false, mensagem: `${nome}: as chaves geram token, mas não têm acesso a este produto (HTTP ${r.status}). São de outro produto ou o produto não está ativo no contrato.` };
    if (r.status >= 500) return { produto, nome, ok: false, mensagem: `${nome}: chaves aceitas; a API do produto não respondeu agora (HTTP ${r.status}).` };
    return { produto, nome, ok: true, mensagem: `${nome}: chaves aceitas e com acesso ao produto.` };
  } catch (e) {
    return { produto, nome, ok: false, mensagem: `${nome}: sem resposta do Serpro (${(e as Error).message}).` };
  }
}
