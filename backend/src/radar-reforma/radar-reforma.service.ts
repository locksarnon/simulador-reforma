import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const PRIORIDADES_VALIDAS = ['Alta', 'Média', 'Baixa'];

/**
 * Semana ISO (ex: "2026-W38") — chave usada para nunca duplicar itens de uma
 * mesma rodada, seja ela manual ("Gerar agora" duas vezes na mesma semana) ou
 * automática (execução semanal do Cron).
 */
function semanaReferenciaAtual(): string {
  const d = new Date();
  const alvo = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaSemana = alvo.getUTCDay() || 7;
  alvo.setUTCDate(alvo.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(alvo.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((alvo.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${alvo.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/**
 * Prompt de analista tributário definido pelo usuário — adaptado para pedir
 * JSON estrito (em vez de tabela em texto) para permitir parsing confiável.
 * Regra inegociável, reforçada aqui: nunca inventar prazo/alíquota/norma —
 * o próprio modelo deve escrever "A confirmar" quando não tiver certeza.
 */
function montarPrompt(dataReferencia: Date): string {
  const dataFmt = dataReferencia.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `Você é um analista tributário especializado em acompanhar a Reforma Tributária brasileira (EC 132/2023 e legislação complementar, incluindo a LC 214/2025 e normas subsequentes). Sua tarefa é montar um radar operacional de novidades e atualizações, destinado ao uso diário do time fiscal de uma empresa, com foco em ação prática — não em análise acadêmica.

Data de hoje: ${dataFmt}. Use a busca na web para levantar SOMENTE novidades reais publicadas nos últimos 7 dias contados a partir de hoje.

Escopo de monitoramento (cubra todos os temas abaixo, sempre que houver atualização real e recente):
- Regulamentação da CBS, IBS e Imposto Seletivo (leis complementares, decretos, instruções normativas, portarias)
- Atos do Comitê Gestor do IBS (CG-IBS) e da Receita Federal
- Cronograma de transição (alíquotas de teste, período de convivência com o sistema atual, prazos de adaptação por setor)
- Split payment e mecanismos de recolhimento no destino
- Obrigações acessórias novas ou alteradas (leiautes fiscais, SPED, notas fiscais, EFD)
- Regimes diferenciados e exceções setoriais (cesta básica, saúde, educação, Simples Nacional, ZFM, etc.)
- Créditos tributários, não cumulatividade e regras de transição de créditos do PIS/COFINS/ICMS/ISS
- Posicionamentos de estados e municípios sobre a transição
- Jurisprudência relevante (STF, STJ, tribunais administrativos) sobre a reforma
- Alterações em sistemas fiscais/ERP exigidas pela adaptação (quando divulgadas por fornecedores ou órgãos)
- Prazos legais e datas-limite de conformidade

Regras de qualidade (inegociáveis):
- Priorize fontes oficiais (Diário Oficial da União, Receita Federal, Comitê Gestor do IBS, Congresso Nacional, Confaz, tribunais) e veículos especializados confiáveis em segundo plano.
- NUNCA invente prazos, alíquotas ou textos normativos — se a informação não puder ser confirmada pela busca, escreva literalmente "A confirmar" no campo correspondente em vez de adivinhar.
- Diferencie claramente o que já está em vigor, o que foi aprovado mas ainda não vigora, e o que é apenas proposta/discussão em tramitação (campo status_normativo).
- Se não houver nenhuma novidade relevante e verificável no período, devolva "itens": [] em vez de forçar itens de baixo valor.

Responda EXCLUSIVAMENTE com um objeto JSON válido (sem markdown, sem texto antes ou depois), no formato exato:
{
  "resumo_executivo": "até 5 linhas destacando o que exige atenção imediata do time (ou frase única dizendo que não há novidades relevantes na semana)",
  "itens": [
    {
      "data_publicacao": "AAAA-MM-DD ou null se não houver data exata",
      "fonte_nome": "nome da fonte",
      "fonte_url": "URL oficial ou null",
      "categoria": "um dos temas listados acima",
      "resumo": "2-3 frases objetivas, sem jargão excessivo",
      "impacto_pratico": "o que muda no dia a dia da operação fiscal",
      "prazo_vigencia": "quando entra em vigor ou vence, ou 'A confirmar'",
      "status_normativo": "Em vigor | Aprovado, aguardando vigência | Proposta em tramitação | A confirmar",
      "acao_recomendada": "o que o time precisa fazer, e até quando",
      "prioridade": "Alta | Média | Baixa"
    }
  ]
}
Ordene "itens" por prioridade (Alta primeiro) e, dentro da mesma prioridade, pelo prazo mais próximo.`;
}

type ItemGerado = {
  data_publicacao?: string | null;
  fonte_nome?: string | null;
  fonte_url?: string | null;
  categoria: string;
  resumo: string;
  impacto_pratico?: string | null;
  prazo_vigencia?: string | null;
  status_normativo?: string | null;
  acao_recomendada?: string | null;
  prioridade: string;
};

function extrairJson(texto: string): { resumo_executivo: string; itens: ItemGerado[] } {
  const semFences = texto.replace(/```json\s*|```\s*/g, '').trim();
  const inicio = semFences.indexOf('{');
  const fim = semFences.lastIndexOf('}');
  if (inicio === -1 || fim === -1) throw new Error('Resposta do Gemini não contém JSON reconhecível.');
  const parsed = JSON.parse(semFences.slice(inicio, fim + 1));
  if (!Array.isArray(parsed.itens)) throw new Error('Campo "itens" ausente ou inválido na resposta do Gemini.');
  return { resumo_executivo: String(parsed.resumo_executivo || ''), itens: parsed.itens };
}

@Injectable()
export class RadarReformaService {
  private readonly logger = new Logger(RadarReformaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Toda segunda-feira às 06h (horário de Brasília). */
  @Cron('0 6 * * 1', { timeZone: 'America/Sao_Paulo' })
  async gerarAgendado() {
    if (!this.config.get<string>('GEMINI_API_KEY')) {
      this.logger.warn('GEMINI_API_KEY não configurada — pulando geração agendada do radar.');
      return;
    }
    await this.gerar('AGENDADO');
  }

  async gerar(disparo: 'MANUAL' | 'AGENDADO' = 'MANUAL') {
    const semanaReferencia = semanaReferenciaAtual();
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada no servidor.');
    }
    const modelo = this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';

    try {
      const resposta = await this.chamarGemini(apiKey, modelo, montarPrompt(new Date()));
      const { resumo_executivo, itens } = extrairJson(resposta);

      const itensValidos = itens.filter((it) => it && it.categoria && it.resumo && it.prioridade);
      for (const it of itensValidos) {
        if (!PRIORIDADES_VALIDAS.includes(it.prioridade)) it.prioridade = 'Média';
      }

      await this.prisma.$transaction([
        this.prisma.radarReformaItem.deleteMany({ where: { semana_referencia: semanaReferencia } }),
        ...itensValidos.map((it) =>
          this.prisma.radarReformaItem.create({
            data: {
              semana_referencia: semanaReferencia,
              data_publicacao: it.data_publicacao ? new Date(it.data_publicacao) : null,
              data_publicacao_txt: it.data_publicacao || null,
              fonte_nome: it.fonte_nome || null,
              fonte_url: it.fonte_url || null,
              categoria: it.categoria,
              resumo: it.resumo,
              impacto_pratico: it.impacto_pratico || null,
              prazo_vigencia: it.prazo_vigencia || null,
              status_normativo: it.status_normativo || null,
              acao_recomendada: it.acao_recomendada || null,
              prioridade: it.prioridade,
            },
          }),
        ),
        this.prisma.radarReformaExecucao.upsert({
          where: { semana_referencia: semanaReferencia },
          create: {
            semana_referencia: semanaReferencia,
            resumo_executivo,
            status: 'OK',
            itens_gerados: itensValidos.length,
            disparo,
          },
          update: {
            resumo_executivo,
            status: 'OK',
            erro: null,
            itens_gerados: itensValidos.length,
            disparo,
            executado_em: new Date(),
          },
        }),
      ]);

      return { semana_referencia: semanaReferencia, itens_gerados: itensValidos.length, resumo_executivo };
    } catch (err) {
      const mensagem = (err as Error).message;
      this.logger.error(`Falha ao gerar radar (${semanaReferencia}): ${mensagem}`);
      await this.prisma.radarReformaExecucao.upsert({
        where: { semana_referencia: semanaReferencia },
        create: { semana_referencia: semanaReferencia, status: 'ERRO', erro: mensagem, disparo },
        update: { status: 'ERRO', erro: mensagem, disparo, executado_em: new Date() },
      });
      throw err;
    }
  }

  private async chamarGemini(apiKey: string, modelo: string, prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(90000),
    });
    const body = await resp.json();
    if (!resp.ok) {
      throw new Error(`Gemini API ${resp.status}: ${body?.error?.message || JSON.stringify(body)}`);
    }
    const texto = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    if (!texto) throw new Error('Gemini retornou resposta vazia.');
    return texto;
  }
}
