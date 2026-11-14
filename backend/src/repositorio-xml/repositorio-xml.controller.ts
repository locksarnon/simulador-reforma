import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, PayloadTooLargeException, Param, Post, Query,
  StreamableFile, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FiltrosRelatorio, RelatoriosXmlService } from './relatorios-xml.service';
import { FiltrosDocumentos, RepositorioXmlService } from './repositorio-xml.service';

const LIMITE_ARQUIVO = 30 * 1024 * 1024;
const MAX_ARQUIVOS = 100;
/** Teto do pedido inteiro: o upload fica em memória, então a soma dos arquivos precisa ter um limite (a tela envia em partes de até 100 MB). */
export const LIMITE_ENVIO = 120 * 1024 * 1024;

/** Recusa, antes de ler o corpo, o pedido que declara mais bytes que o teto. */
@Injectable()
export class LimiteEnvioGuard implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const declarado = Number(req.headers['content-length']);
    if (Number.isFinite(declarado) && declarado > LIMITE_ENVIO) {
      throw new PayloadTooLargeException(`Envio grande demais (limite de ${LIMITE_ENVIO / (1024 * 1024)} MB por vez). Envie em partes.`);
    }
    return true;
  }
}

/** Nome seguro para o cabeçalho de download: nada além de letras, números, ponto, hífen e sublinhado. */
export const nomeDeDownload = (nome: string): string => nome.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150) || 'documento.xml';

function filtros(q: Record<string, string | undefined>): FiltrosDocumentos {
  return {
    tipo: q.tipo || undefined, origem: q.origem || undefined, conteudo: q.conteudo || undefined, situacao: q.situacao || undefined,
    grupo: q.grupo || undefined, modelo: q.modelo || undefined, papel_cte: q.papel_cte || undefined, de: q.de || undefined, ate: q.ate || undefined, q: q.q || undefined, pendentes: q.pendentes === 'true' || q.pendentes === '1',
    limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined,
  };
}

/** Filtros dos relatórios: os da lista, mais os que só eles usam (resumos, busca nos itens e agrupamento). */
function filtrosDoRelatorio(q: Record<string, string | undefined>): FiltrosRelatorio {
  return { ...filtros(q), pendentes: false, limit: undefined, offset: undefined, incluirResumos: q.incluir_resumos === 'true', busca: q.busca || undefined, agrupar: q.agrupar || undefined };
}

/** Repositório de XML por cliente: envio, consulta, download e entrega ao importador. */
@Controller('repositorio-xml/empresas/:empresaId')
export class RepositorioXmlController {
  constructor(private readonly service: RepositorioXmlService, private readonly relatorios: RelatoriosXmlService) {}

  @Get('resumo')
  resumo(@Param('empresaId') empresaId: string) {
    return this.service.resumo(empresaId);
  }

  @Get('relatorios/geral')
  relatorioGeral(@Param('empresaId') empresaId: string, @Query() query: Record<string, string>) {
    return this.relatorios.geral(empresaId, filtrosDoRelatorio(query));
  }

  @Get('relatorios/produtos')
  relatorioProdutos(@Param('empresaId') empresaId: string, @Query() query: Record<string, string>) {
    return this.relatorios.produtos(empresaId, filtrosDoRelatorio(query));
  }

  @Get('documentos')
  listar(@Param('empresaId') empresaId: string, @Query() query: Record<string, string>) {
    return this.service.listar(empresaId, filtros(query));
  }

  @Post('documentos')
  @UseGuards(LimiteEnvioGuard)
  @UseInterceptors(FilesInterceptor('arquivos', MAX_ARQUIVOS, { limits: { fileSize: LIMITE_ARQUIVO, files: MAX_ARQUIVOS } }))
  receber(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @UploadedFiles() arquivos: Express.Multer.File[] | undefined) {
    if (!arquivos?.length) throw new BadRequestException('Envie ao menos um arquivo .xml ou .zip.');
    // O nome chega decodificado como latin1 pelo multer; devolve para UTF-8.
    return this.service.receberArquivos(
      empresaId,
      arquivos.map((a) => ({ nome: Buffer.from(a.originalname, 'latin1').toString('utf8'), buffer: a.buffer })),
      user.email,
    );
  }

  @Get('documentos/:id/arquivo')
  async baixar(@Param('empresaId') empresaId: string, @Param('id') id: string) {
    const { buffer, nome } = await this.service.baixar(empresaId, id);
    return new StreamableFile(buffer, { type: 'application/xml', disposition: `attachment; filename="${nomeDeDownload(nome)}"` });
  }

  @Get('documentos/:id/pdf')
  async pdf(@Param('empresaId') empresaId: string, @Param('id') id: string) {
    const { buffer, nome } = await this.service.baixarPdf(empresaId, id);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${nomeDeDownload(nome)}"` });
  }

  @Post('documentos/zip')
  async zip(@Param('empresaId') empresaId: string, @Body() body: Record<string, string>) {
    const incluirPdf = String(body?.incluir_pdf) === 'true';
    const buffer = await this.service.baixarZip(empresaId, filtros(body ?? {}), { incluirPdf });
    return new StreamableFile(buffer, { type: 'application/zip', disposition: `attachment; filename="${incluirPdf ? 'xml-e-pdf' : 'xml'}.zip"` });
  }

  @Post('documentos/enviar-importacao')
  enviarParaImportacao(@Param('empresaId') empresaId: string, @Body() body: { ids?: string[]; incluir_nao_tomados?: boolean }) {
    return this.service.enviarParaImportacao(empresaId, Array.isArray(body?.ids) ? body.ids.map(String) : undefined, body?.incluir_nao_tomados === true);
  }

  @Post('documentos/excluir')
  excluir(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body() body: { ids?: string[] }) {
    if (user.role !== 'admin') throw new ForbiddenException('Apenas administradores excluem documentos do repositório.');
    return this.service.excluir(empresaId, Array.isArray(body?.ids) ? body.ids.map(String) : []);
  }
}
