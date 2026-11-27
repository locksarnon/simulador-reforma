import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ImportacaoXmlService } from './importacao-xml.service';
import { Permissao } from '../permissoes/permissao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { chaveDeUploadDoUsuario } from './shared/chave-armazenamento';

const MOTIVO_CHAVE_INVALIDA = 'sem chave de armazenamento válida: envie o XML de novo pela tela de importação.';

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
    // chaves do próprio usuário, no formato exato do upload. Arquivo com chave
    // inválida é recusado sozinho: os demais seguem e a resposta lista os
    // recusados (arquivos_rejeitados). Lote sem nenhuma chave válida: 400.
    if (!Array.isArray(body?.arquivos)) return this.service.receberLote(body);
    const validos: ArquivoDoCliente[] = [];
    const arquivos_rejeitados: { nome: string; motivo: string }[] = [];
    for (const a of body.arquivos) {
      if (chaveDeUploadDoUsuario(a?.storage_key, user?.id)) validos.push(a);
      else arquivos_rejeitados.push({ nome: String(a?.nome ?? '').slice(0, 120), motivo: MOTIVO_CHAVE_INVALIDA });
    }
    if (body.arquivos.length > 0 && validos.length === 0) {
      throw new BadRequestException(`Arquivo "${arquivos_rejeitados[0].nome}" ${MOTIVO_CHAVE_INVALIDA}`);
    }
    if (!arquivos_rejeitados.length) return this.service.receberLote(body);
    return this.service.receberLote({ ...body, arquivos: validos }).then((r) => ({ ...r, arquivos_rejeitados }));
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
