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
    const smtp = this.mail.configurado;
    const msToken = tem(env.MS_TENANT_ID) && tem(env.MS_CLIENT_ID) && tem(env.MS_CLIENT_SECRET);
    return [
      { id: 'banco', nome: 'Banco de dados', para_que: 'Todos os dados do InTAX.', estado: banco, detalhe: banco === 'ATIVO' ? 'Respondendo.' : 'Não respondeu agora.' },
      { id: 'armazenamento', nome: 'Armazenamento de arquivos', para_que: 'XML, arquivos das empresas, anexos e downloads.', estado: armazenamento, detalhe: armazenamento === 'ATIVO' ? 'Respondendo.' : 'Não respondeu agora.' },
      { id: 'email', nome: 'E-mail (SMTP)', para_que: 'Comunicados, avisos por e-mail, newsletter e redefinição de senha.', estado: smtp ? 'ATIVO' : 'NAO_CONFIGURADO', detalhe: smtp ? `Ligado${msToken ? ' com autenticação por token (Microsoft 365)' : ' com usuário e senha'}; remetente ${this.mail.remetente.replace(/<.*>/, '').trim() || 'configurado'}.` : 'Falta configurar SMTP_HOST (e usuário/senha ou token) no servidor.' },
      { id: 'cofre', nome: 'Cofre de certificados A1', para_que: 'Guarda o certificado dos clientes cifrado para a captura de XML.', estado: tem(env.CERT_VAULT_KEY) || tem(env.CERT_VAULT_KEYS) ? 'ATIVO' : 'NAO_CONFIGURADO', detalhe: tem(env.CERT_VAULT_KEY) || tem(env.CERT_VAULT_KEYS) ? 'Chave de cifra configurada.' : 'Falta a chave CERT_VAULT_KEY no servidor.' },
      { id: 'captura', nome: 'Captura automática de XML (SEFAZ e ADN)', para_que: 'Busca NF-e, CT-e e NFS-e das empresas no período escolhido.', estado: String(env.CAPTURA_XML_AGENDADOR ?? '').toLowerCase() === 'on' ? 'ATIVO' : 'DESLIGADO', detalhe: String(env.CAPTURA_XML_AGENDADOR ?? '').toLowerCase() === 'on' ? 'Agendador ligado neste servidor.' : 'Agendador desligado (só liga no servidor de produção, para a SEFAZ não bloquear por consulta em dobro).' },
      { id: 'processos', nome: 'Processos recorrentes', para_que: 'Cria as tarefas dos processos todo dia às 05:30.', estado: String(env.TAREFAS_AGENDADOR ?? '').toLowerCase() === 'off' ? 'DESLIGADO' : 'ATIVO', detalhe: String(env.TAREFAS_AGENDADOR ?? '').toLowerCase() === 'off' ? 'Desligado por TAREFAS_AGENDADOR=off.' : 'Ligado.' },
      { id: 'ia', nome: 'Inteligência artificial (Gemini)', para_que: 'Resumo executivo por IA no painel.', estado: tem(env.GEMINI_API_KEY) ? 'ATIVO' : 'NAO_CONFIGURADO', detalhe: tem(env.GEMINI_API_KEY) ? 'Chave configurada.' : 'Sem chave: o resumo usa o texto padrão.' },
      { id: 'cnpj', nome: 'Consulta pública de CNPJ e malha do IBGE', para_que: 'Dados do CNPJ (CNAE, porte, município) e o ponto do município no mapa.', estado: 'ATIVO', detalhe: 'Serviços públicos, sem chave (BrasilAPI e IBGE).' },
      { id: 'serpro', nome: 'Serpro Integra Contador', para_que: 'Monitoramento fiscal: situação no e-CAC, declarações, guias, mensagens, certidões, parcelamentos e procurações.', estado: 'PREVISTO', fase: '3', detalhe: 'Depende do contrato do Integra Contador, do certificado do escritório e da procuração eletrônica de cada cliente.' },
      { id: 'whatsapp', nome: 'WhatsApp (agente do escritório)', para_que: 'Comunicados, guias e avisos por WhatsApp, pelo mesmo agente que o escritório já usa.', estado: 'PREVISTO', fase: '4', detalhe: 'Depende do endereço de envio do agente de WhatsApp.' },
    ];
  }
}
