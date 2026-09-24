import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClassificacaoController } from '../classificacao/classificacao.controller';
import { ClassificacaoService } from '../classificacao/classificacao.service';
import { LeadsService } from '../leads/leads.service';
import { NewsletterController } from '../newsletter/newsletter.controller';
import { NewsletterService } from '../newsletter/newsletter.service';
import { PdfService } from '../pdf/pdf.service';
import { ProdutosController } from '../produtos/produtos.controller';
import { ProdutosService } from '../produtos/produtos.service';
import { RoteiroTestesController } from '../roteiro-testes/roteiro-testes.controller';
import { PublicoController } from '../publico/publico.controller';

/**
 * Camada comercial do InTAX: ferramentas públicas (isca), captura de leads,
 * validação de cadastro/NCM e newsletter. O ThrottlerGuard só é aplicado nas
 * rotas públicas (por controller), nunca no app autenticado.
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [ClassificacaoController, ProdutosController, NewsletterController, PublicoController, RoteiroTestesController],
  providers: [ClassificacaoService, ProdutosService, LeadsService, NewsletterService, PdfService],
  exports: [ClassificacaoService],
})
export class ComercialModule {}
