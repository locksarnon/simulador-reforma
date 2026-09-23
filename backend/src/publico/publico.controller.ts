import {
  BadRequestException, Body, Controller, Get, Header, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService, NovoLead } from '../leads/leads.service';
import { NewsletterService } from '../newsletter/newsletter.service';
import { PdfService, DocumentoPdf } from '../pdf/pdf.service';
import { ProdutosService } from '../produtos/produtos.service';
import { lerMapeamento } from '../produtos/produtos.controller';
import { esc } from '../mail/mail.service';

const AMOSTRA_LINHAS = 300;
const AMOSTRA_BYTES = 2 * 1024 * 1024;
const ORIGENS = ['calculadora', 'consulta_ncm', 'validador_cadastro', 'site'];

/**
 * Superfície pública do InTAX (ferramentas-isca). Tudo aqui é aberto, então
 * cada rota tem limite de uso por IP e tamanho máximo de entrada.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('public')
export class PublicoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly newsletter: NewsletterService,
    private readonly pdf: PdfService,
    private readonly produtos: ProdutosService,
  ) {}

  /** Parâmetros de transição (alíquotas e fatores por ano) usados pela calculadora. */
  @Get('parametros-transicao')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async parametros() {
    const rows = await this.prisma.transicaoAno.findMany({ orderBy: { ano: 'asc' } });
    return rows.map((r) => ({
      ano: r.ano, pis_cofins_fator: r.pis_cofins_fator, ipi_fator_geral: r.ipi_fator_geral, icms_fator: r.icms_fator,
      iss_fator: r.iss_fator, ibs_efetivo: r.ibs_efetivo, ibs_uf_aliquota: r.ibs_uf_aliquota, ibs_mun_aliquota: r.ibs_mun_aliquota,
      cbs_efetiva: r.cbs_efetiva, efeito_financeiro: r.efeito_financeiro, carater: r.carater,
    }));
  }

  @Post('leads')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  criarLead(@Body() body: NovoLead) {
    if (!ORIGENS.includes(body?.origem)) throw new BadRequestException('Origem inválida.');
    return this.leads.criar(body);
  }

  /** PDF na hora — gerado a partir do conteúdo que a própria tela montou. */
  @Post('relatorio/pdf')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async relatorio(@Body() doc: DocumentoPdf) {
    if (!doc?.titulo || !Array.isArray(doc.secoes)) throw new BadRequestException('Conteúdo do relatório inválido.');
    const buf = await this.pdf.gerar(doc);
    return new StreamableFile(buf, { type: 'application/pdf', disposition: 'attachment; filename="relatorio-intax.pdf"' });
  }

  @Get('produtos/modelo')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async modelo() {
    const buf = await this.produtos.modeloXlsx();
    return new StreamableFile(buf, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="modelo-cadastro-produtos-intax.xlsx"',
    });
  }

  /**
   * Validação de amostra (até 300 produtos): mostra o resumo a qualquer um e
   * o detalhe completo só depois do cadastro do contato.
   */
  @Post('produtos/amostra')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: AMOSTRA_BYTES } }))
  async amostra(
    @UploadedFile() file: Express.Multer.File,
    @Body('mapeamento') mapeamento?: string,
    @Body('email') email?: string,
    @Body('somente_ler') somenteLer?: string,
  ) {
    if (somenteLer === 'true') return { modo: 'previa', ...(await this.produtos.previa(file)) };
    const r = await this.produtos.validar(file, lerMapeamento(mapeamento), AMOSTRA_LINHAS);
    const liberado = email ? await this.leads.leadRecente(email, 'validador_cadastro') : false;
    if (liberado) return { modo: 'completo', ...r };
    const comProblema = r.itens.filter((i) => i.situacao !== 'OK');
    return { modo: 'resumo', mapeamento: r.mapeamento, resumo: r.resumo, itens: comProblema.slice(0, 3), detalhes_bloqueados: comProblema.length > 3 };
  }

  @Post('newsletter/inscrever')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  inscrever(@Body() b: { email: string; nome?: string; segmento?: string }) {
    return this.newsletter.inscrever(b?.email, b?.nome, b?.segmento, 'site');
  }

  @Get('newsletter/descadastrar')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async descadastrar(@Query('token') token: string) {
    const ok = await this.newsletter.descadastrar(token);
    const msg = ok ? 'Pronto! Você não receberá mais nossos e-mails.' : 'Link inválido ou já utilizado.';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InTAX</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f5f2;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="background:#fff;padding:32px;border-radius:8px;max-width:420px;text-align:center"><h2 style="color:#1f3a2e;margin-top:0">InTAX</h2><p>${esc(msg)}</p></div></body></html>`;
  }
}
