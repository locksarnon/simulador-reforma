import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/**
 * O nodemailer é dublê: o que estes testes provam é COM QUE CREDENCIAL o
 * transporter é montado (senha x XOAUTH2) e QUANTAS vezes o token é pedido.
 * Nada aqui toca o Microsoft 365 de verdade — a validação contra o 365 real
 * é manual, no servidor.
 */
const { createTransport, sendMail } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => {
  const api = { createTransport };
  return { ...api, default: api };
});

import { MailService } from './mail.service';

const SEGREDO = 'segredo-do-aplicativo-nao-pode-vazar';

const AMBIENTE_BASE: Record<string, string> = {
  SMTP_HOST: 'smtp.office365.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'caixa@falagro.com.br',
  SMTP_PASS: 'senha-da-caixa-nao-pode-vazar',
  MAIL_FROM: 'InTAX <caixa@falagro.com.br>',
};

const AMBIENTE_TOKEN: Record<string, string> = {
  MS_TENANT_ID: 'tenant-1',
  MS_CLIENT_ID: 'client-1',
  MS_CLIENT_SECRET: SEGREDO,
};

const config = (env: Record<string, string>) =>
  ({ get: (chave: string) => env[chave] }) as unknown as ConfigService;

const servico = (env: Record<string, string>) => new MailService(config(env));

const msg = { to: 'destino@exemplo.com', subject: 'Assunto', html: '<p>corpo</p>' };

/** Resposta de sucesso do endpoint de token da Microsoft. */
const respostaToken = (access_token: string, expires_in = 3600) => ({
  ok: true,
  status: 200,
  json: async () => ({ access_token, expires_in, token_type: 'Bearer' }),
  text: async () => '',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const opcoesTransporte = (chamada = 0) => createTransport.mock.calls[chamada][0] as any;

/**
 * Avança só as microtasks até a condição valer. Não usa timers: a corrida
 * que precisamos montar é entre promessas, e timer falso atrapalharia.
 */
const esperarAte = async (condicao: () => boolean, rotulo: string) => {
  for (let i = 0; i < 200 && !condicao(); i++) await Promise.resolve();
  if (!condicao()) throw new Error(`condição nunca foi alcançada: ${rotulo}`);
};

let fetchMock: ReturnType<typeof vi.fn>;
let logs: string[];
/** Mesmas linhas de `logs`, com o nível em que cada uma foi emitida. */
let registros: { nivel: string; msg: string }[];

beforeEach(() => {
  createTransport.mockReset().mockReturnValue({ sendMail });
  sendMail.mockReset().mockResolvedValue({ messageId: 'ok' });

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  logs = [];
  registros = [];
  // Aridade variádica: as assinaturas do Logger do Nest aceitam contexto e
  // parâmetros extras, e um dublê de 1 argumento não casa com elas.
  const capturar = (nivel: string) => (msgLog: unknown, ...resto: unknown[]) => {
    void resto;
    logs.push(String(msgLog));
    registros.push({ nivel, msg: String(msgLog) });
  };
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(capturar('warn'));
  vi.spyOn(Logger.prototype, 'log').mockImplementation(capturar('log'));
  vi.spyOn(Logger.prototype, 'error').mockImplementation(capturar('error'));
  vi.spyOn(Logger.prototype, 'debug').mockImplementation(capturar('debug'));
  vi.spyOn(Logger.prototype, 'verbose').mockImplementation(capturar('verbose'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('MailService — escolha do modo de autenticação', () => {
  it('com as três variáveis MS_*, autentica a caixa por token XOAUTH2 e não usa a senha', async () => {
    fetchMock.mockResolvedValue(respostaToken('token-abc'));
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    expect(mail.configurado).toBe(true);
    await expect(mail.enviar(msg)).resolves.toEqual({ enviado: true });

    const auth = opcoesTransporte().auth;
    expect(auth).toEqual({ type: 'OAuth2', user: 'caixa@falagro.com.br', accessToken: 'token-abc' });
    expect(auth.pass).toBeUndefined();
    expect(JSON.stringify(opcoesTransporte())).not.toContain(AMBIENTE_BASE.SMTP_PASS);
  });

  it('sem nenhuma variável MS_*, mantém usuário/senha e não pede token nenhum', async () => {
    const mail = servico({ ...AMBIENTE_BASE });

    expect(mail.configurado).toBe(true);
    await expect(mail.enviar(msg)).resolves.toEqual({ enviado: true });

    expect(opcoesTransporte().auth).toEqual({
      user: 'caixa@falagro.com.br',
      pass: AMBIENTE_BASE.SMTP_PASS,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Configuração parcial é erro de configuração: não pode "meio ligar" o modo token.
  for (const ausente of ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET'] as const) {
    it(`com ${ausente} vazia e as outras duas preenchidas, continua em usuário/senha e avisa qual falta`, async () => {
      const parcial = { ...AMBIENTE_TOKEN };
      delete (parcial as Record<string, string>)[ausente];
      const mail = servico({ ...AMBIENTE_BASE, ...parcial });

      await expect(mail.enviar(msg)).resolves.toEqual({ enviado: true });

      expect(opcoesTransporte().auth).toEqual({
        user: 'caixa@falagro.com.br',
        pass: AMBIENTE_BASE.SMTP_PASS,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(logs.some((l) => l.includes(ausente))).toBe(true);
    });
  }

  it('com duas das três preenchidas, o aviso nomeia a única que falta e não as demais', () => {
    servico({ ...AMBIENTE_BASE, MS_TENANT_ID: 'tenant-1', MS_CLIENT_ID: 'client-1' });

    const aviso = logs.find((l) => l.includes('incompleta'));
    expect(aviso).toBeDefined();
    expect(aviso).toContain('MS_CLIENT_SECRET');
    expect(aviso).not.toContain('MS_TENANT_ID');
    expect(aviso).not.toContain('MS_CLIENT_ID');
  });

  it('com as três preenchidas, nenhum aviso de configuração incompleta é emitido', () => {
    servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });
    expect(logs.some((l) => l.includes('incompleta'))).toBe(false);
  });

  it('SMTP_HOST vazio continua desligado mesmo com as três variáveis MS_* preenchidas', async () => {
    const mail = servico({ ...AMBIENTE_BASE, SMTP_HOST: '', ...AMBIENTE_TOKEN });

    expect(mail.configurado).toBe(false);
    await expect(mail.enviar(msg)).resolves.toEqual({ enviado: false, motivo: 'SMTP não configurado' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('SMTP_HOST vazio e sem MS_* continua desligado, como antes', async () => {
    const mail = servico({ ...AMBIENTE_BASE, SMTP_HOST: '' });
    expect(mail.configurado).toBe(false);
    await expect(mail.enviar(msg)).resolves.toEqual({ enviado: false, motivo: 'SMTP não configurado' });
  });

  it('host, porta e TLS do ambiente valem igual nos dois modos', async () => {
    const ambiente = { ...AMBIENTE_BASE, SMTP_HOST: 'smtp.exemplo.com', SMTP_PORT: '465', SMTP_SECURE: 'true' };

    servico(ambiente);
    const porSenha = opcoesTransporte();

    fetchMock.mockResolvedValue(respostaToken('token-abc'));
    createTransport.mockClear();
    await servico({ ...ambiente, ...AMBIENTE_TOKEN }).enviar(msg);
    const porToken = opcoesTransporte();

    for (const opcoes of [porSenha, porToken]) {
      expect(opcoes.host).toBe('smtp.exemplo.com');
      expect(opcoes.port).toBe(465);
      expect(opcoes.secure).toBe(true);
    }
  });
});

describe('MailService — o log de boot diz em que modo o envio subiu', () => {
  // Sem estas linhas, a única forma de saber se o modo token pegou no
  // servidor é esperar um envio falhar — e captação de lead é melhor
  // esforço, não mostra erro na tela de ninguém.
  const boot = () => registros.filter((r) => r.msg.startsWith('Envio de e-mail') || r.msg.startsWith('Autenticação'));

  it('modo desligado anuncia o estado e o que deixa de acontecer, em nível informativo', () => {
    servico({ ...AMBIENTE_BASE, SMTP_HOST: '' });

    const linha = boot().find((r) => r.msg.includes('desligado'));
    expect(linha).toBeDefined();
    expect(linha!.nivel).toBe('log');
    expect(linha!.msg).toContain('SMTP_HOST');
    expect(linha!.msg).toContain('nenhuma mensagem sai');
  });

  it('modo usuário/senha anuncia o estado e a caixa, em nível informativo', () => {
    servico({ ...AMBIENTE_BASE });

    const linha = boot().find((r) => r.msg.includes('usuário e senha'));
    expect(linha).toBeDefined();
    expect(linha!.nivel).toBe('log');
    expect(linha!.msg).toContain('caixa@falagro.com.br');
  });

  it('modo usuário/senha sem SMTP_USER anuncia que o envio vai sem autenticação', () => {
    servico({ ...AMBIENTE_BASE, SMTP_USER: '' });

    const linha = boot().find((r) => r.msg.includes('sem autenticação'));
    expect(linha).toBeDefined();
    expect(linha!.nivel).toBe('log');
    expect(linha!.msg).toContain('SMTP_USER');
  });

  it('modo token anuncia o estado e a caixa, em nível informativo', () => {
    servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    const linha = boot().find((r) => r.msg.includes('token do Microsoft 365 ligada'));
    expect(linha).toBeDefined();
    expect(linha!.nivel).toBe('log');
    expect(linha!.msg).toContain('caixa@falagro.com.br');
  });

  // O achado era este: desligado e senha não emitiam NADA no boot.
  it('nenhum modo sobe calado: os três anunciam o estado no boot', () => {
    const cenarios: [string, Record<string, string>][] = [
      ['desligado', { ...AMBIENTE_BASE, SMTP_HOST: '' }],
      ['senha', { ...AMBIENTE_BASE }],
      ['token', { ...AMBIENTE_BASE, ...AMBIENTE_TOKEN }],
    ];

    for (const [nome, ambiente] of cenarios) {
      registros = [];
      servico(ambiente);
      expect(boot().filter((r) => r.nivel === 'log'), `modo ${nome} subiu sem anunciar o estado`).toHaveLength(1);
    }
  });

  it('estado normal não vira aviso nem erro: desligado e senha sobem sem warn/error', () => {
    for (const ambiente of [{ ...AMBIENTE_BASE, SMTP_HOST: '' }, { ...AMBIENTE_BASE }]) {
      registros = [];
      servico(ambiente);
      expect(registros.filter((r) => r.nivel === 'warn' || r.nivel === 'error')).toEqual([]);
    }
  });

  it('nenhuma linha de boot carrega senha nem segredo do aplicativo', () => {
    for (const ambiente of [
      { ...AMBIENTE_BASE, SMTP_HOST: '' },
      { ...AMBIENTE_BASE },
      { ...AMBIENTE_BASE, ...AMBIENTE_TOKEN },
      { ...AMBIENTE_BASE, MS_TENANT_ID: 'tenant-1' },
    ]) {
      registros = [];
      servico(ambiente);
      const tudo = registros.map((r) => r.msg).join('\n');
      expect(tudo).not.toContain(AMBIENTE_BASE.SMTP_PASS);
      expect(tudo).not.toContain(SEGREDO);
    }
  });
});

describe('MailService — pedido do token ao Microsoft 365', () => {
  it('pede client_credentials no escopo do SMTP, no tenant configurado', async () => {
    fetchMock.mockResolvedValue(respostaToken('token-abc'));
    await servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN }).enviar(msg);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const corpo = new URLSearchParams(String(init.body));
    expect(corpo.get('grant_type')).toBe('client_credentials');
    expect(corpo.get('scope')).toBe('https://outlook.office365.com/.default');
    expect(corpo.get('client_id')).toBe('client-1');
    expect(corpo.get('client_secret')).toBe(SEGREDO);
  });
});

describe('MailService — cache do token', () => {
  it('um disparo inteiro de newsletter reusa o mesmo token: 3 envios, 1 busca', async () => {
    fetchMock.mockResolvedValue(respostaToken('token-abc'));
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    for (let i = 0; i < 3; i++) await mail.enviar({ ...msg, to: `destino${i}@exemplo.com` });

    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  it('renova o token quando a validade acaba, e o envio seguinte usa o token novo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));

    fetchMock
      .mockResolvedValueOnce(respostaToken('token-1', 3600))
      .mockResolvedValueOnce(respostaToken('token-2', 3600));
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    await mail.enviar(msg);
    expect(opcoesTransporte(0).auth.accessToken).toBe('token-1');

    // 3600s de validade, 300s de margem: ainda dentro da janela aos 3200s.
    vi.setSystemTime(new Date('2026-09-25T10:53:20Z'));
    await mail.enviar(msg);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Passada a margem, o token é trocado e o transporter refeito com o novo.
    vi.setSystemTime(new Date('2026-09-25T10:56:00Z'));
    await mail.enviar(msg);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(opcoesTransporte(1).auth.accessToken).toBe('token-2');
  });

  it('respeita o expires_in curto devolvido pela Microsoft: margem é metade da validade', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));

    fetchMock.mockResolvedValue(respostaToken('token-curto', 60));
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    await mail.enviar(msg);
    vi.setSystemTime(new Date('2026-09-25T10:00:29Z'));
    await mail.enviar(msg);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-25T10:00:31Z'));
    await mail.enviar(msg);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('envios simultâneos disparam uma única busca de token', async () => {
    let liberar!: (v: unknown) => void;
    const espera = new Promise((resolve) => {
      liberar = resolve;
    });
    fetchMock.mockImplementation(async () => {
      await espera;
      return respostaToken('token-abc');
    });

    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });
    const emVoo = [mail.enviar(msg), mail.enviar(msg), mail.enviar(msg)];

    liberar(null);
    const resultados = await Promise.all(emVoo);

    expect(resultados).toEqual([{ enviado: true }, { enviado: true }, { enviado: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('MailService — corrida entre envio em voo e rotação do token', () => {
  // Regressão: o redator lia this.tokenCache no momento do catch. Com um
  // envio pendurado no SMTP enquanto outra chamada rotaciona o cache, ele
  // apagava o token NOVO e deixava vazar o token velho — o que de fato
  // falhou. O motivo não é só log: newsletter.enviarTeste o joga num
  // BadRequestException que chega à tela do operador.
  it('token rotacionado enquanto o envio está em voo não vaza no motivo nem no log', async () => {
    let agora = 1_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => agora);

    fetchMock
      .mockResolvedValueOnce(respostaToken('token-A-em-voo-0001', 3600))
      .mockResolvedValueOnce(respostaToken('token-B-rotacionado-2', 3600));

    let rejeitarA!: (e: Error) => void;
    sendMail.mockReset();
    sendMail
      .mockImplementationOnce(
        () =>
          new Promise((_resolver, rejeitar) => {
            rejeitarA = rejeitar;
          }),
      )
      .mockResolvedValue({ messageId: 'ok' });

    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    // A pega token-A e fica pendurado no SMTP (rede lenta, timeout...).
    const envioA = mail.enviar({ ...msg, to: 'a@exemplo.com' });
    await esperarAte(() => sendMail.mock.calls.length === 1, 'envio A chegar ao sendMail');
    expect(opcoesTransporte(0).auth.accessToken).toBe('token-A-em-voo-0001');

    // Com A ainda em voo, token-A vence e um envio concorrente (lead entrando
    // durante a newsletter) rotaciona o cache para token-B.
    agora += 3_400_000;
    await mail.enviar({ ...msg, to: 'b@exemplo.com' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(opcoesTransporte(1).auth.accessToken).toBe('token-B-rotacionado-2');

    // Só agora o SMTP responde a A, citando a credencial que A usou.
    rejeitarA(new Error('535 5.7.3 Authentication unsuccessful: token-A-em-voo-0001'));
    const r = await envioA;

    expect(r.enviado).toBe(false);
    expect(r.motivo).not.toContain('token-A-em-voo-0001');
    expect(r.motivo).toContain('***');
    expect(logs.join('\n')).not.toContain('token-A-em-voo-0001');
  });

  it('o token vigente também não vaza quando é ele que falha, com outro já em cache', async () => {
    let agora = 1_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => agora);

    fetchMock
      .mockResolvedValueOnce(respostaToken('token-velho-000001', 3600))
      .mockResolvedValueOnce(respostaToken('token-novo-0000002', 3600));

    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });
    await mail.enviar(msg);

    agora += 3_400_000;
    sendMail.mockRejectedValue(new Error('535 5.7.3 Authentication unsuccessful: token-novo-0000002'));
    const r = await mail.enviar(msg);

    expect(r.enviado).toBe(false);
    expect(r.motivo).not.toContain('token-novo-0000002');
    expect(logs.join('\n')).not.toContain('token-novo-0000002');
  });
});

describe('MailService — falha e sigilo', () => {
  it('recusa da Microsoft devolve enviado:false sem lançar para o chamador', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
      json: async () => ({}),
    });
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    const r = await mail.enviar(msg);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toContain('401');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rede fora no pedido do token devolve enviado:false sem lançar', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND login.microsoftonline.com'));
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    await expect(mail.enviar(msg)).resolves.toEqual({
      enviado: false,
      motivo: 'getaddrinfo ENOTFOUND login.microsoftonline.com',
    });
  });

  it('falha de token não fica grudada: a tentativa seguinte pede o token de novo', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(respostaToken('token-abc'));
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    expect((await mail.enviar(msg)).enviado).toBe(false);
    expect((await mail.enviar(msg)).enviado).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('nem o segredo do aplicativo nem o token aparecem em log ou no motivo devolvido', async () => {
    // A Microsoft não devolve o segredo no erro, mas a guarda não depende disso.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => `AADSTS7000215: Invalid client secret provided: ${SEGREDO}`,
      json: async () => ({}),
    });
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    const r = await mail.enviar(msg);
    expect(r.motivo).not.toContain(SEGREDO);
    expect(r.motivo).toContain('***');
    expect(logs.join('\n')).not.toContain(SEGREDO);
  });

  it('o token emitido não aparece em log, nem quando o envio SMTP falha depois', async () => {
    fetchMock.mockResolvedValue(respostaToken('token-secretissimo-123'));
    sendMail.mockRejectedValue(new Error('535 5.7.3 Authentication unsuccessful token-secretissimo-123'));
    const mail = servico({ ...AMBIENTE_BASE, ...AMBIENTE_TOKEN });

    const r = await mail.enviar(msg);
    expect(r.enviado).toBe(false);
    expect(r.motivo).not.toContain('token-secretissimo-123');
    expect(logs.join('\n')).not.toContain('token-secretissimo-123');
  });
});
