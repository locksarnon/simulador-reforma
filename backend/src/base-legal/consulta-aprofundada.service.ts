import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PdfService } from '../pdf/pdf.service';
import { AVISO_ASSISTENTE, Fundamento, respostaDeApoio, type RespostaAssistente } from './base-legal.assistente';
import type { Pratica } from './calculo-modelo';
import { BaseLegalService } from './base-legal.service';
import { emailRelatorio, FonteExterna, lerFontes, lerRespostaAprofundada, montarRelatorio, promptAprofundado } from './pesquisa-externa';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Passo a passo e cálculo modelo guardados com a pergunta (coluna JSON "pratica"); pergunta antiga não tem. */
const praticaDe = (reg: object): Pratica | null => {
  const p = (reg as { pratica?: unknown }).pratica;
  return p && typeof p === 'object' && Array.isArray((p as { passos?: unknown }).passos) ? (p as Pratica) : null;
};

/** Pesquisa aprofundada (normas + fontes da web) e envio do relatório por e-mail no padrão FAL/InTAX. */
@Injectable()
export class ConsultaAprofundadaService {
  private readonly log = new Logger(ConsultaAprofundadaService.name);
  private readonly usoPorUsuario = new Map<string, number[]>();

  constructor(
    private readonly base: BaseLegalService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly pdf: PdfService,
  ) {}

  /** A pesquisa na web custa mais que a pergunta comum: 6 a cada 10 minutos por usuário. */
  private checarLimite(email: string) {
    const agora = Date.now();
    const recentes = (this.usoPorUsuario.get(email) ?? []).filter((t) => agora - t < 10 * 60_000);
    if (recentes.length >= 6) throw new BadRequestException('Muitas pesquisas aprofundadas seguidas. Aguarde alguns minutos e tente de novo.');
    recentes.push(agora);
    this.usoPorUsuario.set(email, recentes);
  }

  async perguntar(email: string, perguntaBruta: string) {
    const pergunta = (perguntaBruta || '').trim().slice(0, 600);
    if (pergunta.length < 8) throw new BadRequestException('Escreva a pergunta com um pouco mais de detalhe.');
    this.checarLimite(email);
    this.base.checarLimite(email);

    const iaDisponivel = this.base.iaConfigurada();
    let termos: string[] = [];
    if (iaDisponivel) {
      try {
        termos = await this.base.termosDaPergunta(pergunta);
      } catch (e) {
        this.log.warn(`Termos via IA falharam: ${(e as Error).message}`);
      }
    }
    const cands = await this.base.candidatos(pergunta, termos);

    let saida: RespostaAssistente = { resposta: '', suficiente: false, ressalvas: null, fundamentos: [] };
    let fontes: FonteExterna[] = [];
    let motivo: 'ok' | 'sem_ia' | 'erro_ia' = 'ok';
    let modeloUsado = this.base.modeloAtual();
    if (!iaDisponivel) motivo = 'sem_ia';
    else {
      try {
        const { texto, grounding, modelo } = await this.base.iaComBusca(promptAprofundado(pergunta, cands));
        modeloUsado = modelo;
        saida = lerRespostaAprofundada(texto, cands);
        fontes = lerFontes(grounding);
      } catch (e) {
        motivo = 'erro_ia';
        this.log.warn(`Pesquisa aprofundada falhou: ${(e as Error).message}`);
      }
    }
    if (!saida.resposta) saida = respostaDeApoio(cands, true);

    const reg = await this.prisma.perguntaLegal.create({
      data: {
        user_email: email, pergunta, resposta: saida.resposta || null, fundamentos: saida.fundamentos as object, suficiente: saida.suficiente,
        modelo: motivo === 'ok' ? modeloUsado : null, aprofundada: true, ressalvas: saida.ressalvas, fontes_externas: fontes as object,
        ...(saida.pratica ? { pratica: saida.pratica as object } : {}),
      },
    });
    return {
      id: reg.id, motivo, aprofundada: true, ...saida, fontes_externas: fontes, modelo: motivo === 'ok' ? modeloUsado : null,
      relacionados: saida.suficiente ? [] : cands.slice(0, 6).map((c) => ({ norma: c.chave, numero: c.numero, rotulo: c.rotulo, caminho: c.caminho, secao: c.secao })),
      aviso: AVISO_ASSISTENTE,
    };
  }

  /** Gera o relatório (PDF no padrão InTAX) da pergunta já respondida e envia por e-mail. Só quem perguntou (ou um administrador). */
  async enviarRelatorio(user: { email: string; role?: string; name?: string | null }, id: string, destinatarioBruto: string) {
    const destinatario = String(destinatarioBruto || '').trim().toLowerCase();
    if (!EMAIL.test(destinatario) || destinatario.length > 200) throw new BadRequestException('Informe um e-mail válido.');
    const reg = await this.prisma.perguntaLegal.findUnique({ where: { id } });
    if (!reg || !reg.resposta) throw new NotFoundException('Pergunta não encontrada.');
    if (reg.user_email !== user.email && user.role !== 'admin') throw new ForbiddenException('Só quem fez a pergunta pode enviar o relatório.');
    // Relatório de resposta sem apoio (IA indisponível, nada achado) não vai a cliente: é só lista de trechos.
    if (!reg.suficiente) throw new BadRequestException('Esta resposta ainda não é conclusiva. Detalhe a pergunta antes de enviar um relatório.');

    const dados = {
      pergunta: reg.pergunta, resposta: reg.resposta, ressalvas: reg.ressalvas ?? null,
      fundamentos: Array.isArray(reg.fundamentos) ? (reg.fundamentos as unknown as Fundamento[]) : [],
      fontes: Array.isArray(reg.fontes_externas) ? (reg.fontes_externas as unknown as FonteExterna[]) : [],
      aprofundada: reg.aprofundada, data: reg.createdAt, solicitante: user.name || user.email,
      pratica: praticaDe(reg),
    };
    const pdf = await this.pdf.gerar(montarRelatorio(dados));
    const msg = emailRelatorio(dados);
    const r = await this.mail.enviar({
      to: destinatario, subject: msg.assunto, html: msg.html, text: msg.texto,
      attachments: [{ filename: 'consulta-tributaria-intax.pdf', content: pdf, contentType: 'application/pdf' }],
    });
    if (!r.enviado) throw new BadRequestException(`Não foi possível enviar o e-mail agora${r.motivo ? `: ${r.motivo}` : ''}. Tente de novo em instantes.`);
    this.log.log(`Relatório da pergunta ${id} enviado por ${user.email}`);
    return { enviado: true, destinatario };
  }

  /** O PDF do relatório, para baixar (mesma regra de acesso do envio). */
  async baixarRelatorio(user: { email: string; role?: string; name?: string | null }, id: string): Promise<Buffer> {
    const reg = await this.prisma.perguntaLegal.findUnique({ where: { id } });
    if (!reg || !reg.resposta) throw new NotFoundException('Pergunta não encontrada.');
    if (reg.user_email !== user.email && user.role !== 'admin') throw new ForbiddenException('Só quem fez a pergunta pode baixar o relatório.');
    return this.pdf.gerar(montarRelatorio({
      pergunta: reg.pergunta, resposta: reg.resposta, ressalvas: reg.ressalvas ?? null,
      fundamentos: Array.isArray(reg.fundamentos) ? (reg.fundamentos as unknown as Fundamento[]) : [],
      fontes: Array.isArray(reg.fontes_externas) ? (reg.fontes_externas as unknown as FonteExterna[]) : [],
      aprofundada: reg.aprofundada, data: reg.createdAt, solicitante: user.name || user.email,
      pratica: praticaDe(reg),
    }));
  }
}
