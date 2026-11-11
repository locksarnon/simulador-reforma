import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AgendaGeralService, diaDoEvento } from './agenda-geral.service';

type Ev = { id: string; titulo: string; descricao: string | null; inicio: Date; fim: Date | null; dia_inteiro: boolean; tipo_id: string | null; empresa_id: string | null; responsavel: string | null; local: string | null; criado_por: string | null };

function montar() {
  const tipos = [{ id: 'T1', nome: 'Reunião', cor: '#2563EB' }];
  const eventos: Ev[] = [];
  const avisos: { destinatario: string; titulo: string; chave?: string | null }[] = [];
  let seq = 0;
  const prisma = {
    tipoEvento: {
      findMany: async () => tipos,
      findUnique: async ({ where }: { where: { id: string } }) => tipos.find((t) => t.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { nome: { equals: string }; id?: { not: string } } }) => tipos.find((t) => t.nome.toLowerCase() === where.nome.equals.toLowerCase() && t.id !== where.id?.not) ?? null,
      create: async ({ data }: { data: { nome: string; cor: string } }) => { const t = { id: `T${tipos.length + 1}`, ...data }; tipos.push(t); return t; },
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(tipos.find((t) => t.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => { tipos.splice(tipos.findIndex((t) => t.id === where.id), 1); },
    },
    eventoAgenda: {
      findMany: async () => eventos,
      findUnique: async ({ where }: { where: { id: string } }) => eventos.find((e) => e.id === where.id) ?? null,
      create: async ({ data }: { data: Partial<Ev> }) => { const e = { id: `E${++seq}`, descricao: null, fim: null, dia_inteiro: false, tipo_id: null, empresa_id: null, responsavel: null, local: null, ...data } as Ev; eventos.push(e); return e; },
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(eventos.find((e) => e.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { tipo_id: string }; data: object }) => { eventos.filter((e) => e.tipo_id === where.tipo_id).forEach((e) => Object.assign(e, data)); },
      delete: async ({ where }: { where: { id: string } }) => { eventos.splice(eventos.findIndex((e) => e.id === where.id), 1); },
    },
    empresa: {
      count: async ({ where }: { where: { id: string } }) => (where.id === 'EMP1' ? 1 : 0),
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'EMP1' ? { id: 'EMP1', razao_social: 'EXTRA AGRO LTDA', regime_atual: 'Lucro Presumido' } : null),
      findMany: async () => [{ id: 'EMP1', razao_social: 'EXTRA AGRO LTDA', regime_atual: 'Lucro Presumido' }],
    },
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ U1: { ativo: true }, U2: { ativo: true }, U9: { ativo: false } } as Record<string, { ativo: boolean }>)[where.id] ?? null },
    tarefa: { findMany: async () => [] },
    certificadoDigital: { findMany: async () => [] },
    servicoContratado: { findMany: async () => [{ empresa_id: 'EMP1' }] },
  };
  const notificacoes = {
    criar: async (n: { destinatario: string; titulo: string; chave?: string | null }) => {
      if (n.chave && avisos.some((a) => a.destinatario === n.destinatario && a.chave === n.chave)) return false;
      avisos.push(n); return true;
    },
    criarParaAdmins: async (n: { titulo: string; chave?: string | null }) => { avisos.push({ destinatario: 'ADMINS', ...n }); return 1; },
  };
  return { service: new AgendaGeralService(prisma as never, notificacoes as never), eventos, tipos, avisos };
}

const maria = { id: 'U1', role: 'user' };
const admin = { id: 'A1', role: 'admin' };

describe('AgendaGeralService: tipos de evento', () => {
  it('cria, renomeia e apaga; nome repetido e cor inválida são recusados; apagar deixa os eventos sem tipo', async () => {
    const t = montar();
    await expect(t.service.criarTipo({ nome: 'reunião' })).rejects.toBeInstanceOf(ConflictException);
    await expect(t.service.criarTipo({ nome: 'Visita', cor: 'azul' })).rejects.toThrow(/#RRGGBB/);
    const v = await t.service.criarTipo({ nome: 'Visita', cor: '#16a34a' });
    expect(v.cor).toBe('#16A34A');
    await expect(t.service.atualizarTipo(v.id, { nome: 'Reunião' })).rejects.toBeInstanceOf(ConflictException);
    const e = await t.service.criarEvento(maria, { titulo: 'Visita técnica', inicio: '2026-11-20', dia_inteiro: true, tipo_id: v.id });
    await t.service.excluirTipo(v.id);
    expect(t.eventos.find((x) => x.id === e.id)!.tipo_id).toBeNull();
    await expect(t.service.excluirTipo('nada')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AgendaGeralService: eventos', () => {
  it('cria evento com hora ou de dia inteiro, e recusa título vazio, fim antes do início, tipo/empresa/responsável inválidos', async () => {
    const t = montar();
    const e = await t.service.criarEvento(maria, { titulo: 'Reunião com a Extra Agro', inicio: '2026-11-12T17:00:00.000Z', fim: '2026-11-12T18:00:00.000Z', empresa_id: 'EMP1', tipo_id: 'T1' });
    expect(diaDoEvento(e)).toBe('2026-11-12');
    const d = await t.service.criarEvento(maria, { titulo: 'Feriado interno', inicio: '2026-11-21', dia_inteiro: true });
    expect(d.inicio.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    await expect(t.service.criarEvento(maria, { titulo: ' ', inicio: '2026-11-12T10:00:00Z' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.criarEvento(maria, { titulo: 'X', inicio: '2026-11-12T10:00:00Z', fim: '2026-11-12T09:00:00Z' })).rejects.toThrow(/antes do início/);
    await expect(t.service.criarEvento(maria, { titulo: 'X', inicio: 'amanhã' })).rejects.toThrow(/inválido/);
    await expect(t.service.criarEvento(maria, { titulo: 'X', inicio: '2026-11-12T10:00:00Z', tipo_id: 'zz' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.criarEvento(maria, { titulo: 'X', inicio: '2026-11-12T10:00:00Z', empresa_id: 'zz' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.criarEvento(maria, { titulo: 'X', inicio: '2026-11-12T10:00:00Z', responsavel: 'U9' })).rejects.toThrow(/desativado/);
  });

  it('evento à noite em Brasília conta no dia de Brasília, não no de UTC', () => {
    expect(diaDoEvento({ inicio: new Date('2026-11-13T01:30:00Z'), dia_inteiro: false })).toBe('2026-11-12'); // 22:30 do dia 12
    expect(diaDoEvento({ inicio: new Date('2026-11-13T00:00:00Z'), dia_inteiro: true })).toBe('2026-11-13');
  });

  it('lista os eventos que tocam o período, inclusive os de vários dias', async () => {
    const t = montar();
    await t.service.criarEvento(maria, { titulo: 'Dentro', inicio: '2026-11-12T13:00:00Z' });
    await t.service.criarEvento(maria, { titulo: 'Atravessa', inicio: '2026-11-09', fim: '2026-11-11', dia_inteiro: true });
    await t.service.criarEvento(maria, { titulo: 'Noite do dia 10 (UTC já é 11)', inicio: '2026-11-11T01:00:00Z' });
    await t.service.criarEvento(maria, { titulo: 'Fora', inicio: '2026-11-20T13:00:00Z' });
    const r = await t.service.listarEventos({ de: '2026-11-11', ate: '2026-11-15' });
    expect(r.map((e) => e.titulo)).toEqual(['Dentro', 'Atravessa']);
    await expect(t.service.listarEventos({ de: '2026-11-15', ate: '2026-11-11' })).rejects.toThrow(/antes da inicial/);
    await expect(t.service.listarEventos({ de: '11/11/2026', ate: '2026-11-15' })).rejects.toThrow(/inválida/);
  });

  it('avisa o responsável que não é quem criou; excluir é de quem criou ou do administrador', async () => {
    const t = montar();
    const e = await t.service.criarEvento(maria, { titulo: 'Visita', inicio: '2026-11-12T13:00:00Z', responsavel: 'U2' });
    expect(t.avisos).toEqual([expect.objectContaining({ destinatario: 'U2', titulo: 'Evento para você: Visita' })]);
    await t.service.criarEvento(maria, { titulo: 'Minha', inicio: '2026-11-12T13:00:00Z', responsavel: 'U1' });
    expect(t.avisos).toHaveLength(1); // a própria pessoa não é avisada
    await expect(t.service.excluirEvento({ id: 'U2', role: 'user' }, e.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.excluirEvento(admin, e.id)).resolves.toEqual({ excluido: true });
  });
});

describe('AgendaGeralService: camadas e obrigações', () => {
  it('camadas limita o período a 4 meses e filtra as obrigações pelo regime da empresa', async () => {
    const t = montar();
    await expect(t.service.camadas({ de: '2026-01-01', ate: '2026-12-31' })).rejects.toThrow(/até 4 meses/);
    const r = await t.service.camadas({ de: '2026-11-01', ate: '2026-11-30', empresa_id: 'EMP1' });
    expect(r.regime).toBe('Lucro Presumido');
    expect(r.obrigacoes.every((o) => o.regimes === 'TODOS' || (o.regimes as string[]).includes('Lucro Presumido'))).toBe(true);
    await expect(t.service.camadas({ de: '2026-11-01', ate: '2026-11-30', empresa_id: 'zz' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('obrigações do mês: sem empresa traz as empresas do BPO e o que vale para cada uma', async () => {
    const t = montar();
    const r = await t.service.obrigacoes({ mes: '2026-11' });
    expect(r.vencimentos.length).toBeGreaterThan(0);
    expect(r.empresas).toEqual([expect.objectContaining({ id: 'EMP1', regime_atual: 'Lucro Presumido' })]);
    expect(r.feriados.length).toBeGreaterThan(5);
    await expect(t.service.obrigacoes({ mes: '2026-13' })).rejects.toBeInstanceOf(BadRequestException);
    const daEmpresa = await t.service.obrigacoes({ mes: '2026-11', empresa_id: 'EMP1' });
    expect(daEmpresa.empresa).toMatchObject({ razao_social: 'EXTRA AGRO LTDA' });
  });

  it('avisos diários: evento de hoje e amanhã para o responsável (ou quem criou), uma vez por dia', async () => {
    const t = montar();
    await t.service.criarEvento(maria, { titulo: 'Reunião', inicio: '2026-11-11T17:00:00Z', local: 'Sala 2' });
    await t.service.criarEvento(maria, { titulo: 'Visita', inicio: '2026-11-12', dia_inteiro: true });
    const agora = new Date('2026-11-11T10:05:00Z');
    const r = await t.service.avisarAgenda(agora);
    expect(r.eventos).toBe(2);
    expect(t.avisos.map((a) => a.titulo)).toEqual(expect.arrayContaining(['Hoje: Reunião às 14:00', 'Amanhã: Visita']));
    expect((await t.service.avisarAgenda(agora)).eventos).toBe(0);
  });
});
