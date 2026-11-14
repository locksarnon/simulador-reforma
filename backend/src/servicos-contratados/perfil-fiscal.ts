const formas: Record<string, string> = {
  '1': 'Lucro Real Anual', '2': 'Lucro Real Trimestral', '3': 'Lucro Presumido',
  '4': 'Lucro Arbitrado', '5': 'Imune do IRPJ', '6': 'Isenta do IRPJ', '7': 'Simples Nacional',
};

const objeto = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return {}; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
};

export function lerMit(dados: unknown) {
  const resposta = objeto(dados);
  if (resposta.situacaoApuracao !== 3) return null; // encerrada
  const apuracao = objeto(resposta.dadosApuracaoMit);
  const periodo = objeto(apuracao.PeriodoApuracao);
  const ano = Number(periodo.AnoApuracao), mes = Number(periodo.MesApuracao);
  if (!Number.isInteger(ano) || ano < 2025 || ano > 9999 || !Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  const iniciais = objeto(apuracao.DadosIniciais);
  const forma = String(iniciais.TributacaoLucro ?? '');
  if (iniciais.SemMovimento !== false || !Object.hasOwn(formas, forma)) return null;
  const balanco = objeto(apuracao.Debitos).BalancoLucroReal;
  return {
    competencia: `${ano}-${String(mes).padStart(2, '0')}`,
    forma: formas[forma],
    metodo: forma === '1' && typeof balanco === 'boolean'
      ? (balanco ? 'Balancete de suspensão ou redução' : 'Sem balancete declarado') : null,
  };
}

export function lerEfd(texto: string, cnpj: string, competencia: string) {
  const linhas = texto.split(/\r?\n/);
  const cab = linhas.find((l) => l.startsWith('|0000|'))?.split('|');
  const reg = linhas.find((l) => l.startsWith('|0110|'))?.split('|');
  const mes = (data: string) => /^\d{8}$/.test(data) ? `${data.slice(4)}-${data.slice(2, 4)}` : '';
  if (!cab || cab[9]?.toUpperCase() !== cnpj || mes(cab[6]) !== competencia || mes(cab[7]) !== competencia || reg?.[2] !== '2') return null;
  return reg[5] === '1' ? 'Caixa' : ['2', '9'].includes(reg[5]) ? 'Competência' : null;
}
