/**
 * Lê a resposta de cada serviço do Integra Contador e devolve o resumo da tela: nível (OK, ATENCAO, CRITICO ou INFO), uma frase, destaques
 * e, quando há lista, uma tabela. Os PDF (guias, recibos, relatórios) saem da resposta e vão para o armazenamento.
 */
export type Nivel = 'OK' | 'ATENCAO' | 'CRITICO' | 'INFO';
export type Coluna = { chave: string; rotulo: string; tipo?: 'data' | 'periodo' | 'moeda' | 'texto' };
export type Resumo = {
  nivel: Nivel;
  titulo: string;
  destaques: { rotulo: string; valor: string }[];
  tabela?: { colunas: Coluna[]; linhas: Record<string, unknown>[] };
};
export type ArquivoExtraido = { campo: string; nome: string; base64: string };

const PDF = /^JVBER/;
const ehBase64Longo = (v: unknown): v is string => typeof v === 'string' && v.length > 40 && PDF.test(v.slice(0, 8));
const moeda = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v ?? '—'));
/** 20240131 ou 20240131101112 → 31/01/2024; 202401 → 01/2024. */
export function dataBr(v: unknown): string {
  const s = String(v ?? '').replace(/\D/g, '');
  if (s.length >= 8) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  if (s.length === 6) return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
  return String(v ?? '—') || '—';
}

/**
 * Tira os PDF em base64 da resposta (qualquer campo cujo texto comece por "%PDF", e o "dados" inteiro quando ele é o PDF) e põe no lugar
 * a referência {arquivo: n}. O nome vem do campo "nomeArquivo..." vizinho, quando há.
 */
export function extrairArquivos(dados: unknown, chave: string): { dados: unknown; arquivos: ArquivoExtraido[] } {
  const arquivos: ArquivoExtraido[] = [];
  const guardar = (campo: string, base64: string, nome?: unknown) => {
    const n = arquivos.length;
    const limpo = typeof nome === 'string' && nome.trim() ? nome.trim().replace(/[^\w.-]+/g, '_') : `${chave}-${campo}${n ? `-${n + 1}` : ''}.pdf`;
    arquivos.push({ campo, nome: limpo.toLowerCase().endsWith('.pdf') ? limpo : `${limpo}.pdf`, base64 });
    return { arquivo: n, nome: arquivos[n].nome };
  };
  const visitar = (v: unknown, campo: string): unknown => {
    if (ehBase64Longo(v)) return guardar(campo, v);
    if (Array.isArray(v)) return v.map((x, i) => visitar(x, `${campo}-${i + 1}`));
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        if (ehBase64Longo(x)) {
          const nomeVizinho = o[`nomeArquivo${k.replace(/^pdf/i, '')}`] ?? o.nomeArquivo ?? o[`nome${k[0].toUpperCase()}${k.slice(1)}`];
          out[k] = guardar(k, x, nomeVizinho);
        } else out[k] = visitar(x, k);
      }
      return out;
    }
    return v;
  };
  // O Serpro às vezes manda o "dados" como texto JSON mal formado (ex.: falta uma vírgula); o PDF ainda é achado pelo nome do campo.
  if (typeof dados === 'string' && !PDF.test(dados.slice(0, 8)) && /JVBER/.test(dados)) {
    let resto = dados;
    for (const m of dados.matchAll(/"(\w*pdf\w*)"\s*:\s*"(JVBER[A-Za-z0-9+/=]+)"/gi)) {
      const ref = guardar(m[1], m[2]);
      resto = resto.replace(m[2], `[arquivo ${ref.arquivo + 1}]`);
    }
    return { dados: resto, arquivos };
  }
  return { dados: visitar(dados, 'documento'), arquivos };
}

const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/** Resumo por serviço. `sistema` e `servico` são os do catálogo; `dados` já sem os PDF. */
export function interpretar(sistema: string, servico: string, dados: unknown, arquivos: ArquivoExtraido[] = [], rotulo = ''): Resumo {
  const temPdf = arquivos.length > 0;
  const comPdf = (titulo: string): Resumo => ({ nivel: temPdf ? 'OK' : 'ATENCAO', titulo: temPdf ? titulo : 'O Serpro não devolveu o documento.', destaques: [] });
  const d = (dados ?? {}) as Record<string, unknown>;

  if (sistema === 'SITFIS') return comPdf('Relatório de situação fiscal emitido. Abra o PDF para ver as pendências.');
  if (sistema === 'DTE') {
    const opt = Number(d.indicadorEnquadramento) === 1;
    return { nivel: 'INFO', titulo: String(d.statusEnquadramento || (opt ? 'Optante do DTE' : 'Não optante do DTE')), destaques: [{ rotulo: 'DTE', valor: opt ? 'Optante: a caixa postal vale como intimação' : 'Não optante' }] };
  }
  if (sistema === 'REGIMEAPURACAO') {
    const anos = lista(dados);
    return { nivel: 'INFO', titulo: anos.length ? `Regime em ${anos[0].anoCalendario}: ${anos[0].regimeApurado}` : 'Sem opção registrada.', destaques: [], tabela: { colunas: [{ chave: 'anoCalendario', rotulo: 'Ano' }, { chave: 'regimeApurado', rotulo: 'Regime' }], linhas: anos } };
  }
  if (sistema === 'PGDASD' && servico === 'CONSDECLARACAO13') {
    const linhas = lista(d.periodos).map((p) => {
      const ops = lista(p.operacoes);
      const decl = ops.map((o) => o.indiceDeclaracao as Record<string, unknown> | null).filter(Boolean) as Record<string, unknown>[];
      const das = ops.map((o) => o.indiceDas as Record<string, unknown> | null).filter(Boolean) as Record<string, unknown>[];
      const ultima = decl[decl.length - 1];
      const malha = decl.some((x) => String(x.malha ?? '').trim());
      return {
        periodo: p.periodoApuracao, declaracoes: decl.length, ultima: ultima?.numeroDeclaracao ?? '—', transmissao: ultima?.dataHoraTransmissao ?? '',
        das: das.length, dasPago: das.length ? (das.some((x) => x.dasPago) ? 'Sim' : 'Não') : '—', malha: malha ? 'Em malha' : '—',
      };
    });
    const semDecl = linhas.filter((l) => !l.declaracoes).length;
    const naoPagos = linhas.filter((l) => l.dasPago === 'Não').length;
    const emMalha = linhas.filter((l) => l.malha !== '—').length;
    return {
      nivel: emMalha ? 'CRITICO' : semDecl || naoPagos ? 'ATENCAO' : 'OK',
      titulo: [
        `${linhas.length} competência(s) em ${d.anocalendario ?? ''}`,
        semDecl ? `${semDecl} sem declaração` : '',
        naoPagos ? `${naoPagos} com DAS não pago` : '',
        emMalha ? `${emMalha} em malha` : '',
      ].filter(Boolean).join('; ') + '.',
      destaques: [{ rotulo: 'Competências', valor: String(linhas.length) }, { rotulo: 'Sem declaração', valor: String(semDecl) }, { rotulo: 'DAS não pago', valor: String(naoPagos) }, { rotulo: 'Em malha', valor: String(emMalha) }],
      tabela: { colunas: [{ chave: 'periodo', rotulo: 'Competência', tipo: 'periodo' }, { chave: 'declaracoes', rotulo: 'Declarações' }, { chave: 'ultima', rotulo: 'Última declaração' }, { chave: 'transmissao', rotulo: 'Transmitida em', tipo: 'data' }, { chave: 'das', rotulo: 'DAS gerados' }, { chave: 'dasPago', rotulo: 'DAS pago' }, { chave: 'malha', rotulo: 'Malha' }], linhas },
    };
  }
  if (sistema === 'SICALC' && servico === 'CONSOLIDARGERARDARF51') {
    const c = (d.consolidado ?? {}) as Record<string, unknown>;
    return {
      nivel: temPdf ? 'OK' : 'ATENCAO',
      titulo: temPdf ? `DARF de ${moeda(c.valorTotalConsolidado)} calculado para ${dataBr(String(c.dataArrecadacaoConsolidacao ?? '').slice(0, 10).replace(/-/g, ''))}.` : 'O DARF não foi gerado.',
      destaques: [
        { rotulo: 'Principal', valor: moeda(c.valorPrincipalMoedaCorrente) },
        { rotulo: 'Multa', valor: `${moeda(c.valorMultaMora)}${c.percentualMultaMora !== undefined ? ` (${c.percentualMultaMora}%)` : ''}` },
        { rotulo: 'Juros', valor: `${moeda(c.valorJuros)}${c.percentualJuros !== undefined ? ` (${c.percentualJuros}%)` : ''}` },
        { rotulo: 'Total', valor: moeda(c.valorTotalConsolidado) },
        ...(d.numeroDocumento ? [{ rotulo: 'Número do documento', valor: String(d.numeroDocumento) }] : []),
        ...(c.dataValidadeCalculo ? [{ rotulo: 'Cálculo válido até', valor: dataBr(String(c.dataValidadeCalculo).slice(0, 10).replace(/-/g, '')) }] : []),
      ],
    };
  }
  if (sistema === 'PGDASD' && servico === 'GERARDAS12') {
    const g = lista(dados)[0] ?? {};
    const det = (g.detalhamentoDas ?? {}) as Record<string, unknown>;
    const val = (det.valores ?? {}) as Record<string, unknown>;
    return {
      nivel: temPdf ? 'OK' : 'ATENCAO', titulo: temPdf ? `DAS de ${dataBr(det.periodoApuracao)} gerado: ${moeda(val.total)}, vence em ${dataBr(det.dataVencimento)}.` : 'O DAS não foi gerado.',
      destaques: [{ rotulo: 'Número', valor: String(det.numeroDocumento ?? '—') }, { rotulo: 'Total', valor: moeda(val.total) }, { rotulo: 'Vencimento', valor: dataBr(det.dataVencimento) }, ...(det.observacao1 ? [{ rotulo: 'Observação', valor: String(det.observacao1) }] : [])],
      tabela: { colunas: [{ chave: 'denominacao', rotulo: 'Tributo' }, { chave: 'total', rotulo: 'Total', tipo: 'moeda' }], linhas: lista(det.composicao).map((c) => ({ denominacao: c.denominacao, total: (c.valores as Record<string, unknown>)?.total })) },
    };
  }
  if (sistema === 'PGMEI' && servico === 'DIVIDAATIVA24') {
    const debitos = lista(dados);
    const total = debitos.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    return {
      nivel: debitos.length ? 'CRITICO' : 'OK', titulo: debitos.length ? `${debitos.length} débito(s) em dívida ativa, total ${moeda(total)}.` : 'Nenhum débito em dívida ativa no ano.',
      destaques: [{ rotulo: 'Débitos', valor: String(debitos.length) }, { rotulo: 'Total', valor: moeda(total) }],
      tabela: { colunas: [{ chave: 'periodoApuracao', rotulo: 'Competência', tipo: 'periodo' }, { chave: 'tributo', rotulo: 'Tributo' }, { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }, { chave: 'situacaoDebito', rotulo: 'Situação' }], linhas: debitos },
    };
  }
  if (sistema === 'DEFIS' && servico === 'CONSDECLARACAO142') {
    const decl = lista(dados);
    return { nivel: decl.length ? 'OK' : 'ATENCAO', titulo: decl.length ? `${decl.length} DEFIS entregue(s); a mais recente é de ${Math.max(...decl.map((x) => Number(x.anoCalendario) || 0))}.` : 'Nenhuma DEFIS entregue.', destaques: [], tabela: { colunas: [{ chave: 'anoCalendario', rotulo: 'Ano' }, { chave: 'idDefis', rotulo: 'Número' }, { chave: 'dataHora', rotulo: 'Entregue em', tipo: 'data' }], linhas: decl } };
  }
  if (sistema === 'MIT' && servico === 'LISTAAPURACOES317') {
    const ap = lista(d.Apuracoes ?? dados);
    const SIT: Record<string, string> = { 1: 'Em edição', 2: 'Em encerramento', 3: 'Encerrada', 4: 'Erro no encerramento' };
    const linhas = ap.map((a) => ({ ...a, situacaoTexto: SIT[String(a.situacao)] ?? String(a.situacao ?? '—') }));
    const abertas = ap.filter((a) => Number(a.situacao) !== 3);
    return { nivel: abertas.length ? 'ATENCAO' : 'OK', titulo: `${linhas.length} apuração(ões); ${abertas.length} não encerrada(s).`, destaques: [], tabela: { colunas: [{ chave: 'periodoApuracao', rotulo: 'Competência', tipo: 'periodo' }, { chave: 'situacaoTexto', rotulo: 'Situação' }, { chave: 'dataEncerramento', rotulo: 'Encerrada em', tipo: 'data' }, { chave: 'valorTotalApurado', rotulo: 'Valor apurado', tipo: 'moeda' }], linhas } };
  }
  if (sistema === 'CAIXAPOSTAL' && servico === 'MSGCONTRIBUINTE61') {
    const c = lista(d.conteudo)[0] ?? {};
    const msgs = lista(c.listaMensagens);
    const naoLidas = msgs.filter((m) => String(m.indicadorLeitura) === '0');
    const relevantes = naoLidas.filter((m) => String(m.relevancia) === '1');
    const linhas = msgs.map((m) => ({ data: m.dataEnvio, assunto: String(m.assuntoModelo ?? '').replace(/\+\+VARIAVEL\+\+/g, String(m.valorParametroAssunto ?? '')), origem: m.descricaoOrigem, lida: String(m.indicadorLeitura) === '0' ? 'Não lida' : 'Lida', relevante: String(m.relevancia) === '1' ? 'Sim' : 'Não', isn: m.isn }));
    return {
      nivel: relevantes.length ? 'CRITICO' : naoLidas.length ? 'ATENCAO' : 'OK',
      titulo: `${msgs.length} mensagem(ns); ${naoLidas.length} não lida(s)${relevantes.length ? `, ${relevantes.length} relevante(s)` : ''}.`,
      destaques: [{ rotulo: 'Mensagens', valor: String(c.quantidadeMensagens ?? msgs.length) }, { rotulo: 'Não lidas', valor: String(naoLidas.length) }, { rotulo: 'Relevantes não lidas', valor: String(relevantes.length) }],
      tabela: { colunas: [{ chave: 'data', rotulo: 'Data', tipo: 'data' }, { chave: 'assunto', rotulo: 'Assunto' }, { chave: 'origem', rotulo: 'Origem' }, { chave: 'lida', rotulo: 'Leitura' }, { chave: 'relevante', rotulo: 'Relevante' }], linhas },
    };
  }
  if (sistema === 'CAIXAPOSTAL' && servico === 'INNOVAMSG63') {
    const ind = String((lista(d.conteudo)[0] ?? {}).indicadorMensagensNovas ?? '0');
    const TXT: Record<string, string> = { 0: 'Sem mensagens novas.', 1: 'Há mensagens novas.', 2: 'Há mensagens novas relevantes.' };
    return { nivel: ind === '2' ? 'CRITICO' : ind === '1' ? 'ATENCAO' : 'OK', titulo: TXT[ind] ?? `Indicador ${ind}.`, destaques: [] };
  }
  if (sistema === 'CCMEI' && servico === 'DADOSCCMEI122') {
    const enq = (d.enquadramento ?? {}) as Record<string, unknown>;
    const ativa = String(d.situacaoCadastralVigente || '').toUpperCase() === 'ATIVA';
    return {
      nivel: ativa && enq.optanteMei ? 'OK' : 'CRITICO', titulo: `${d.situacaoCadastralVigente ?? '—'} · ${enq.situacao ?? '—'}`,
      destaques: [{ rotulo: 'Nome empresarial', valor: String(d.nomeEmpresarial ?? '—') }, { rotulo: 'Início', valor: dataBr(d.dataInicioAtividades) }, { rotulo: 'Optante do MEI', valor: enq.optanteMei ? 'Sim' : 'Não' }],
      tabela: { colunas: [{ chave: 'dataInicio', rotulo: 'Início' }, { chave: 'dataFim', rotulo: 'Fim' }], linhas: lista(enq.periodosMei) },
    };
  }
  if (sistema === 'PROCURACOES') {
    const procs = lista(dados);
    const hoje = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    const vigentes = procs.filter((p) => Number(p.dtexpiracao) >= hoje);
    const linhas = procs.map((p) => ({ expira: p.dtexpiracao, sistemas: lista(p.sistemas).join(', '), situacao: Number(p.dtexpiracao) >= hoje ? 'Vigente' : 'Vencida' }));
    return { nivel: vigentes.length ? 'OK' : 'CRITICO', titulo: vigentes.length ? `${vigentes.length} procuração(ões) vigente(s).` : procs.length ? 'Procuração vencida: peça ao cliente que renove no e-CAC.' : 'Sem procuração para o escritório.', destaques: [], tabela: { colunas: [{ chave: 'expira', rotulo: 'Vale até', tipo: 'data' }, { chave: 'situacao', rotulo: 'Situação' }, { chave: 'sistemas', rotulo: 'Serviços' }], linhas } };
  }
  if (servico.startsWith('PEDIDOSPARC')) {
    const ps = lista(d.parcelamentos);
    const ativos = ps.filter((p) => !/encerrad|rescindid|cancelad|liquidad/i.test(String(p.situacao)));
    return { nivel: ativos.length ? 'ATENCAO' : 'OK', titulo: ps.length ? `${ps.length} pedido(s); ${ativos.length} em andamento.` : 'Nenhum parcelamento.', destaques: [], tabela: { colunas: [{ chave: 'numero', rotulo: 'Número' }, { chave: 'dataDoPedido', rotulo: 'Pedido em', tipo: 'data' }, { chave: 'situacao', rotulo: 'Situação' }, { chave: 'dataDaSituacao', rotulo: 'Desde', tipo: 'data' }], linhas: ps } };
  }
  if (servico.startsWith('PARCELASPARAGERAR')) {
    const ps = lista(d.listaParcelas);
    const total = ps.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    return { nivel: ps.length ? 'ATENCAO' : 'OK', titulo: ps.length ? `${ps.length} parcela(s) para emitir, total ${moeda(total)}.` : 'Nenhuma parcela para emitir.', destaques: [], tabela: { colunas: [{ chave: 'parcela', rotulo: 'Parcela', tipo: 'periodo' }, { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }], linhas: ps } };
  }
  if (servico === 'CONSVINCULOS261') {
    const cs = lista(d.cnpjs).map((c) => ({ cnpj: c.cnpj, tipo: c.tipoEstabelecimento, situacao: (c.situacaoCadastral as Record<string, unknown>)?.descricao, uf: c.uf }));
    return { nivel: 'INFO', titulo: `${d.totalInTheDatabase ?? cs.length} CNPJ(s) com o escritório como responsável.`, destaques: [], tabela: { colunas: [{ chave: 'cnpj', rotulo: 'CNPJ' }, { chave: 'tipo', rotulo: 'Tipo' }, { chave: 'situacao', rotulo: 'Situação' }, { chave: 'uf', rotulo: 'UF' }], linhas: cs } };
  }
  if (temPdf) return { ...comPdf(''), titulo: `${rotulo ? `${rotulo}: ` : ''}${arquivos.length === 1 ? 'PDF pronto' : `${arquivos.length} PDF prontos`} para abrir ou baixar.`, destaques: arquivos.map((a, n) => ({ rotulo: `Arquivo ${n + 1}`, valor: a.nome })) };
  // Genérico: a maior lista de objetos (em qualquer nível) vira tabela, com os campos aninhados achatados ("a.b").
  const t = tabelaGenerica(dados);
  const soltos = Object.entries(d).filter(([, v]) => v !== null && typeof v !== 'object').slice(0, 8).map(([k, v]) => ({ rotulo: rotuloDoCampo(k), valor: String(v) }));
  if (t) return { nivel: 'INFO', titulo: t.linhas.length ? `${t.linhas.length} registro(s) encontrado(s).` : 'Nenhum registro encontrado.', destaques: soltos, tabela: t };
  const vazio = dados === null || dados === undefined || dados === '' || (Array.isArray(dados) && !dados.length) || (typeof dados === 'object' && !Object.keys(d).length);
  return { nivel: 'INFO', titulo: vazio ? 'Nenhum registro encontrado.' : 'Consulta feita.', destaques: soltos };
}

/** "dataProtocolo" → "Data protocolo"; "numero_processo" → "Numero processo". */
export const rotuloDoCampo = (k: string) => {
  const s = k.split('.').pop()!.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function achatar(o: Record<string, unknown>, prefixo = '', saida: Record<string, unknown> = {}, nivel = 0) {
  for (const [k, v] of Object.entries(o)) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && nivel < 2) achatar(v as Record<string, unknown>, chave, saida, nivel + 1);
    else if (Array.isArray(v)) saida[chave] = v.every((x) => x === null || typeof x !== 'object') ? v.join(', ') : `${v.length} item(ns)`;
    else saida[chave] = v;
  }
  return saida;
}

/** Procura a maior lista de objetos nos dados (até 4 níveis) e devolve colunas e linhas achatadas; null se não houver lista. */
export function tabelaGenerica(dados: unknown): { colunas: Coluna[]; linhas: Record<string, unknown>[] } | null {
  let melhor: Record<string, unknown>[] | null = null;
  const visitar = (v: unknown, nivel: number) => {
    if (nivel > 4 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      if ((!melhor || v.length > melhor.length) && v.some((x) => x && typeof x === 'object' && !Array.isArray(x))) melhor = v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
      v.slice(0, 3).forEach((x) => visitar(x, nivel + 1));
      return;
    }
    Object.values(v as Record<string, unknown>).forEach((x) => visitar(x, nivel + 1));
  };
  visitar(dados, 0);
  const lista: Record<string, unknown>[] | null = melhor;
  if (!lista) return Array.isArray(dados) ? { colunas: [], linhas: [] } : null;
  const linhas = (lista as Record<string, unknown>[]).map((x) => achatar(x));
  const chaves: string[] = [];
  for (const l of linhas.slice(0, 50)) for (const k of Object.keys(l)) if (!chaves.includes(k)) chaves.push(k);
  const tipo = (k: string): Coluna['tipo'] => (/valor|saldo|montante/i.test(k) ? 'moeda' : /^data|data[A-Z_]|dt[A-Z_]/.test(k.split('.').pop()!) ? 'data' : undefined);
  return { colunas: chaves.slice(0, 12).map((k) => ({ chave: k, rotulo: rotuloDoCampo(k), tipo: tipo(k) })), linhas };
}
