import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { faixaValida, ipNaFaixa, normalizarIp } from './ip';

const PARAM_RESTRICAO = 'ip_restrito';
export const RESULTADOS_DE_ACESSO = ['OK', 'FALHA', 'INATIVO', 'BLOQUEADO_IP'] as const;

/**
 * Registro de acesso e restrição por IP. A restrição vem desligada; ao ligar, só os endereços da lista entram. Três travas contra se
 * trancar para fora: não liga com a lista vazia, não liga sem o IP de quem está ligando na lista, e a variável IP_ALLOWLIST_OFF=1 no
 * servidor desliga tudo sem precisar de acesso ao sistema.
 */
@Injectable()
export class AcessosService {
  private readonly logger = new Logger(AcessosService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  /** Grava a tentativa de entrada; falha ao gravar nunca impede o login. */
  async registrar(r: { user_id?: string | null; email: string; ip?: string | null; user_agent?: string | null; resultado: (typeof RESULTADOS_DE_ACESSO)[number] }) {
    try {
      await this.prisma.acessoLog.create({
        data: { user_id: r.user_id ?? null, email: r.email, ip: normalizarIp(r.ip) || null, user_agent: r.user_agent?.slice(0, 300) ?? null, resultado: r.resultado },
      });
    } catch (e) {
      this.logger.warn(`Não foi possível registrar o acesso: ${(e as Error).message}`);
    }
  }

  async listar(f: { resultado?: string; email?: string; limite?: number } = {}) {
    if (f.resultado && !RESULTADOS_DE_ACESSO.includes(f.resultado as never)) throw new BadRequestException('Resultado inválido.');
    const take = Math.min(Math.max(Number(f.limite) || 200, 1), 500);
    return this.prisma.acessoLog.findMany({
      where: { ...(f.resultado ? { resultado: f.resultado } : {}), ...(f.email ? { email: { contains: f.email.toLowerCase() } } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  private desligadaPeloServidor() {
    return this.config.get<string>('IP_ALLOWLIST_OFF') === '1';
  }

  async restricaoAtiva(): Promise<boolean> {
    if (this.desligadaPeloServidor()) return false;
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: PARAM_RESTRICAO } });
    return p?.valor === 'true';
  }

  /** Sem restrição, ou com a lista vazia (nunca tranca ninguém por engano), todo IP entra. */
  async ipPermitido(ip?: string | null): Promise<boolean> {
    if (!(await this.restricaoAtiva())) return true;
    const faixas = await this.prisma.ipPermitido.findMany();
    if (faixas.length === 0) return true;
    return faixas.some((f) => ipNaFaixa(ip ?? '', f.faixa));
  }

  async configuracao(ipAtual?: string | null) {
    const [ativo, ips] = await Promise.all([this.restricaoAtiva(), this.prisma.ipPermitido.findMany({ orderBy: { createdAt: 'asc' } })]);
    return { ativo, desligada_pelo_servidor: this.desligadaPeloServidor(), ip_atual: normalizarIp(ipAtual) || null, ips };
  }

  async adicionarIp(entrada: { faixa?: string; descricao?: string }, usuario?: { email?: string }) {
    const faixa = String(entrada.faixa ?? '').trim().toLowerCase();
    if (!faixaValida(faixa)) throw new BadRequestException('Informe um IP (por exemplo 200.10.20.30) ou uma faixa IPv4 (por exemplo 200.10.20.0/24).');
    const existe = await this.prisma.ipPermitido.findUnique({ where: { faixa } });
    if (existe) throw new BadRequestException('Esse endereço já está na lista.');
    return this.prisma.ipPermitido.create({ data: { faixa, descricao: entrada.descricao?.trim().slice(0, 120) || null, criado_por: usuario?.email ?? null } });
  }

  async removerIp(id: string, ipAtual?: string | null) {
    const alvo = await this.prisma.ipPermitido.findUnique({ where: { id } });
    if (!alvo) throw new NotFoundException('Endereço não encontrado.');
    if (await this.restricaoAtiva()) {
      const restantes = (await this.prisma.ipPermitido.findMany()).filter((f) => f.id !== id);
      if (restantes.length > 0 && !restantes.some((f) => ipNaFaixa(ipAtual ?? '', f.faixa))) {
        throw new BadRequestException('Remover esse endereço tiraria o seu próprio acesso. Adicione outro que cubra o seu IP antes.');
      }
    }
    await this.prisma.ipPermitido.delete({ where: { id } });
    return { removido: true };
  }

  async definirRestricao(ativo: boolean, ipAtual?: string | null) {
    if (ativo) {
      const faixas = await this.prisma.ipPermitido.findMany();
      if (faixas.length === 0) throw new BadRequestException('Adicione pelo menos um endereço antes de ligar a restrição.');
      if (!faixas.some((f) => ipNaFaixa(ipAtual ?? '', f.faixa))) {
        throw new BadRequestException(`O seu IP atual (${normalizarIp(ipAtual) || 'desconhecido'}) não está na lista. Adicione-o antes de ligar a restrição, para não ficar sem acesso.`);
      }
    }
    await this.prisma.parametroSistema.upsert({
      where: { chave: PARAM_RESTRICAO },
      update: { valor: ativo ? 'true' : 'false' },
      create: { chave: PARAM_RESTRICAO, valor: ativo ? 'true' : 'false', descricao: 'Restrição de entrada por endereço IP (Administração > Registro de acesso e IPs)' },
    });
    return { ativo };
  }
}
