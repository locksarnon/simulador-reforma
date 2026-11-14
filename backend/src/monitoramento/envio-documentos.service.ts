import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { zipSync } from 'fflate';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MailService, emailLayout, esc } from '../mail/mail.service';
import { MonitoramentoService } from './monitoramento.service';

/** Limite dos anexos de um e-mail (antes da codificação base64, que soma cerca de 1/3: 18 MB viram ~24 MB, dentro dos 25 MB usuais). */
export const LIMITE_EMAIL_BYTES = 18 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Um documento do cliente: arquivo oficial ou relatório de uma consulta do monitoramento, ou um arquivo guardado (ex.: SPED). */
export type ItemDocumento =
  | { tipo: 'consulta'; consulta_id: string; indice?: number; formato?: 'pdf' | 'xlsx' }
  | { tipo: 'arquivo'; arquivo_id: string };

const chaveDoItem = (i: ItemDocumento) => (i.tipo === 'arquivo' ? i.arquivo_id : i.consulta_id);

/** Dono dos documentos: a empresa ou a pessoa física. */
export type DonoDocumentos = { empresaId?: string; pessoaFisicaId?: string };
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

/** Baixar em ZIP e enviar por e-mail os documentos marcados; todo envio fica registrado (quem, para quem, quando, o quê). */
@Injectable()
export class EnvioDocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly m: MonitoramentoService,
  ) {}

  /** Os arquivos dos itens, conferindo que todos são do cliente (empresa ou pessoa física). */
  async montar(donoInformado: string | DonoDocumentos, itens: ItemDocumento[]) {
    const dono: DonoDocumentos = typeof donoInformado === 'string' ? { empresaId: donoInformado } : donoInformado;
    const empresaId = dono.empresaId ?? null;
    const pfId = dono.pessoaFisicaId ?? null;
    const doDono = (x: { empresa_id: string | null; pessoa_fisica_id?: string | null }) => (empresaId ? x.empresa_id === empresaId : !!pfId && x.pessoa_fisica_id === pfId);
    if (!Array.isArray(itens) || !itens.length) throw new BadRequestException('Marque ao menos um documento.');
    if (itens.length > 500) throw new BadRequestException('Marque no máximo 500 documentos por vez.');
    const saida: { nome: string; buffer: Buffer; tipo: string }[] = [];
    for (const i of itens) {
      if (i?.tipo === 'arquivo') {
        const a = await this.prisma.arquivoEmpresa.findUnique({ where: { id: String(i.arquivo_id) } });
        if (!a || !doDono(a as never)) throw new NotFoundException('Documento não encontrado neste cliente.');
        saida.push({ nome: a.nome, tipo: a.tipo_mime || 'application/octet-stream', buffer: await this.storage.getObjectBuffer(a.storage_key) });
      } else if (i?.tipo === 'consulta') {
        const c = await this.prisma.consultaFiscal.findUnique({ where: { id: String(i.consulta_id) }, select: { empresa_id: true, pessoa_fisica_id: true } });
        if (!c || !doDono(c)) throw new NotFoundException('Consulta não encontrada neste cliente.');
        if (typeof i.indice === 'number') { const a = await this.m.arquivo(i.consulta_id, i.indice); saida.push({ nome: a.nome, tipo: 'application/pdf', buffer: a.buffer }); }
        else { const r = await this.m.relatorio(i.consulta_id, i.formato === 'xlsx' ? 'xlsx' : 'pdf'); saida.push({ nome: r.nome, tipo: r.tipo, buffer: r.buffer }); }
      } else throw new BadRequestException('Documento inválido.');
    }
    // Nomes repetidos no ZIP ou nos anexos ganham (2), (3)…
    const usados = new Map<string, number>();
    for (const s of saida) {
      const n = usados.get(s.nome) ?? 0;
      usados.set(s.nome, n + 1);
      if (n) s.nome = s.nome.replace(/(\.[^.]+)?$/, ` (${n + 1})$1`);
    }
    return saida;
  }

  /** Nome do dono para o ZIP e o assunto do e-mail. */
  private async nomeDoDono(dono: DonoDocumentos) {
    if (dono.empresaId) return (await this.prisma.empresa.findUnique({ where: { id: dono.empresaId }, select: { razao_social: true } }))?.razao_social ?? '';
    if (dono.pessoaFisicaId) return (await this.prisma.pessoaFisica.findUnique({ where: { id: dono.pessoaFisicaId }, select: { nome: true } }))?.nome ?? '';
    return '';
  }

  async zip(donoInformado: string | DonoDocumentos, itens: ItemDocumento[], usuario?: { email?: string }) {
    const dono: DonoDocumentos = typeof donoInformado === 'string' ? { empresaId: donoInformado } : donoInformado;
    const arquivos = await this.montar(dono, itens);
    const total = arquivos.reduce((s, a) => s + a.buffer.length, 0);
    if (total > MAX_ZIP_BYTES) throw new BadRequestException(`Os documentos somam ${(total / 1048576).toFixed(0)} MB; o ZIP aceita até 200 MB. Baixe em partes (por pasta ou por período).`);
    const nome = await this.nomeDoDono(dono);
    const buffer = Buffer.from(zipSync(Object.fromEntries(arquivos.map((a) => [a.nome, new Uint8Array(a.buffer)])), { level: 6 }));
    await this.registrar(dono, itens, 'DOWNLOAD', usuario?.email ?? 'usuário', `Download de ${arquivos.length} documento(s)`, 'BAIXADO');
    return { nome: `${(nome || 'documentos').replace(/[\\/:*?"<>|]/g, '-')} - documentos.zip`, buffer };
  }

  async enviar(donoInformado: string | DonoDocumentos, corpo: { para?: string[] | string; assunto?: string; mensagem?: string; itens?: ItemDocumento[] }, usuario?: { email?: string }) {
    const para = (Array.isArray(corpo?.para) ? corpo.para : String(corpo?.para ?? '').split(/[;,\s]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!para.length) throw new BadRequestException('Informe ao menos um e-mail.');
    const invalido = para.find((x) => !EMAIL.test(x));
    if (invalido) throw new BadRequestException(`E-mail inválido: ${invalido}`);
    if (para.length > 10) throw new BadRequestException('No máximo 10 destinatários.');
    if (!this.mail.configurado) throw new BadRequestException('O envio de e-mail não está configurado neste servidor.');
    const dono: DonoDocumentos = typeof donoInformado === 'string' ? { empresaId: donoInformado } : donoInformado;
    const arquivos = await this.montar(dono, corpo?.itens ?? []);
    const total = arquivos.reduce((s, a) => s + a.buffer.length, 0);
    if (total > LIMITE_EMAIL_BYTES) throw new BadRequestException(`Os anexos somam ${(total / 1048576).toFixed(1)} MB; o limite por e-mail é ${LIMITE_EMAIL_BYTES / 1048576} MB. Desmarque alguns ou baixe em ZIP.`);
    const nome = await this.nomeDoDono(dono);
    const assunto = (corpo?.assunto ?? '').trim() || `Documentos - ${nome}`.trim();
    const mensagem = (corpo?.mensagem ?? '').trim();
    const html = emailLayout(assunto, `${mensagem ? `<p>${esc(mensagem).replace(/\n/g, '<br>')}</p>` : '<p>Olá,</p><p>Seguem os documentos em anexo.</p>'}<ul>${arquivos.map((a) => `<li>${esc(a.nome)}</li>`).join('')}</ul>`);
    const res = await this.mail.enviar({ to: para.join(', '), subject: assunto, html, attachments: arquivos.map((a) => ({ filename: a.nome, content: a.buffer, contentType: a.tipo })) });
    await this.registrar(dono, corpo.itens ?? [], 'EMAIL', para.join(', '), `${assunto}${usuario?.email ? ` (por ${usuario.email})` : ''}`, res.enviado ? 'ENVIADO' : 'FALHA', res.enviado ? null : res.motivo ?? null);
    if (!res.enviado) throw new BadRequestException(`O e-mail não foi enviado: ${res.motivo ?? 'erro no servidor de e-mail'}.`);
    return { enviado: true, para, anexos: arquivos.length, tamanho: total };
  }

  /** Envios e downloads registrados de um conjunto de documentos (consultas ou arquivos), do mais recente ao mais antigo. */
  async registros(ids: string[]) {
    if (!ids.length) return new Map<string, { quando: Date; tipo: string; destinatario: string; status: string }[]>();
    const l = await this.prisma.envioEmail.findMany({ where: { origem: { in: ['DOCUMENTO_EMAIL', 'DOCUMENTO_DOWNLOAD'] }, origem_id: { in: ids } }, orderBy: { createdAt: 'desc' } });
    const m = new Map<string, { quando: Date; tipo: string; destinatario: string; status: string }[]>();
    for (const r of l) {
      const x = m.get(r.origem_id!) ?? [];
      x.push({ quando: r.createdAt, tipo: r.origem === 'DOCUMENTO_EMAIL' ? 'E-mail' : 'Download', destinatario: r.destinatario, status: r.status });
      m.set(r.origem_id!, x);
    }
    return m;
  }

  private async registrar(dono: DonoDocumentos, itens: ItemDocumento[], tipo: 'EMAIL' | 'DOWNLOAD', destinatario: string, assunto: string, status: string, erro: string | null = null) {
    const ids = [...new Set(itens.map(chaveDoItem))];
    await this.prisma.envioEmail.createMany({ data: ids.map((id) => ({ origem: `DOCUMENTO_${tipo}`, origem_id: id, empresa_id: dono.empresaId ?? null, destinatario, assunto, status, erro })) }).catch(() => undefined);
  }
}
