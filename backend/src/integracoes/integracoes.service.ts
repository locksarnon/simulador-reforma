import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export type Estado = 'ATIVO' | 'NAO_CONFIGURADO' | 'DESLIGADO' | 'COM_PROBLEMA' | 'PREVISTO';
export type Integracao = { id: string; nome: string; para_que: string; estado: Estado; detalhe: string; fase?: string };

const tem = (v: string | undefined) => !!v && v.trim().length > 0;

/**
 * Estado das conexões do InTAX. Mostra só se está ligada e o que falta; nunca o valor de chave, senha ou token.
 * As integrações das fases 3 e 4 (Serpro e WhatsApp) aparecem como "previstas" com o que depende.
 */
@Injectable()
export class IntegracoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  async estado(env: NodeJS.ProcessEnv = process.env): Promise<Integracao[]> {
    let banco: Estado = 'ATIVO';
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { banco = 'COM_PROBLEMA'; }
    let armazenamento: Estado = 'ATIVO';
    try { await this.storage.getPresignedUrl('teste-de-conexao', 60); } catch { armazenamento = 'COM_PROBLEMA'; }
    // Claude Code da VPS (ponte): se o login expirar, o assistente cai para o Gemini sem aviso; aqui o aviso aparece.
    let ponte: { ok: boolean; logado: boolean | null; erro?: string } | null = null;
    if (tem(env.CLAUDE_BRIDGE_URL) && tem(env.CLAUDE_BRIDGE_TOKEN) && String(env.IA_ASSISTENTE ?? '').toLowerCase() !== 'gemini') {
      try {
        const r = await fetch(`${String(env.CLAUDE_BRIDGE_URL).trim().replace(/\/+$/, '')}/saude`, { signal: AbortSignal.timeout(3000) });
        const j = (await r.json()) as { logado?: boolean | null; erro?: string };
        ponte = { ok: r.ok, logado: j.logado ?? null, erro: j.erro };
      } catch { ponte = { ok: false, logado: null }; }
    }
    const smtp = this.mail.configurado;
    const msToken = tem(env.MS_TENANT_ID) && tem(env.MS_CLIENT_ID) && tem(env.MS_CLIENT_SECRET);
    let modoSerpro: string | null = null;
    try { modoSerpro = (await this.prisma.parametroSistema.findUnique({ where: { chave: 'integra_contador_modo' } }))?.valor ?? null; } catch { modoSerpro = null; }
    const contratoNaTela = (await Promise.resolve().then(() => this.prisma.contratoIntegraContador.count()).catch(() => 0)) > 0;
    const contratoSerpro = contratoNaTela || tem(env.SERPRO_CONSUMER_KEY) && tem(env.SERPRO_CONSUMER_SECRET) && (tem(env.SERPRO_CERT_PFX_BASE64) || tem(env.SERPRO_CERT_PFX_ARQUIVO)) && tem(env.SERPRO_CONTRATANTE_CNPJ);
    const serpro: Integracao = modoSerpro === 'PRODUCAO'
      ? { id: 'serpro', nome: 'Serpro Integra Contador', para_que: 'Monitoramento fiscal: situação no e-CAC, declarações, guias, caixa postal, parcelamentos, MEI e procuração.', estado: 'ATIVO', detalhe: 'Em produção, com o contrato do escritório.' }
      : modoSerpro === 'DEMONSTRACAO'
        ? { id: 'serpro', nome: 'Serpro Integra Contador', para_que: 'Monitoramento fiscal: situação no e-CAC, declarações, guias, caixa postal, parcelamentos, MEI e procuração.', estado: 'NAO_CONFIGURADO', detalhe: `Modo demonstração (dados fictícios oficiais do Serpro).${contratoSerpro ? ' O contrato do escritório já está configurado: pode passar para produção.' : ' Para dados reais, configure o contrato do escritório no quadro abaixo.'}` }
        : { id: 'serpro', nome: 'Serpro Integra Contador', para_que: 'Monitoramento fiscal: situação no e-CAC, declarações, guias, caixa postal, parcelamentos, MEI e procuração.', estado: modoSerpro === 'DESLIGADO' ? 'DESLIGADO' : 'PREVISTO', fase: '3', detalhe: contratoSerpro ? 'Contrato configurado; ligue no quadro do monitoramento abaixo.' : 'Pode ser ligado em modo demonstração agora; para dados reais, depende do contrato do Integra Contador.' };
    return [
      { id: 'banco', nome: 'Banco de dados', para_que: 'Todos os dados do InTAX.', estado: banco, detalhe: banco === 'ATIVO' ? 'Respondendo.' : 'Não respondeu agora.' },
      { id: 'armazenamento', nome: 'Armazenamento de arquivos', para_que: 'XML, arquivos das empresas, anexos e downloads.', estado: armazenamento, detalhe: armazenamento === 'ATIVO' ? 'Respondendo.' : 'Não respondeu agora.' },
      { id: 'email', nome: 'E-mail (SMTP)', para_que: 'Comunicados, avisos por e-mail, newsletter e redefinição de senha.', estado: smtp ? 'ATIVO' : 'NAO_CONFIGURADO', detalhe: smtp ? `Ligado${msToken ? ' com autenticação por token (Microsoft 365)' : ' com usuário e senha'}; remetente ${this.mail.remetente.replace(/<.*>/, '').trim() || 'configurado'}.` : 'Falta configurar SMTP_HOST (e usuário/senha ou token) no servidor.' },
      { id: 'cofre', nome: 'Cofre de certificados A1', para_que: 'Guarda o certificado dos clientes cifrado para a captura de XML.', estado: tem(env.CERT_VAULT_KEY) || tem(env.CERT_VAULT_KEYS) ? 'ATIVO' : 'NAO_CONFIGURADO', detalhe: tem(env.CERT_VAULT_KEY) || tem(env.CERT_VAULT_KEYS) ? 'Chave de cifra configurada.' : 'Falta a chave CERT_VAULT_KEY no servidor.' },
      { id: 'captura', nome: 'Captura automática de XML (SEFAZ e ADN)', para_que: 'Busca NF-e, CT-e e NFS-e das empresas no período escolhido.', estado: String(env.CAPTURA_XML_AGENDADOR ?? '').toLowerCase() === 'on' ? 'ATIVO' : 'DESLIGADO', detalhe: String(env.CAPTURA_XML_AGENDADOR ?? '').toLowerCase() === 'on' ? 'Agendador ligado neste servidor.' : 'Agendador desligado (só liga no servidor de produção, para a SEFAZ não bloquear por consulta em dobro).' },
      { id: 'processos', nome: 'Processos recorrentes', para_que: 'Cria as tarefas dos processos todo dia às 05:30.', estado: String(env.TAREFAS_AGENDADOR ?? '').toLowerCase() === 'off' ? 'DESLIGADO' : 'ATIVO', detalhe: String(env.TAREFAS_AGENDADOR ?? '').toLowerCase() === 'off' ? 'Desligado por TAREFAS_AGENDADOR=off.' : 'Ligado.' },
      { id: 'ia', nome: 'Inteligência artificial (Gemini)', para_que: 'Resumo executivo por IA no painel.', estado: tem(env.GEMINI_API_KEY) ? 'ATIVO' : 'NAO_CONFIGURADO', detalhe: tem(env.GEMINI_API_KEY) ? 'Chave configurada.' : 'Sem chave: o resumo usa o texto padrão.' },
      { id: 'ia-assistente', nome: 'Assistente tributário (Claude)', para_que: 'Responde as perguntas do assistente e a pesquisa aprofundada com fontes externas.', estado: ponte && (!ponte.ok || ponte.logado === false) ? 'COM_PROBLEMA' : tem(env.CLAUDE_BRIDGE_URL) && tem(env.CLAUDE_BRIDGE_TOKEN) && String(env.IA_ASSISTENTE ?? '').toLowerCase() !== 'gemini' ? 'ATIVO' : tem(env.ANTHROPIC_API_KEY) && String(env.IA_ASSISTENTE ?? '').toLowerCase() !== 'gemini' ? 'ATIVO' : tem(env.GEMINI_API_KEY) ? 'ATIVO' : 'NAO_CONFIGURADO', detalhe: ponte && !ponte.ok ? 'A ponte do Claude Code não respondeu: o assistente está usando o Gemini. Veja o serviço intax-claude-bridge na VPS.' : ponte && ponte.logado === false ? 'O login do Claude Code da VPS expirou: o assistente está usando o Gemini. Refaça o login (claude auth login --claudeai, como usuário claude na VPS).' : tem(env.CLAUDE_BRIDGE_URL) && tem(env.CLAUDE_BRIDGE_TOKEN) && String(env.IA_ASSISTENTE ?? '').toLowerCase() !== 'gemini' ? 'Claude Code da VPS (créditos da conta logada); a API e o Gemini ficam de reserva.' : tem(env.ANTHROPIC_API_KEY) && String(env.IA_ASSISTENTE ?? '').toLowerCase() !== 'gemini' ? `Claude (${env.ANTHROPIC_MODEL || 'claude-fable-5-2'}); o Gemini fica de reserva${tem(env.GEMINI_API_KEY) ? '' : ' se houver chave'}.` : tem(env.GEMINI_API_KEY) ? 'Usando o Gemini. Para usar o Claude, coloque ANTHROPIC_API_KEY no servidor.' : 'Sem chave de IA: o assistente só mostra os dispositivos achados.' },
      { id: 'cnpj', nome: 'Consulta pública de CNPJ e malha do IBGE', para_que: 'Dados do CNPJ (CNAE, porte, município) e o ponto do município no mapa.', estado: 'ATIVO', detalhe: 'Serviços públicos, sem chave (BrasilAPI e IBGE).' },
      serpro,
      { id: 'whatsapp', nome: 'WhatsApp (agente do escritório)', para_que: 'Comunicados, guias e avisos por WhatsApp, pelo mesmo agente que o escritório já usa.', estado: 'PREVISTO', fase: '4', detalhe: 'Depende do endereço de envio do agente de WhatsApp.' },
    ];
  }
}
