import { OpcoesValidacao, OPCOES_PADRAO } from './opcoes-validacao';
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
  async salvar(file: Express.Multer.File, mapeamento: Mapeamento | undefined, resultado: { mapeamento: Mapeamento; resumo: { total: number; ok: number; alerta: number; erro: number } }, email: string, empresa_id?: string, opcoes: OpcoesValidacao = OPCOES_PADRAO) {
    try {
      const chave = `validacoes/${randomUUID()}-${(file.originalname || 'planilha').replace(/[^\w.\-]+/g, '_')}`;
      await this.storage.putFileAndGetUrl(chave, file.buffer, file.mimetype || MIME_XLSX);
      const reg = await this.prisma.validacaoCadastro.create({
        data: {
          empresa_id: empresa_id || null, opcoes_json: JSON.stringify(opcoes), resultado_json: JSON.stringify(resultado),
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

  listar(empresa_id?: string) {
    return this.prisma.validacaoCadastro.findMany({ where: empresa_id ? { empresa_id } : { empresa_id: null }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, criado_por: true, nome_arquivo: true, tamanho: true, total: true, itens_ok: true, itens_alerta: true, itens_erro: true, createdAt: true } });
  }

  private async carregar(id: string, empresa_id?: string) {
    const v = await this.prisma.validacaoCadastro.findUnique({ where: { id } });
    if (!v || (empresa_id && v.empresa_id !== empresa_id)) throw new NotFoundException('Validação não encontrada nesta empresa.');
    const buffer = await this.storage.getObjectBuffer(v.storage_key);
    const file = { buffer, originalname: v.nome_arquivo, mimetype: MIME_XLSX, size: buffer.length } as Express.Multer.File;
    const mapa = v.mapeamento_json ? (JSON.parse(v.mapeamento_json) as Mapeamento) : undefined;
    return { v, file, mapa };
  }

  /** Reabre: refaz a validação a partir do arquivo guardado (mesmo formato do resultado original). */
  async obter(id: string, empresa_id?: string) {
    const { v, file, mapa } = await this.carregar(id, empresa_id);
    const r = v.resultado_json ? JSON.parse(v.resultado_json) : await this.produtos.validar(file, mapa, undefined, v.opcoes_json ? JSON.parse(v.opcoes_json) : OPCOES_PADRAO);
    return { ...r, validacao_id: v.id, nome_arquivo: v.nome_arquivo, criado_por: v.criado_por, criado_em: v.createdAt };
  }

  /** Colunas do arquivo guardado — para reabrir a tela de parâmetros de uma validação antiga. */
  async colunas(id: string, empresa_id?: string) {
    const { file } = await this.carregar(id, empresa_id);
    return this.produtos.previa(file);
  }

  /**
   * Refaz a validação do MESMO arquivo guardado com outros parâmetros (colunas e opções), sem reenviar a planilha,
   * e atualiza o mesmo registro do histórico em vez de criar um novo a cada ajuste.
   */
  async refazer(id: string, mapeamento: Mapeamento | undefined, opcoes: OpcoesValidacao, empresa_id?: string) {
    const { v, file } = await this.carregar(id, empresa_id);
    const r = await this.produtos.validar(file, mapeamento, undefined, opcoes);
    await this.prisma.validacaoCadastro.update({
      where: { id },
      data: {
        opcoes_json: JSON.stringify(opcoes), resultado_json: JSON.stringify(r), mapeamento_json: JSON.stringify(r.mapeamento ?? mapeamento ?? {}),
        total: r.resumo.total, itens_ok: r.resumo.ok, itens_alerta: r.resumo.alerta, itens_erro: r.resumo.erro,
      },
    });
    return { ...r, validacao_id: v.id, nome_arquivo: v.nome_arquivo, criado_por: v.criado_por, criado_em: v.createdAt };
  }

  async exportar(id: string) {
    const { v, file, mapa } = await this.carregar(id);
    const buf = await this.produtos.exportarXlsx(file, mapa, v.opcoes_json ? JSON.parse(v.opcoes_json) : OPCOES_PADRAO, [], v.resultado_json ? JSON.parse(v.resultado_json) : undefined);
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
