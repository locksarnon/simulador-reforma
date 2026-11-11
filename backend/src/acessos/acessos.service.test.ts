import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AcessosService } from './acessos.service';
import { faixaValida, ipDoCliente, ipNaFaixa, normalizarIp } from './ip';

describe('endereços IP', () => {
  it('normaliza o IP que o servidor recebe (proxy, IPv4 dentro de IPv6, loopback)', () => {
    expect(normalizarIp('200.10.20.30, 10.0.0.1')).toBe('200.10.20.30');
    expect(normalizarIp('::ffff:200.10.20.30')).toBe('200.10.20.30');
    expect(normalizarIp('::1')).toBe('127.0.0.1');
    expect(normalizarIp('2001:DB8::1')).toBe('2001:db8::1');
    expect(normalizarIp(undefined)).toBe('');
  });

  it('o IP do cliente vem do x-forwarded-for quando o proxy o preenche', () => {
    expect(ipDoCliente({ headers: { 'x-forwarded-for': '200.1.1.1, 10.0.0.2' }, ip: '172.18.0.5' })).toBe('200.1.1.1');
    expect(ipDoCliente({ headers: {}, ip: '172.18.0.5' })).toBe('172.18.0.5');
  });

  it('valida a faixa: IPv4 com ou sem máscara, IPv6 literal sem máscara', () => {
    for (const ok of ['200.10.20.30', '200.10.20.0/24', '0.0.0.0/0', '2001:db8::1']) expect(faixaValida(ok), ok).toBe(true);
    for (const ruim of ['', 'abc', '300.1.1.1', '1.2.3.4/33', '1.2.3.4/x', '1.2.3/24', '2001:db8::/32', '1.2.3.4/24/1']) expect(faixaValida(ruim), ruim).toBe(false);
  });

  it('confere se o IP está na faixa (CIDR no IPv4, igualdade nos demais)', () => {
    expect(ipNaFaixa('200.10.20.30', '200.10.20.30')).toBe(true);
    expect(ipNaFaixa('200.10.20.77', '200.10.20.0/24')).toBe(true);
    expect(ipNaFaixa('200.10.21.1', '200.10.20.0/24')).toBe(false);
    expect(ipNaFaixa('::ffff:200.10.20.5', '200.10.20.0/24')).toBe(true);
    expect(ipNaFaixa('8.8.8.8', '0.0.0.0/0')).toBe(true);
    expect(ipNaFaixa('2001:db8::1', '2001:db8::1')).toBe(true);
    expect(ipNaFaixa('2001:db8::2', '2001:db8::1')).toBe(false);
    expect(ipNaFaixa('', '200.10.20.0/24')).toBe(false);
  });
});

function montar(env: Record<string, string> = {}, ips: { id: string; faixa: string; createdAt?: Date }[] = [], parametro?: string) {
  const logs: unknown[] = [];
  let valor = parametro;
  const prisma = {
    acessoLog: { create: async ({ data }: { data: unknown }) => { logs.push(data); return data; }, findMany: async () => logs },
    ipPermitido: {
      findMany: async () => ips,
      findUnique: async ({ where }: { where: { id?: string; faixa?: string } }) => ips.find((i) => i.id === where.id || i.faixa === where.faixa) ?? null,
      create: async ({ data }: { data: { faixa: string } }) => { const novo = { id: `I${ips.length + 1}`, ...data }; ips.push(novo); return novo; },
      delete: async ({ where }: { where: { id: string } }) => { ips.splice(ips.findIndex((i) => i.id === where.id), 1); },
    },
    parametroSistema: {
      findUnique: async () => (valor === undefined ? null : { valor }),
      upsert: async ({ update }: { update: { valor: string } }) => { valor = update.valor; },
    },
  };
  const config = { get: (k: string) => env[k] };
  return { service: new AcessosService(prisma as never, config as never), logs, ips, valor: () => valor };
}

describe('AcessosService', () => {
  it('registra a tentativa de entrada com o IP normalizado, e falha ao gravar não derruba o login', async () => {
    const t = montar();
    await t.service.registrar({ email: 'a@fal', ip: '::ffff:1.2.3.4', resultado: 'OK' });
    expect(t.logs[0]).toMatchObject({ email: 'a@fal', ip: '1.2.3.4', resultado: 'OK' });
    const quebrado = new AcessosService({ acessoLog: { create: async () => { throw new Error('banco fora'); } } } as never, { get: () => undefined } as never);
    await expect(quebrado.registrar({ email: 'a@fal', resultado: 'FALHA' })).resolves.toBeUndefined();
  });

  it('sem restrição ligada, todo IP entra; com a lista vazia, também (nunca tranca ninguém)', async () => {
    expect(await montar().service.ipPermitido('9.9.9.9')).toBe(true);
    expect(await montar({}, [], 'true').service.ipPermitido('9.9.9.9')).toBe(true);
  });

  it('com a restrição ligada, só entra quem está na lista', async () => {
    const t = montar({}, [{ id: 'I1', faixa: '200.10.20.0/24' }], 'true');
    expect(await t.service.ipPermitido('200.10.20.9')).toBe(true);
    expect(await t.service.ipPermitido('8.8.8.8')).toBe(false);
  });

  it('a variável do servidor IP_ALLOWLIST_OFF=1 desliga a restrição mesmo ligada', async () => {
    const t = montar({ IP_ALLOWLIST_OFF: '1' }, [{ id: 'I1', faixa: '200.10.20.0/24' }], 'true');
    expect(await t.service.ipPermitido('8.8.8.8')).toBe(true);
    expect((await t.service.configuracao('8.8.8.8')).desligada_pelo_servidor).toBe(true);
  });

  it('só liga a restrição com a lista preenchida e com o IP de quem liga dentro dela', async () => {
    await expect(montar().service.definirRestricao(true, '200.10.20.9')).rejects.toThrow(/pelo menos um endereço/);
    const t = montar({}, [{ id: 'I1', faixa: '200.10.20.0/24' }]);
    await expect(t.service.definirRestricao(true, '8.8.8.8')).rejects.toThrow(/não está na lista/);
    await expect(t.service.definirRestricao(true, '200.10.20.9')).resolves.toEqual({ ativo: true });
    expect(t.valor()).toBe('true');
    await expect(t.service.definirRestricao(false, '8.8.8.8')).resolves.toEqual({ ativo: false }); // desligar nunca é barrado
  });

  it('adiciona faixa válida, recusa inválida e repetida', async () => {
    const t = montar();
    await expect(t.service.adicionarIp({ faixa: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
    await t.service.adicionarIp({ faixa: ' 200.10.20.0/24 ', descricao: 'Escritório' }, { email: 'admin@fal' });
    expect(t.ips[0]).toMatchObject({ faixa: '200.10.20.0/24', descricao: 'Escritório', criado_por: 'admin@fal' });
    await expect(t.service.adicionarIp({ faixa: '200.10.20.0/24' })).rejects.toThrow(/já está na lista/);
  });

  it('remover um endereço que tiraria o próprio acesso é barrado enquanto a restrição está ligada', async () => {
    const t = montar({}, [{ id: 'I1', faixa: '200.10.20.0/24' }, { id: 'I2', faixa: '8.8.8.0/24' }], 'true');
    await expect(t.service.removerIp('I1', '200.10.20.9')).rejects.toThrow(/tiraria o seu próprio acesso/);
    await expect(t.service.removerIp('I2', '200.10.20.9')).resolves.toEqual({ removido: true });
    await expect(t.service.removerIp('nada', '200.10.20.9')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista o registro com filtro de resultado válido e limite entre 1 e 500', async () => {
    const t = montar();
    await expect(t.service.listar({ resultado: 'XYZ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.listar({ resultado: 'OK', limite: 9999 })).resolves.toBeTruthy();
  });
});
