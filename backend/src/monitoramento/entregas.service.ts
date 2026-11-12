import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type Usuario = { email?: string; role?: string } | undefined;

/**
 * Declarações sem consulta automática para escritórios: o Integra Contador (Serpro) não tem serviço para elas (catálogo conferido
 * em 12/11/2026). A EFD-Reinf tem API própria da Receita, que exige procuração eletrônica com poderes de EFD-Reinf para cada cliente.
 */
export const DECLARACOES_SEM_API = [
  { id: 'EFD_ICMS_IPI', rotulo: 'SPED Fiscal (EFD ICMS/IPI)', onde: 'Recibo gerado pelo PVA da EFD ICMS/IPI na transmissão (Receitanet).' },
  { id: 'EFD_CONTRIBUICOES', rotulo: 'SPED Contribuições (EFD-Contribuições)', onde: 'Recibo gerado pelo PVA da EFD-Contribuições na transmissão (Receitanet).' },
  { id: 'DIRBI', rotulo: 'DIRBI', onde: 'Recibo de entrega da DIRBI, no e-CAC.' },
  { id: 'EFD_REINF', rotulo: 'EFD-Reinf', onde: 'Recibo do evento de fechamento (R-2099 ou R-4099) no programa usado ou no e-CAC.' },
] as const;
const IDS: string[] = DECLARACOES_SEM_API.map((d) => d.id);

@Injectable()
export class EntregasService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  /** Quadro do ano: cada declaração por competência, com o registro (se houver) e o recibo. */
  async doAno(empresaId: string, ano: string) {
    if (!/^\d{4}$/.test(ano)) throw new BadRequestException('Ano inválido.');
    const [entregas, dispensas] = await Promise.all([
      this.prisma.entregaDeclaracao.findMany({ where: { empresa_id: empresaId, competencia: { startsWith: ano } }, orderBy: { competencia: 'asc' } }),
      this.prisma.obrigacaoDispensada.findMany({ where: { empresa_id: empresaId, obrigacao: { in: IDS } } }),
    ]);
    const arquivos = await this.prisma.arquivoEmpresa.findMany({ where: { id: { in: entregas.map((e) => e.arquivo_id).filter(Boolean) as string[] } }, select: { id: true, nome: true } });
    const arq = new Map(arquivos.map((a) => [a.id, a]));
    return {
      ano,
      declaracoes: DECLARACOES_SEM_API.map((d) => ({ ...d, dispensada: dispensas.some((x) => x.obrigacao === d.id) })),
      entregas: entregas.map((e) => ({ ...e, arquivo: e.arquivo_id ? arq.get(e.arquivo_id) ?? null : null })),
    };
  }

  async registrar(empresaId: string, b: Record<string, unknown>, pdf: { buffer: Buffer; originalname?: string } | undefined, usuario: Usuario) {
    const obrigacao = String(b.obrigacao ?? '');
    if (!IDS.includes(obrigacao)) throw new BadRequestException('Declaração desconhecida.');
    const competencia = String(b.competencia ?? '').replace(/\D/g, '');
    if (!/^\d{4}(0[1-9]|1[0-2])$/.test(competencia)) throw new BadRequestException('Competência: use AAAAMM (ex.: 202610).');
    const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } });
    if (!empresa) throw new NotFoundException('Cliente não encontrado.');
    const data = b.transmitida_em ? new Date(`${String(b.transmitida_em).slice(0, 10)}T12:00:00Z`) : null;
    if (data && Number.isNaN(data.getTime())) throw new BadRequestException('Data de transmissão inválida. Use AAAA-MM-DD.');
    let arquivo_id: string | undefined;
    if (pdf?.buffer?.length) {
      if (pdf.buffer.length > 10 * 1024 * 1024) throw new BadRequestException('O recibo passa de 10 MB.');
      const rotulo = DECLARACOES_SEM_API.find((d) => d.id === obrigacao)!.rotulo.replace(/[()/\\]/g, '');
      const nome = `Recibo ${rotulo} ${competencia.slice(4)}-${competencia.slice(0, 4)}.pdf`;
      const chave = `arquivos/empresa/${empresaId}/${randomUUID()}-${nome}`;
      await this.storage.guardar(chave, pdf.buffer, 'application/pdf');
      const a = await this.prisma.arquivoEmpresa.create({ data: { empresa_id: empresaId, pasta: 'Recibos de declarações', nome, tamanho: pdf.buffer.length, tipo_mime: 'application/pdf', storage_key: chave, enviado_por: usuario?.email ?? null } });
      arquivo_id = a.id;
    }
    const texto = (v: unknown, n: number) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
    const dados = { recibo: texto(b.recibo, 80), transmitida_em: data, observacao: texto(b.observacao, 500), criado_por: usuario?.email ?? null, ...(arquivo_id ? { arquivo_id } : {}) };
    return this.prisma.entregaDeclaracao.upsert({
      where: { empresa_id_obrigacao_competencia: { empresa_id: empresaId, obrigacao, competencia } },
      update: dados,
      create: { empresa_id: empresaId, obrigacao, competencia, ...dados },
    });
  }

  async excluir(id: string, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores apagam um registro de entrega.');
    const e = await this.prisma.entregaDeclaracao.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Registro não encontrado.');
    await this.prisma.entregaDeclaracao.delete({ where: { id } });
    return { ok: true };
  }
}
