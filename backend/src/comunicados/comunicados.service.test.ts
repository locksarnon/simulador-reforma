import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ComunicadosService, corpoEmHtml, normalizarFiltro } from './comunicados.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';

function montar({ smtp = true } = {}) {
  const comunicados: Record<string, any>[] = [];
  const envios: Record<string, any>[] = [];
  const bloqueios: Record<string, any>[] = [];
  const parametros = new Map<string, { chave: string; valor: string }>();
  const mandados: { to: string; subject: string; html: string; attachments?: unknown[] }[] = [];
  const guardados = new Map<string, Buffer>();
  let seq = 0;
  const empresas = [
    { id: 'E1', razao_social: 'EXTRA AGRO LTDA', email_contato: 'fiscal@extra.agro' },
    { id: 'E2', razao_social: 'Beta SA', email_contato: null },
    { id: 'E3', razao_social: 'Gama Ltda', email_contato: 'sair@gama.com' },
  ];
  const prisma = {
    servicoContratado: { findMany: async () => [{ empresa_id: 'E1' }, { empresa_id: 'E2' }, { empresa_id: 'E3' }] },
    empresaTag: { findMany: async () => [{ empresa_id: 'E1', tag_id: 'T1' }, { empresa_id: 'E3', tag_id: 'T1' }, { empresa_id: 'E3', tag_id: 'T2' }] },
    empresa: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => empresas.filter((e) => where.id.in.includes(e.id)) },
    bloqueioEnvio: {
      findMany: async () => bloqueios,
      findUnique: async ({ where }: { where: { id: string } }) => bloqueios.find((b) => b.id === where.id) ?? null,
      upsert: async ({ where, create }: { where: { email: string }; create: Record<string, unknown> }) => { const b = bloqueios.find((x) => x.email === where.email); if (b) return b; const n = { id: `B${++seq}`, ...create }; bloqueios.push(n); return n; },
      delete: async ({ where }: { where: { id: string } }) => { bloqueios.splice(bloqueios.findIndex((b) => b.id === where.id), 1); },
    },
    comunicado: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const c = { id: `C${++seq}`, status: 'RASCUNHO', ...data }; comunicados.push(c); return c; },
      findUnique: async ({ where }: { where: { id: string } }) => comunicados.find((c) => c.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(comunicados.find((c) => c.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => { comunicados.splice(comunicados.findIndex((c) => c.id === where.id), 1); },
      findMany: async () => comunicados,
    },
    envioEmail: { create: async ({ data }: { data: Record<string, unknown> }) => { envios.push(data); return data; }, findMany: async () => envios },
    parametroSistema: {
      findUnique: async ({ where }: { where: { chave: string } }) => parametros.get(where.chave) ?? null,
      upsert: async ({ where, create, update }: { where: { chave: string }; create: { chave: string; valor: string }; update: { valor: string } }) => { parametros.set(where.chave, parametros.has(where.chave) ? { ...parametros.get(where.chave)!, ...update } : create); },
    },
    user: { findMany: async () => [{ id: 'A1' }] },
    notificacao: { create: async () => ({}) },
  };
  const mail = {
    configurado: smtp, urlPublica: 'https://intax.exemplo',
    enviar: async (m: { to: string; subject: string; html: string; attachments?: unknown[] }) => { mandados.push(m); return m.to.startsWith('erro') ? { enviado: false, motivo: 'caixa cheia' } : { enviado: true }; },
  };
  const storage = { guardar: async (k: string, b: Buffer) => { guardados.set(k, b); }, getObjectBuffer: async (k: string) => guardados.get(k)!, removeObject: async (k: string) => { guardados.delete(k); } };
  const config = { get: () => 'segredo-de-teste' };
  return {
    service: new ComunicadosService(prisma as never, mail as never, storage as never, config as never),
    notificacoes: new NotificacoesService(prisma as never, mail as never),
    comunicados, envios, bloqueios, mandados, guardados,
  };
}

const admin = { id: 'A1', email: 'admin@fal', role: 'admin' };

describe('comunicados: regras', () => {
  it('o texto vira HTML seguro, um parágrafo por bloco', () => {
    expect(corpoEmHtml('Olá <b>a</b>\nlinha 2\n\nParágrafo 2')).toBe('<p style="margin:0 0 12px">Olá &lt;b&gt;a&lt;/b&gt;<br>linha 2</p><p style="margin:0 0 12px">Parágrafo 2</p>');
  });
  it('o filtro só guarda o que conhece', () => {
    expect(normalizarFiltro({ carteira: 'x', tags: ['T1', 'T1'], extra: 1 })).toEqual({ carteira: '', tags: ['T1'], tagModo: 'qualquer', empresa_ids: [] });
  });
});

describe('ComunicadosService', () => {
  it('destinatários: pela carteira e etiquetas; quem não tem e-mail ou está bloqueado fica de fora, com o motivo', async () => {
    const t = montar();
    t.bloqueios.push({ id: 'B0', email: 'sair@gama.com' });
    const r = await t.service.destinatarios({ carteira: 'bpo' });
    expect(r.incluidos.map((x) => x.empresa_id)).toEqual(['E1']);
    expect(r.fora).toEqual([{ empresa_id: 'E2', razao_social: 'Beta SA', motivo: 'sem e-mail de contato no cadastro' }, { empresa_id: 'E3', razao_social: 'Gama Ltda', motivo: 'e-mail na lista de bloqueio' }]);
    const todas = await t.service.destinatarios({ tags: ['T1', 'T2'], tagModo: 'todas' });
    expect([...todas.incluidos, ...todas.fora].map((x) => x.empresa_id)).toEqual(['E3']);
    expect((await t.service.destinatarios({})).aviso).toMatch(/Escolha/);
  });

  it('envia com anexo e link de saída, registra cada envio e fecha os contadores; enviado não muda', async () => {
    const t = montar();
    const c = await t.service.criar(admin, { assunto: 'Agenda de novembro', corpo: 'Prazo do DAS no dia 20.', filtro: { empresa_ids: ['E1', 'E3'] } });
    await t.service.anexar(c.id, { buffer: Buffer.from('pdf'), originalname: 'agenda.pdf', mimetype: 'application/pdf', size: 3 });
    const r = await t.service.enviar(admin, c.id, 0);
    expect(r).toEqual({ iniciado: true, total: 2 });
    await new Promise((ok) => setTimeout(ok, 20));
    expect(t.mandados).toHaveLength(2);
    expect(t.mandados[0].html).toContain('/api/v1/public/comunicados/sair?e=');
    expect(t.mandados[0].attachments).toHaveLength(1);
    expect(t.envios.map((e) => e.status)).toEqual(['ENVIADO', 'ENVIADO']);
    expect(t.comunicados[0]).toMatchObject({ status: 'ENVIADO', enviados: 2, falhas: 0 });
    await expect(t.service.atualizar(c.id, { assunto: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('não envia sem SMTP nem sem destinatário', async () => {
    const sem = montar({ smtp: false });
    const c = await sem.service.criar(admin, { assunto: 'A', corpo: 'B', filtro: { empresa_ids: ['E1'] } });
    await expect(sem.service.enviar(admin, c.id, 0)).rejects.toThrow(/SMTP/);
    const t = montar();
    const d = await t.service.criar(admin, { assunto: 'A', corpo: 'B', filtro: { empresa_ids: ['E2'] } });
    await expect(t.service.enviar(admin, d.id, 0)).rejects.toThrow(/Nenhum destinatário/);
    await expect(t.service.criar(admin, { assunto: '', corpo: 'B' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('o link de saída põe o e-mail na lista de bloqueio; link adulterado não', async () => {
    const t = montar();
    const link = new URL(t.service.linkDeSaida('Fiscal@Extra.Agro'));
    expect(await t.service.sair(link.searchParams.get('e')!, 'adulterado')).toBe(false);
    expect(await t.service.sair(link.searchParams.get('e')!, link.searchParams.get('t')!)).toBe(true);
    expect(t.bloqueios.map((b) => b.email)).toEqual(['fiscal@extra.agro']);
  });

  it('cópia dos avisos por e-mail: só ligada, só nas categorias escolhidas e uma vez por aviso novo', async () => {
    const t = montar();
    await expect(t.notificacoes.salvarAvisosEmail({ ativo: true, destinatarios: [] })).rejects.toThrow(/pelo menos um destinatário/);
    await expect(t.notificacoes.salvarAvisosEmail({ ativo: true, destinatarios: ['sem-arroba'] })).rejects.toThrow(/inválido/);
    await t.notificacoes.salvarAvisosEmail({ ativo: true, destinatarios: ['Socio@Fal.com'], categorias: ['CERTIFICADO'] });
    await t.notificacoes.criarParaAdmins({ tipo: 'CERTIFICADO', titulo: 'Certificado vence', link: '/bpo/repositorio-xml/E1' });
    await t.notificacoes.criarParaAdmins({ tipo: 'ACESSO', titulo: 'Muitas recusas' });
    expect(t.mandados.map((m) => [m.to, m.subject])).toEqual([['socio@fal.com', '[InTAX] Certificado vence']]);
    expect(t.envios[0]).toMatchObject({ origem: 'AVISO', status: 'ENVIADO' });
  });
});
