import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ImportacaoXmlService } from './importacao-xml.service';
import { Permissao } from '../permissoes/permissao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { chaveDeUploadDoUsuario } from './shared/chave-armazenamento';

type ArquivoDoCliente = { nome: string; storage_key: string; tamanho?: number; /** Aceito por compatibilidade, nunca usado. */ file_url?: string };

@Controller('xml')
export class ImportacaoXmlController {
  constructor(private readonly service: ImportacaoXmlService) {}

  @Post('processar-lote')
  @Permissao('importar')
  processarLote(
    @Body() body: { grupo_id: string; idempotency_key: string; arquivos: ArquivoDoCliente[] },
    @CurrentUser() user: AuthUser,
  ) {
    // O servidor lê cada XML direto do armazenamento pela chave devolvida no
    // upload (POST /uploads); a URL enviada pelo cliente é ignorada. Só valem
    // chaves do próprio usuário, no formato exato do upload.
    if (Array.isArray(body?.arquivos)) {
      const invalido = body.arquivos.find((a) => !chaveDeUploadDoUsuario(a?.storage_key, user?.id));
      if (invalido) {
        throw new BadRequestException(
          `Arquivo "${String(invalido?.nome ?? '').slice(0, 120)}" sem chave de armazenamento válida: envie o XML de novo pela tela de importação.`,
        );
      }
    }
    return this.service.receberLote(body);
  }

  @Post('confirmar-importacao')
  @Permissao('importar')
  confirmarImportacao(@Body() body: { lote_id: string; perspectivas_ids: string[] }) {
    return this.service.confirmarImportacao(body);
  }

  @Post('reprocessar-lote')
  @Permissao('importar')
  reprocessarLote(@Body() body: { lote_id: string }) {
    return this.service.reprocessarLote(body);
  }
}
