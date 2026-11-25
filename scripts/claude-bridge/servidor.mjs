// Ponte entre o InTAX (contêiner) e o Claude Code instalado e logado na VPS (usa a assinatura, sem chave de API).
// Roda no servidor como o usuário "claude", escuta só no endereço do Docker (172.17.0.1) e exige o token no cabeçalho.
// Cada pedido abre um `claude -p` isolado numa pasta vazia, só com as ferramentas de pesquisa na web (nunca Bash, leitura ou escrita).
import http from 'node:http';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';

const PORTA = Number(process.env.PORTA || 3910);
const ENDERECO = process.env.ENDERECO || '172.17.0.1';
const TOKEN = process.env.CLAUDE_BRIDGE_TOKEN || '';
const CLAUDE = process.env.CLAUDE_BIN || '/home/claude/.local/bin/claude';
const PASTA = process.env.PASTA_TRABALHO || '/home/claude/assistente-intax';
const MODELO_PADRAO = process.env.CLAUDE_BRIDGE_MODELO || '';
const MAX_SIMULTANEOS = Number(process.env.MAX_SIMULTANEOS || 2);
const MAX_FILA = 6;
const LIMITE_CORPO = 400_000;

if (TOKEN.length < 24) { console.error('CLAUDE_BRIDGE_TOKEN ausente ou curto demais'); process.exit(1); }

let ativos = 0;
const fila = [];
const liberar = () => { ativos--; const prox = fila.shift(); if (prox) prox(); };
const esperarVez = () => new Promise((ok, erro) => {
  if (ativos < MAX_SIMULTANEOS) { ativos++; return ok(); }
  if (fila.length >= MAX_FILA) return erro(new Error('Fila cheia'));
  fila.push(() => { ativos++; ok(); });
});

const tokenValido = (recebido) => {
  const a = Buffer.from(String(recebido || '')), b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Endereços https citados nas ferramentas de pesquisa (resultados e páginas abertas), sem repetir. */
function coletarFontes(eventos) {
  const vistos = new Set(); const fontes = [];
  const add = (uri, title) => {
    const u = String(uri || '').replace(/[)\].,;]+$/, '');
    if (!/^https:\/\//i.test(u) || vistos.has(u)) return;
    vistos.add(u); fontes.push({ uri: u, title: String(title || '').slice(0, 160) });
  };
  const varrer = (valor) => {
    if (typeof valor === 'string') { for (const m of valor.matchAll(/https:\/\/[^\s"<>\\]+/g)) add(m[0]); return; }
    if (Array.isArray(valor)) { valor.forEach(varrer); return; }
    if (valor && typeof valor === 'object') {
      if (typeof valor.url === 'string') add(valor.url, valor.title);
      Object.values(valor).forEach(varrer);
    }
  };
  for (const ev of eventos) {
    const conteudo = ev?.message?.content;
    if (!Array.isArray(conteudo)) continue;
    for (const bloco of conteudo) {
      if (ev.type === 'user' && bloco?.type === 'tool_result') varrer(bloco.content);
      if (ev.type === 'assistant' && bloco?.type === 'tool_use' && /^Web/i.test(bloco.name || '')) varrer(bloco.input);
    }
  }
  return fontes;
}

function executar({ prompt, busca, modelo, timeoutMs }) {
  return new Promise((ok, erro) => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--disable-slash-commands'];
    if (busca) args.push('--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch', 'WebFetch');
    else args.push('--tools', '');
    const m = modelo || MODELO_PADRAO;
    if (m) args.push('--model', m);
    const filho = spawn(CLAUDE, args, { cwd: PASTA, env: { ...process.env, HOME: process.env.HOME || '/home/claude', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let saida = ''; let err = '';
    const relogio = setTimeout(() => { filho.kill('SIGKILL'); erro(new Error('Tempo esgotado')); }, timeoutMs);
    filho.stdout.on('data', (d) => { saida += d; if (saida.length > 6_000_000) filho.kill('SIGKILL'); });
    filho.stderr.on('data', (d) => { err += d; });
    filho.on('error', (e) => { clearTimeout(relogio); erro(e); });
    filho.on('close', () => {
      clearTimeout(relogio);
      const eventos = saida.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const fim = [...eventos].reverse().find((e) => e.type === 'result');
      if (!fim) return erro(new Error(`Claude Code sem resultado${err ? `: ${err.slice(0, 200)}` : ''}`));
      if (fim.is_error) return erro(new Error(String(fim.result || 'erro').slice(0, 300)));
      const inicio = eventos.find((e) => e.type === 'system' && e.model);
      ok({ texto: String(fim.result || '').trim(), fontes: busca ? coletarFontes(eventos) : [], modelo: inicio?.model || m || 'claude-code' });
    });
    filho.stdin.end(prompt);
  });
}

// Mantém o login vivo: o Claude Code renova o acesso sozinho enquanto é usado, então um pedido mínimo a cada 6 horas evita que a
// sessão fique parada até expirar. O resultado aparece em /saude (e na tela de Integrações do InTAX).
const INTERVALO_PING_MS = 6 * 60 * 60 * 1000;
const estadoLogin = { logado: null, verificado_em: null, erro: null };
async function conferirLogin(motivo) {
  try {
    await esperarVez();
    try {
      await executar({ prompt: 'Responda apenas OK.', busca: false, modelo: '', timeoutMs: 60_000 });
      Object.assign(estadoLogin, { logado: true, verificado_em: new Date().toISOString(), erro: null });
    } finally { liberar(); }
  } catch (e) {
    const msg = String(e.message || e);
    // Falha de login derruba o aviso; falha de fila ou de tempo não conta como deslogado.
    if (/log ?in|auth|expired|sess[aã]o|OAuth/i.test(msg)) Object.assign(estadoLogin, { logado: false, verificado_em: new Date().toISOString(), erro: msg.slice(0, 200) });
    console.error(`[login] ${motivo}: ${msg}`);
  }
}
setTimeout(() => conferirLogin('inicio'), 5_000);
setInterval(() => conferirLogin('periodico'), INTERVALO_PING_MS).unref?.();

const responder = (res, codigo, corpo) => { res.writeHead(codigo, { 'content-type': 'application/json' }); res.end(JSON.stringify(corpo)); };

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/saude') return responder(res, 200, { ok: true, ...estadoLogin });
  if (req.method !== 'POST' || req.url !== '/perguntar') return responder(res, 404, { erro: 'não encontrado' });
  if (!tokenValido(req.headers['x-token'])) return responder(res, 401, { erro: 'não autorizado' });
  let corpo = '';
  for await (const parte of req) { corpo += parte; if (corpo.length > LIMITE_CORPO) return responder(res, 413, { erro: 'pedido grande demais' }); }
  let dados; try { dados = JSON.parse(corpo); } catch { return responder(res, 400, { erro: 'JSON inválido' }); }
  const prompt = String(dados.prompt || '');
  if (!prompt.trim()) return responder(res, 400, { erro: 'prompt vazio' });
  const modelo = /^[a-z0-9.\-]{1,60}$/i.test(String(dados.modelo || '')) ? String(dados.modelo) : '';
  const timeoutMs = Math.min(Math.max(Number(dados.timeout_ms) || 120_000, 5_000), 175_000);
  try { await esperarVez(); } catch (e) { return responder(res, 503, { erro: e.message }); }
  try { const r = await executar({ prompt, busca: dados.busca === true, modelo, timeoutMs }); Object.assign(estadoLogin, { logado: true, verificado_em: new Date().toISOString(), erro: null }); responder(res, 200, r); }
  catch (e) {
    if (/log ?in|auth|expired|OAuth/i.test(String(e.message))) Object.assign(estadoLogin, { logado: false, verificado_em: new Date().toISOString(), erro: String(e.message).slice(0, 200) });
    responder(res, 502, { erro: e.message });
  }
  finally { liberar(); }
}).listen(PORTA, ENDERECO, () => console.log(`Ponte do Claude Code em ${ENDERECO}:${PORTA}`));
