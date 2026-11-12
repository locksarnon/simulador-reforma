import { request } from 'https';

/**
 * Cliente HTTP do Integra Contador (Serpro). Três modos:
 * - DESLIGADO: nada é chamado;
 * - DEMONSTRACAO: o ambiente "trial" oficial, com a chave pública da documentação e dados fictícios (mock) do Serpro;
 * - PRODUCAO: contrato do escritório (Consumer Key/Secret + e-CNPJ), token pelo SAPI com o certificado (mTLS).
 * Fontes: https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/quick_start/ e .../chamadas/demonstracao/
 */
export type Modo = 'DESLIGADO' | 'DEMONSTRACAO' | 'PRODUCAO';
export const MODOS: Modo[] = ['DESLIGADO', 'DEMONSTRACAO', 'PRODUCAO'];

export const URL_PRODUCAO = 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/';
export const URL_DEMONSTRACAO = 'https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1/';
export const URL_AUTENTICACAO = 'https://autenticacao.sapi.serpro.gov.br/authenticate';
/** Chave pública do ambiente de demonstração, publicada na documentação oficial (api-integra-contador-trial-sp.yaml). */
export const CHAVE_DEMONSTRACAO = '06aef429-a981-3ec5-a1f8-71d38d86481e';

/** tipo: 1 CPF, 2 CNPJ, 3 lista de CPFs e 4 lista de CNPJs (eventos de atualização, em lote). */
export type Identificacao = { numero: string; tipo: 1 | 2 | 3 | 4 };
export type Pedido = {
  endpoint: 'Apoiar' | 'Consultar' | 'Declarar' | 'Emitir' | 'Monitorar';
  contratante: Identificacao;
  autorPedidoDados: Identificacao;
  contribuinte: Identificacao;
  idSistema: string;
  idServico: string;
  versaoSistema: string;
  dados: string;
  tokenProcurador?: string | null;
};
/** `etag`: o SITFIS 2.0 manda o protocolo (304) e o tempo de espera (204) no cabeçalho ETag. */
export type Resposta = { http: number; status: number | null; dados: unknown; mensagens: { codigo: string; texto: string }[]; bruto: string; etag?: string };

export class ErroIntegra extends Error {
  constructor(message: string, readonly codigo: 'DESLIGADO' | 'SEM_CONTRATO' | 'AUTENTICACAO' | 'LIMITE' | 'COMUNICACAO' | 'TEMPO') {
    super(message);
  }
}

export type Credenciais = { consumerKey: string; consumerSecret: string; pfx: Buffer; senha: string };
type TokenSapi = { access: string; jwt: string; expira: number };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O campo "dados" vem como texto JSON escapado; quando não é JSON (ex.: um texto curto), fica como veio. */
export function lerDados(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  const t = v.trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return v; }
}

/** Lê a resposta do gateway (o Serpro às vezes manda as chaves com maiúscula: "Numero", "Tipo"). */
export function lerResposta(http: number, texto: string): Resposta {
  let corpo: Record<string, unknown> = {};
  try { corpo = JSON.parse(texto); } catch { /* corpo não é JSON: fica vazio */ }
  const mensagens = Array.isArray(corpo.mensagens) ? (corpo.mensagens as { codigo?: string; texto?: string }[]).map((m) => ({ codigo: String(m?.codigo ?? ''), texto: String(m?.texto ?? '') })) : [];
  if (!mensagens.length && typeof corpo.message === 'string') mensagens.push({ codigo: String(corpo.code ?? http), texto: String(corpo.message) });
  const st = Number(corpo.status);
  return { http, status: corpo.status !== undefined && corpo.status !== null && Number.isFinite(st) ? st : null, dados: lerDados(corpo.dados), mensagens, bruto: texto };
}

/** Token do SAPI: POST com Basic (key:secret), role-type TERCEIROS e o e-CNPJ do contratante no TLS. */
export function pedirTokenSapi(c: Credenciais): Promise<TokenSapi> {
  // O SAPI não aceita corpo "em pedaços" (Transfer-Encoding: chunked): fica parado ~30 s e não responde. Conferido em 12/11/2026
  // de dentro do servidor: com Content-Length responde em 0,07 s. Por isso o tamanho vai sempre informado.
  const corpoPedido = 'grant_type=client_credentials';
  return new Promise((resolve, reject) => {
    const req = request(URL_AUTENTICACAO, {
      method: 'POST', pfx: c.pfx, passphrase: c.senha, timeout: 30_000,
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64')}`,
        'Role-Type': 'TERCEIROS', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpoPedido),
      },
    }, (res) => {
      let corpo = '';
      res.on('data', (d) => (corpo += d));
      res.on('end', () => {
        try {
          const j = JSON.parse(corpo);
          if (res.statusCode !== 200 || !j.access_token) return reject(new ErroIntegra(`O Serpro recusou a autenticação (${res.statusCode}). Confira a Consumer Key/Secret e o certificado do escritório.`, 'AUTENTICACAO'));
          resolve({ access: j.access_token, jwt: j.jwt_token, expira: Date.now() + (Number(j.expires_in) || 1800) * 1000 - 60_000 });
        } catch {
          reject(new ErroIntegra(`Resposta inesperada da autenticação do Serpro (${res.statusCode}).`, 'AUTENTICACAO'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new ErroIntegra('A autenticação do Serpro não respondeu a tempo.', 'TEMPO')));
    req.on('error', (e) => reject(e instanceof ErroIntegra ? e : new ErroIntegra(`Falha de comunicação com a autenticação do Serpro: ${e.message}`, 'COMUNICACAO')));
    req.end(corpoPedido);
  });
}

/**
 * Faz a chamada. No limite de requisições (429) espera e tenta de novo; em produção, um 401 renova o token uma vez.
 * `fetchImpl` e `token` existem para os testes.
 */
export class IntegraCliente {
  private token: TokenSapi | null = null;

  constructor(
    private readonly modo: () => Modo,
    private readonly credenciais: () => Credenciais | null,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly obterToken: (c: Credenciais) => Promise<TokenSapi> = pedirTokenSapi,
    private readonly pausa: (ms: number) => Promise<unknown> = espera,
  ) {}

  private async cabecalhos(renovar = false): Promise<Record<string, string>> {
    const modo = this.modo();
    if (modo === 'DEMONSTRACAO') return { Authorization: `Bearer ${CHAVE_DEMONSTRACAO}` };
    const c = this.credenciais();
    if (!c) throw new ErroIntegra('Falta o contrato do Integra Contador no servidor (Consumer Key/Secret e certificado do escritório).', 'SEM_CONTRATO');
    if (renovar || !this.token || this.token.expira < Date.now()) this.token = await this.obterToken(c);
    return { Authorization: `Bearer ${this.token.access}`, jwt_token: this.token.jwt };
  }

  async chamar(p: Pedido): Promise<Resposta> {
    const modo = this.modo();
    if (modo === 'DESLIGADO') throw new ErroIntegra('O monitoramento está desligado. Ligue em Administração > Integrações.', 'DESLIGADO');
    const base = modo === 'PRODUCAO' ? URL_PRODUCAO : URL_DEMONSTRACAO;
    const corpo = JSON.stringify({
      contratante: p.contratante, autorPedidoDados: p.autorPedidoDados, contribuinte: p.contribuinte,
      pedidoDados: { idSistema: p.idSistema, idServico: p.idServico, versaoSistema: p.versaoSistema, dados: p.dados },
    });
    let renovado = false;
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      const cab: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', ...(await this.cabecalhos(false)) };
      if (p.tokenProcurador && modo === 'PRODUCAO') cab.autenticar_procurador_token = p.tokenProcurador;
      let res: Response;
      try {
        res = await this.fetchImpl(base + p.endpoint, { method: 'POST', headers: cab, body: corpo, signal: AbortSignal.timeout(90_000) });
      } catch (e) {
        const nome = (e as Error)?.name;
        throw new ErroIntegra(nome === 'TimeoutError' || nome === 'AbortError' ? 'O Serpro não respondeu em 90 segundos.' : `Falha de comunicação com o Serpro: ${(e as Error).message}`, nome === 'TimeoutError' ? 'TEMPO' : 'COMUNICACAO');
      }
      const texto = await res.text();
      if (res.status === 429) { await this.pausa(2000 * 2 ** tentativa); continue; }
      if (res.status === 401 && modo === 'PRODUCAO' && !renovado) { renovado = true; await this.cabecalhos(true); continue; }
      const etag = res.headers?.get?.('etag') ?? undefined;
      return { ...lerResposta(res.status, texto), ...(etag ? { etag } : {}) };
    }
    throw new ErroIntegra('O Serpro limitou as consultas agora (muitas em pouco tempo). Tente de novo em alguns minutos.', 'LIMITE');
  }
}
