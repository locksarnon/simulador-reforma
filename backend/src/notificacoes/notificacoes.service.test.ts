import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { faixaDeVencimento, NotificacoesService } from './notificacoes.service';

type N = { id: string; destinatario: string; tipo: string; titulo: string; mensagem: string | null; link: string | null; chave: string | null; lida_em: Date | null; createdAt: Date };

function montar(dados: { tarefas?: { responsavel: string | null; prazo: Date | null; createdAt: Date; status?: string }[]; certificados?: { id: string; empresa_id: string; titular: string; valido_ate: Date }[]; execucoes?: { empresa_id: string; mensagem: string | null; ultimo_cstat: string | null }[]; recusas?: number } = {}) {
  const notificacoes: N[] = [];
  let seq = 0;
  const prisma = {
    notificacao: {
      create: async ({ data }: { data: Omit<N, 'id' | 'lida_em' | 'createdAt'> }) => {
        if (data.chave && notificacoes.some((n) => n.destinatario === data.destinatario && n.chave === data.chave)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const n = { id: `N${++seq}`, lida_em: null, createdAt: new Date(), ...data };
        notificacoes.push(n);
        return n;
      },
      findMany: async ({ where }: { where: { destinatario: string; tipo?: string; lida_em?: null } }) =>
        notificacoes.filter((n) => n.destinatario === where.destinatario && (!where.tipo || n.tipo === where.tipo) && (where.lida_em === undefined || n.lida_em === null)),
      count: async ({ where }: { where: { destinatario: string } }) => notificacoes.filter((n) => n.destinatario === where.destinatario && !n.lida_em).length,
      findUnique: async ({ where }: { where: { id: string } }) => notificacoes.find((n) => n.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<N> }) => Object.assign(notificacoes.find((n) => n.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { destinatario: string; tipo?: string }; data: Partial<N> }) => {
        const alvo = notificacoes.filter((n) => n.destinatario === where.destinatario && !n.lida_em && (!where.tipo || n.tipo === where.tipo));
        alvo.forEach((n) => Object.assign(n, data));
        return { count: alvo.length };
      },
      deleteMany: async ({ where }: { where: { lida_em: { lt: Date } } }) => {
        const antes = notificacoes.length;
        for (let i = notificacoes.length - 1; i >= 0; i--) if (notificacoes[i].lida_em && notificacoes[i].lida_em! < where.lida_em.lt) notificacoes.splice(i, 1);
        return { count: antes - notificacoes.length };
      },
    },
    user: { findMany: async () => [{ id: 'A1' }, { id: 'A2' }] },
    tarefa: { findMany: async () => (dados.tarefas ?? []).filter((t) => !t.status || ['ABERTA', 'EM_ANDAMENTO'].includes(t.status)) },
    certificadoDigital: { findMany: async () => dados.certificados ?? [] },
    empresa: { findUnique: async ({ where }: { where: { id: string } }) => ({ razao_social: `Empresa ${where.id}` }) },
    capturaXmlExecucao: { findMany: async () => dados.execucoes ?? [] },
    acessoLog: { count: async () => dados.recusas ?? 0 },
  };
  return { service: new NotificacoesService(prisma as never), notificacoes };
}

const AGORA = new Date('2026-11-11T12:00:00Z'); // 09:00 em Brasília
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

describe('NotificacoesService: o básico', () => {
  it('a mesma chave não repete o aviso para a mesma pessoa, mas outra pessoa recebe', async () => {
    const t = montar();
    expect(await t.service.criar({ destinatario: 'U1', tipo: 'SISTEMA', titulo: 'Oi', chave: 'k1' })).toBe(true);
    expect(await t.service.criar({ destinatario: 'U1', tipo: 'SISTEMA', titulo: 'Oi de novo', chave: 'k1' })).toBe(false);
    expect(await t.service.criar({ destinatario: 'U2', tipo: 'SISTEMA', titulo: 'Oi', chave: 'k1' })).toBe(true);
    expect(await t.service.criar({ destinatario: 'U1', tipo: 'SISTEMA', titulo: 'Sem chave' })).toBe(true);
    expect(await t.service.contagem('U1')).toEqual({ nao_lidas: 2 });
  });

  it('cada um marca só as próprias; marcar todas respeita a categoria', async () => {
    const t = montar();
    await t.service.criar({ destinatario: 'U1', tipo: 'TAREFA', titulo: 'A' });
    await t.service.criar({ destinatario: 'U1', tipo: 'ACESSO', titulo: 'B' });
    const [a] = t.notificacoes;
    await expect(t.service.marcarLida('U2', a.id)).rejects.toBeInstanceOf(NotFoundException);
    await t.service.marcarLida('U1', a.id);
    expect(a.lida_em).toBeInstanceOf(Date);
    expect(await t.service.marcarTodasLidas('U1', 'TAREFA')).toEqual({ marcadas: 0 });
    expect(await t.service.marcarTodasLidas('U1')).toEqual({ marcadas: 1 });
    expect((await t.service.listar('U1', { nao_lidas: '1' }))).toHaveLength(0);
  });

  it('avisa quem recebe a tarefa de outra pessoa, uma vez; quem se atribui não é avisado', async () => {
    const t = montar();
    const tarefa = { id: 'T1', titulo: 'Conferir CT-e', responsavel: 'U2', prazo: dia('2026-11-20') };
    expect(await t.service.tarefaAtribuida(tarefa, 'U1')).toBe(true);
    expect(await t.service.tarefaAtribuida(tarefa, 'U1')).toBe(false); // mesma tarefa, mesma pessoa
    expect(await t.service.tarefaAtribuida({ ...tarefa, responsavel: 'U1' }, 'U1')).toBe(false);
    expect(await t.service.tarefaAtribuida({ ...tarefa, responsavel: null }, 'U1')).toBe(false);
    expect(t.notificacoes[0]).toMatchObject({ destinatario: 'U2', tipo: 'TAREFA', titulo: 'Nova tarefa para você: Conferir CT-e', mensagem: 'Prazo: 20/11/2026.', link: '/bpo/tarefas' });
  });
});

describe('NotificacoesService: rotina diária', () => {
  it('junta as tarefas de cada pessoa num aviso por dia (atrasadas, vencem hoje, novas)', async () => {
    const velha = new Date('2026-10-01T00:00:00Z');
    const t = montar({
      tarefas: [
        { responsavel: 'U1', prazo: dia('2026-11-05'), createdAt: velha },
        { responsavel: 'U1', prazo: dia('2026-11-09'), createdAt: velha },
        { responsavel: 'U1', prazo: dia('2026-11-11'), createdAt: velha },
        { responsavel: 'U2', prazo: dia('2026-12-01'), createdAt: new Date('2026-11-11T08:00:00Z') },
        { responsavel: 'U3', prazo: dia('2026-12-01'), createdAt: velha }, // nada a avisar
        { responsavel: null, prazo: dia('2026-11-01'), createdAt: velha },
      ],
    });
    await t.service.avisarTarefas(AGORA);
    const de = (u: string) => t.notificacoes.filter((n) => n.destinatario === u).map((n) => n.titulo);
    expect(de('U1')).toEqual(['Suas tarefas: 2 atrasadas, 1 vence hoje']);
    expect(de('U2')).toEqual(['Suas tarefas: 1 nova']);
    expect(de('U3')).toEqual([]);
    expect(de('A1')).toEqual(['1 tarefa atrasada sem responsável']);
    await t.service.avisarTarefas(AGORA); // rodar de novo no mesmo dia não duplica
    expect(de('U1')).toHaveLength(1);
  });

  it('certificado: um aviso por faixa (30, 15, 7, 1, 0) para cada administrador', async () => {
    expect(faixaDeVencimento(45)).toBeNull();
    expect(faixaDeVencimento(30)).toBe(30);
    expect(faixaDeVencimento(20)).toBe(30);
    expect(faixaDeVencimento(10)).toBe(15);
    expect(faixaDeVencimento(3)).toBe(7);
    expect(faixaDeVencimento(1)).toBe(1);
    expect(faixaDeVencimento(-2)).toBe(0);
    const t = montar({ certificados: [{ id: 'C1', empresa_id: 'E1', titular: 'X', valido_ate: new Date(AGORA.getTime() + 10 * 86_400_000) }] });
    expect(await t.service.avisarCertificados(AGORA)).toBe(2); // dois administradores
    expect(await t.service.avisarCertificados(AGORA)).toBe(0);
    expect(t.notificacoes[0]).toMatchObject({ tipo: 'CERTIFICADO', titulo: 'Certificado A1 de Empresa E1 vence em 10 dias', link: '/bpo/repositorio-xml/E1', chave: 'certificado:C1:15' });
  });

  it('captura: só conta o que o serviço de captura grava como erro, e o bloqueio 656', async () => {
    const t = montar({
      execucoes: [
        { empresa_id: 'E1', mensagem: 'Falha de comunicação com a SEFAZ: timeout', ultimo_cstat: null },
        { empresa_id: 'E1', mensagem: 'Captura interrompida: certificado vencido', ultimo_cstat: null },
        { empresa_id: 'E2', mensagem: 'Consumo indevido', ultimo_cstat: '656' },
        { empresa_id: 'E3', mensagem: 'Nenhum documento novo.', ultimo_cstat: '137' },
      ],
    });
    expect(await t.service.avisarCapturas(AGORA)).toBe(2);
    expect(t.notificacoes[0].titulo).toBe('Captura de XML: 3 consultas com problema em 2 empresas');
    const sem = montar({ execucoes: [{ empresa_id: 'E3', mensagem: 'Nenhum documento novo.', ultimo_cstat: '137' }] });
    expect(await sem.service.avisarCapturas(AGORA)).toBe(0);
  });

  it('acessos: avisa a partir de 5 recusas em 24 horas', async () => {
    expect(await montar({ recusas: 4 }).service.avisarAcessos(AGORA)).toBe(0);
    const t = montar({ recusas: 7 });
    expect(await t.service.avisarAcessos(AGORA)).toBe(2);
    expect(t.notificacoes[0]).toMatchObject({ tipo: 'ACESSO', link: '/admin/acessos' });
  });

  it('a rotina roda todos os passos e um passo com erro não derruba os outros', async () => {
    const t = montar({ recusas: 9 });
    (t.service as unknown as { avisarCertificados: () => Promise<number> }).avisarCertificados = async () => { throw new Error('banco fora'); };
    const r = await t.service.rotinaDiaria(AGORA);
    expect(r).toMatchObject({ certificados: 0, acessos: 2 });
  });
});
