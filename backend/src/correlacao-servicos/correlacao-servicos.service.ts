import { BadRequestException, ForbiddenException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { lerAnexoVIII, PAGINA_RTC, ultimaVersaoNaPagina } from './anexo-viii';

const CHAVE = 'anexo_viii_versao';
// O gov.br recusa (403) pedido sem identificação de navegador.
const CABECALHOS = { 'User-Agent': 'Mozilla/5.0 (compatible; InTAX)', Accept: '*/*' };

type Situacao = { versao: string | null; url: string | null; linhas: number; atualizado_em: string | null; verificado_em: string | null; erro: string | null };

/**
 * Anexo VIII da NFS-e (correlação Item LC 116 × NBS × indicador de operação × cClassTrib): o InTAX procura a versão mais nova na
 * página oficial, baixa, confere o layout e troca a tabela numa transação. Roda ao subir o servidor e toda segunda às 05:20.
 */
@Injectable()
export class CorrelacaoServicosService implements OnApplicationBootstrap {
  private readonly log = new Logger(CorrelacaoServicosService.name);
  private rodando = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || String(process.env.ANEXO_VIII_AUTOMATICO ?? '').toLowerCase() === 'off') return;
    setTimeout(() => void this.atualizar().catch((e) => this.log.warn(`Anexo VIII: ${(e as Error).message}`)), 30_000);
  }

  @Cron('20 5 * * 1', { timeZone: 'America/Sao_Paulo' })
  async rotina() {
    if (process.env.NODE_ENV === 'test' || String(process.env.ANEXO_VIII_AUTOMATICO ?? '').toLowerCase() === 'off') return;
    await this.atualizar().catch((e) => this.log.warn(`Anexo VIII: ${(e as Error).message}`));
  }

  async situacao(): Promise<Situacao> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE } });
    let s: Partial<Situacao> = {};
    try { s = p ? JSON.parse(p.valor) : {}; } catch { s = {}; }
    const linhas = await this.prisma.correlacaoServico.count();
    return { versao: s.versao ?? null, url: s.url ?? null, atualizado_em: s.atualizado_em ?? null, verificado_em: s.verificado_em ?? null, erro: s.erro ?? null, linhas };
  }

  private async gravar(s: Partial<Situacao>) {
    const atual = await this.situacao();
    const valor = JSON.stringify({ ...atual, ...s, linhas: undefined });
    await this.prisma.parametroSistema.upsert({ where: { chave: CHAVE }, update: { valor }, create: { chave: CHAVE, valor, descricao: 'Anexo VIII da NFS-e: versão carregada' } });
  }

  /** Confere a página oficial e carrega a versão mais nova quando ela muda ou a tabela está vazia. `forcar` recarrega mesmo igual. */
  async atualizar(forcar = false, baixar: typeof fetch = fetch) {
    if (this.rodando) return { ...(await this.situacao()), mudou: false };
    this.rodando = true;
    const agora = new Date().toISOString();
    try {
      const pag = await baixar(PAGINA_RTC, { headers: CABECALHOS });
      if (!pag.ok) throw new Error(`Página oficial da NFS-e indisponível (${pag.status}).`);
      const ultima = ultimaVersaoNaPagina(await pag.text());
      if (!ultima) throw new Error('A página oficial não tem link do Anexo VIII.');
      const atual = await this.situacao();
      if (!forcar && atual.versao === ultima.versao && atual.linhas > 0) { await this.gravar({ verificado_em: agora, erro: null }); return { ...(await this.situacao()), mudou: false }; }
      const arq = await baixar(ultima.url, { headers: CABECALHOS });
      if (!arq.ok) throw new Error(`Anexo VIII ${ultima.versao} indisponível (${arq.status}).`);
      const linhas = await lerAnexoVIII(Buffer.from(await arq.arrayBuffer()), `Anexo VIII RTC v${ultima.versao} (gov.br/nfse)`);
      await this.prisma.$transaction(async (tx) => {
        await tx.correlacaoServico.deleteMany();
        await tx.correlacaoServico.createMany({ data: linhas });
      }, { timeout: 120_000 });
      await this.gravar({ versao: ultima.versao, url: ultima.url, atualizado_em: agora, verificado_em: agora, erro: null });
      this.log.log(`Anexo VIII ${ultima.versao} carregado: ${linhas.length} linhas.`);
      return { ...(await this.situacao()), mudou: true };
    } catch (e) {
      await this.gravar({ verificado_em: agora, erro: (e as Error).message }).catch(() => undefined);
      throw e;
    } finally {
      this.rodando = false;
    }
  }

  async atualizarPeloAdmin(usuario: { role?: string }) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores atualizam o Anexo VIII.');
    try { return await this.atualizar(true); } catch (e) { throw new BadRequestException((e as Error).message); }
  }
}
