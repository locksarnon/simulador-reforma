import { Body, Controller, Post } from '@nestjs/common';
import { ImportacaoXmlService } from './importacao-xml.service';

@Controller('xml')
export class ImportacaoXmlController {
  constructor(private readonly service: ImportacaoXmlService) {}

  @Post('processar-lote')
  processarLote(@Body() body: { grupo_id: string; idempotency_key: string; arquivos: { nome: string; file_url: string; storage_key?: string; tamanho?: number }[] }) {
    return this.service.receberLote(body);
  }

  @Post('confirmar-importacao')
  confirmarImportacao(@Body() body: { lote_id: string; perspectivas_ids: string[] }) {
    return this.service.confirmarImportacao(body);
  }

  @Post('reprocessar-lote')
  reprocessarLote(@Body() body: { lote_id: string }) {
    return this.service.reprocessarLote(body);
  }
}
