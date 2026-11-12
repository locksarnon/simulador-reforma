import { describe, expect, it, vi } from 'vitest';
import { limiarDoAviso, VencimentoCertificadosService } from './vencimento.service';

const DIA = 86_400_000;

describe('limiarDoAviso', () => {
  it('avisa uma vez em cada limiar, sempre pelo mais urgente já alcançado', () => {
    expect(limiarDoAviso(45, null)).toBeNull();
    expect(limiarDoAviso(30, null)).toBe(30);
    expect(limiarDoAviso(29, 30)).toBeNull();
    expect(limiarDoAviso(15, 30)).toBe(15);
    expect(limiarDoAviso(10, 15)).toBeNull();
    expect(limiarDoAviso(7, 15)).toBe(7);
    expect(limiarDoAviso(1, 7)).toBe(1);
    expect(limiarDoAviso(0, 1)).toBe(0);
    expect(limiarDoAviso(-3, 0)).toBeNull();
  });
  it('certificado enviado já perto do vencimento recebe só o aviso do limiar atual', () => {
    expect(limiarDoAviso(6, null)).toBe(7);
    expect(limiarDoAviso(-2, null)).toBe(0);
  });
});

describe('VencimentoCertificadosService', () => {
  const montar = (opts: { mailOk?: boolean; dias?: number; ultimo?: number | null; enviado?: boolean } = {}) => {
    const cert = { id: 'c1', empresa_id: 'E1', titular: 'EMPRESA TESTE:12345678000195', documento: '12345678000195', valido_ate: new Date(Date.now() + (opts.dias ?? 20) * DIA + 3_600_000), aviso_vencimento_dias: opts.ultimo ?? null };
    const atualizacoes: unknown[] = [];
    const prisma = {
      certificadoDigital: { findMany: vi.fn(async () => [cert]), update: vi.fn(async (a: unknown) => { atualizacoes.push(a); }) },
      empresa: { findUnique: vi.fn(async () => ({ razao_social: 'Empresa <Teste> Ltda' })) },
    };
    const mail = {
      configurado: opts.mailOk !== false, emailInterno: opts.mailOk === false ? '' : 'fiscal@fal.test', urlPublica: 'https://simulador.exemplo',
      enviar: vi.fn(async () => ({ enviado: opts.enviado !== false, motivo: opts.enviado === false ? 'falha' : undefined })),
    };
    return { service: new VencimentoCertificadosService(prisma as never, mail as never), prisma, mail, atualizacoes };
  };

  it('envia o aviso, com link para a tela da empresa, e guarda o limiar avisado', async () => {
    const t = montar({ dias: 20 });
    expect(await t.service.avisarVencimentos()).toEqual({ avisados: 1 });
    const msg = t.mail.enviar.mock.calls[0][0] as { to: string; subject: string; html: string; text: string };
    expect(msg.to).toBe('fiscal@fal.test');
    expect(msg.subject).toContain('vence em 20 dias');
    expect(msg.text).toContain('https://simulador.exemplo/bpo/repositorio-xml/E1');
    expect(msg.html).toContain('Empresa &lt;Teste&gt; Ltda');
    expect(t.atualizacoes).toEqual([{ where: { id: 'c1' }, data: { aviso_vencimento_dias: 30 } }]);
  });

  it('não repete o aviso do mesmo limiar nem avisa fora da janela', async () => {
    const repetido = montar({ dias: 20, ultimo: 30 });
    expect(await repetido.service.avisarVencimentos()).toEqual({ avisados: 0 });
    expect(repetido.mail.enviar).not.toHaveBeenCalled();
  });

  it('sem e-mail configurado não faz nada, e falha de envio não marca o aviso como feito', async () => {
    const semMail = montar({ mailOk: false });
    expect(await semMail.service.avisarVencimentos()).toEqual({ avisados: 0 });
    expect(semMail.prisma.certificadoDigital.findMany).not.toHaveBeenCalled();
    const falhou = montar({ enviado: false });
    expect(await falhou.service.avisarVencimentos()).toEqual({ avisados: 0 });
    expect(falhou.atualizacoes).toHaveLength(0);
  });

  it('certificado vencido recebe o aviso de vencimento', async () => {
    const t = montar({ dias: -2, ultimo: 1 });
    await t.service.avisarVencimentos();
    expect((t.mail.enviar.mock.calls[0][0] as { subject: string }).subject).toContain('venceu há');
    expect(t.atualizacoes).toEqual([{ where: { id: 'c1' }, data: { aviso_vencimento_dias: 0 } }]);
  });
});
