import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Mapeamento, ProdutosService } from './produtos.service';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Histórico do validador de cadastro: guarda o arquivo enviado e refaz a validação ao reabrir. */
@Injectable()
export class ValidacoesService {
  private readonly log = new Logger(ValidacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly produtos: ProdutosService,
  ) {}

  /** Salva sem nunca derrubar a validação: se o armazenamento falhar, o resultado ainda volta ao usuário. */
  async salvar(file: Express.Multer.File, mapeamento: Mapeamento | undefined, resultado: { mapeamento: Mapeamento; resumo: { total: number; ok: number; alerta: number; erro: number } }, email: string) {
    try {
      const chave = `validacoes/${randomUUID()}-${(file.originalname || 'planilha').replace(/[^\w.\-]+/g, '_')}`;
      await this.storage.putFileAndGetUrl(chave, file.buffer, file.mimetype || MIME_XLSX);
      const reg = await this.prisma.validacaoCadastro.create({
        data: {
          criado_por: email, nome_arquivo: (file.originalname || 'planilha').slice(0, 200), storage_key: chave, tamanho: file.size ?? file.buffer.length,
          mapeamento_json: JSON.stringify(resultado.mapeamento ?? mapeamento ?? {}), total: resultado.resumo.total,
          itens_ok: resultado.resumo.ok, itens_alerta: resultado.resumo.alerta, itens_erro: resultado.resumo.erro,
        },
      });
      return reg.id;
    } catch (e) {
      this.log.warn(`Não foi possível guardar a validação: ${(e as Error).message}`);
      return null;
    }
  }

  listar() {
    return this.prisma.validacaoCadastro.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, criado_por: true, nome_arquivo: true, tamanho: true, total: true, itens_ok: true, itens_alerta: true, itens_erro: true, createdAt: true } });
  }

  private async carregar(id: string) {
    const v = await this.prisma.validacaoCadastro.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Validação não encontrada (talvez já excluída).');
    const buffer = await this.storage.getObjectBuffer(v.storage_key);
    const file = { buffer, originalname: v.nome_arquivo, mimetype: MIME_XLSX, size: buffer.length } as Express.Multer.File;
    const mapa = v.mapeamento_json ? (JSON.parse(v.mapeamento_json) as Mapeamento) : undefined;
    return { v, file, mapa };
  }

  /** Reabre: refaz a validação a partir do arquivo guardado (mesmo formato do resultado original). */
  async obter(id: string) {
    const { v, file, mapa } = await this.carregar(id);
    const r = await this.produtos.validar(file, mapa);
    return { ...r, validacao_id: v.id, nome_arquivo: v.nome_arquivo, criado_por: v.criado_por, criado_em: v.createdAt };
  }

  async exportar(id: string) {
    const { v, file, mapa } = await this.carregar(id);
    const buf = await this.produtos.exportarXlsx(file, mapa);
    return { buf, nome: `validado-${v.nome_arquivo.replace(/\.[^.]+$/, '')}.xlsx` };
  }

  /** Quem enviou ou um administrador pode excluir, a qualquer momento (apaga também o arquivo). */
  async excluir(id: string, user: AuthUser) {
    const v = await this.prisma.validacaoCadastro.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Validação não encontrada.');
    if (user.role !== 'admin' && v.criado_por !== user.email) throw new ForbiddenException('Só quem enviou ou um administrador pode excluir.');
    await this.storage.removeObject(v.storage_key).catch((e) => this.log.warn(`Arquivo não removido do armazenamento: ${(e as Error).message}`));
    await this.prisma.validacaoCadastro.delete({ where: { id } });
    return { ok: true };
  }
}
