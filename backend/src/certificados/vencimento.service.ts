import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatarDocumento } from './certificados.service';
import { plural } from '../common/plural';

/** Dias que faltam para o vencimento em que o aviso é enviado (0 = vence hoje ou já venceu). */
export const LIMIARES_AVISO = [30, 15, 7, 1, 0];
const DIA = 86_400_000;

/** O menor limiar já alcançado, se for mais urgente do que o último aviso enviado; senão, nada a avisar. */
export function limiarDoAviso(diasRestantes: number, ultimoAviso: number | null): number | null {
  const alcancados = LIMIARES_AVISO.filter((l) => diasRestantes <= l);
  if (!alcancados.length) return null;
  const limiar = Math.min(...alcancados);
  return ultimoAviso === null || limiar < ultimoAviso ? limiar : null;
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Avisa por e-mail, uma vez em cada limiar (30, 15, 7, 1 dia e no vencimento), que um certificado de cliente está para vencer. */
@Injectable()
export class VencimentoCertificadosService {
  private readonly logger = new Logger(VencimentoCertificadosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async avisarVencimentos() {
    if (!this.mail.configurado || !this.mail.emailInterno) {
      this.logger.warn('Aviso de vencimento de certificados não enviado: e-mail (SMTP_HOST e NOTIFY_EMAIL) não configurado.');
      return { avisados: 0 };
    }
    const agora = Date.now();
    const certs = await this.prisma.certificadoDigital.findMany({
      where: { status: 'ATIVO', valido_ate: { lte: new Date(agora + 30 * DIA) } },
      select: { id: true, empresa_id: true, titular: true, documento: true, valido_ate: true, aviso_vencimento_dias: true },
    });
    let avisados = 0;
    for (const c of certs) {
      const dias = Math.floor((c.valido_ate.getTime() - agora) / DIA);
      const limiar = limiarDoAviso(dias, c.aviso_vencimento_dias);
      if (limiar === null) continue;
      const empresa = await this.prisma.empresa.findUnique({ where: { id: c.empresa_id }, select: { razao_social: true } });
      const link = `${this.mail.urlPublica}/bpo/repositorio-xml/${c.empresa_id}`;
      const quando = dias < 0 ? `venceu há ${plural(-dias, 'dia', 'dias')}` : dias === 0 ? 'vence hoje' : `vence em ${plural(dias, 'dia', 'dias')}`;
      const nome = empresa?.razao_social ?? c.titular;
      const r = await this.mail.enviar({
        to: this.mail.emailInterno,
        subject: `[InTAX] Certificado digital de ${nome} ${quando}`,
        text: `O certificado A1 de ${nome} (${formatarDocumento(c.documento)}) ${quando} (validade até ${c.valido_ate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}). Quando vence, a captura de XML do cliente para. Envie o certificado renovado em ${link}`,
        html: `<p>O certificado A1 de <strong>${escapar(nome)}</strong> (${escapar(formatarDocumento(c.documento))}) <strong>${quando}</strong> (validade até ${c.valido_ate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}).</p><p>Quando vence, a captura de XML do cliente para. Envie o certificado renovado em <a href="${escapar(link)}">BPO fiscal &gt; Repositório de XML &gt; Certificado</a>.</p>`,
      });
      if (r.enviado) {
        await this.prisma.certificadoDigital.update({ where: { id: c.id }, data: { aviso_vencimento_dias: limiar } });
        avisados += 1;
      } else {
        this.logger.warn(`Aviso de vencimento do certificado da empresa ${c.empresa_id} não enviado: ${r.motivo ?? 'falha no e-mail'}`);
      }
    }
    return { avisados };
  }
}
