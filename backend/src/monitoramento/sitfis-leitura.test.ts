import { describe, expect, it } from 'vitest';
import { lerRelatorioSitfis, resumoDoSitfis } from './sitfis-leitura';

// Texto fictício no formato do Relatório de Situação Fiscal (títulos de seção seguidos de traços, cabeçalho repetido por página).
const RELATORIO = `MINISTÉRIO DA FAZENDA Por meio do e-CAC - CNPJ do certificado: 11.222.333/0001-81
SECRETARIA ESPECIAL DA RECEITA FEDERAL DO BRASIL 28/07/2026 07:48:50
PROCURADORIA-GERAL DA FAZENDA NACIONAL Página: 1 / 3
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 11.222.333 - EMPRESA FICTICIA LTDA
Dados Cadastrais da Matriz ______________________________________________
CNPJ: 11.222.333/0001-81
Situação: ATIVA
Certidão Emitida ________________________________________________________
CNPJ: 11.222.333/0001-81
Certidão Positiva com Efeitos de Negativa: AAAA.BBBB.CCCC.DDDD Emissão: 05/11/2025 Data de Validade: 04/05/2026
_______________ Diagnóstico Fiscal na Receita Federal _______________
Pendência - Parcelamento (SIPADE) _______________________________________
CNPJ: 11.222.333/0001-81
Processo Receita Parc.Atraso Situação
10000.000.000/2021-00 0561-IRRF 1 ATIVO
Pendência - Débito (SIEF) _______________________________________________
CNPJ: 11.222.333/0001-81
Receita PA/Exerc. Dt. Vcto Vl. Original Sdo. Devedor Multa Juros Sdo. Dev. Cons. Situação
6912-01 - PIS 09/2025 25/10/2025 100,00 100,00 20,00 5,00 125,00 DEVEDOR
MINISTÉRIO DA FAZENDA Por meio do e-CAC - CNPJ do certificado: 11.222.333/0001-81
SECRETARIA ESPECIAL DA RECEITA FEDERAL DO BRASIL 28/07/2026 07:48:50
PROCURADORIA-GERAL DA FAZENDA NACIONAL Página: 2 / 3
INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO
CNPJ: 11.222.333 - EMPRESA FICTICIA LTDA
2172-01 - COFINS 09/2025 25/10/2025 400,00 400,00 80,00 20,00 500,00 DEVEDOR
Omissão de Declaração (SIEF) _____________________________________________
EFD-CONTRIBUIÇÕES 09/2025
Débito com Exigibilidade Suspensa (SICOB) _______________________________
Parcelamento: 12345678-9 Situação: 000001 - ATIVO/EM DIA
_______________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional _______________
Parcelamento com Exigibilidade Suspensa (SISPAR) ________________________
Conta
004760792 TRANSACAO EXCEPCIONAL - DEMAIS DEBITOS`;

describe('leitura do relatório de situação fiscal', () => {
  const l = lerRelatorioSitfis(RELATORIO);

  it('lê a data, a certidão emitida e ignora o cabeçalho repetido das páginas', () => {
    expect(l.emitidoEm).toBe('28/07/2026 07:48:50');
    expect(l.certidao).toEqual({ tipo: 'Certidão Positiva com Efeitos de Negativa', codigo: 'AAAA.BBBB.CCCC.DDDD', emissao: '05/11/2025', validade: '04/05/2026' });
    expect(l.secoes.flatMap((s) => s.linhas).some((x) => /MINIST|Página/.test(x))).toBe(false);
  });

  it('separa as seções por órgão, tipo e assunto, juntando as linhas que continuam na página seguinte', () => {
    expect(l.secoes.map((s) => [s.orgao, s.tipo, s.assunto, s.titulo])).toEqual([
      ['RFB', 'PENDENCIA', 'PARCELAMENTO', 'Pendência - Parcelamento (SIPADE)'],
      ['RFB', 'PENDENCIA', 'DEBITO', 'Pendência - Débito (SIEF)'],
      ['RFB', 'OMISSAO', 'OMISSAO', 'Omissão de Declaração (SIEF)'],
      ['RFB', 'SUSPENSO', 'PARCELAMENTO', 'Débito com Exigibilidade Suspensa (SICOB)'],
      ['PGFN', 'SUSPENSO', 'PARCELAMENTO', 'Parcelamento com Exigibilidade Suspensa (SISPAR)'],
    ]);
    expect(l.secoes[1].linhas).toHaveLength(3);
    expect(l.secoes[2].linhas).toEqual(['EFD-CONTRIBUIÇÕES 09/2025']);
  });

  it('resume: pendência ou omissão é crítico; só suspensos é atenção; nada é em dia', () => {
    expect(resumoDoSitfis(l).nivel).toBe('CRITICO');
    expect(resumoDoSitfis(l).titulo).toMatch(/^2 pendências: Parcelamento \(SIPADE\); Débito \(SIEF\); 1 omissão de declaração; 2 itens com exigibilidade suspensa\.$/);
    expect(resumoDoSitfis({ ...l, secoes: l.secoes.filter((s) => s.tipo === 'SUSPENSO') }).nivel).toBe('ATENCAO');
    expect(resumoDoSitfis({ ...l, secoes: [] })).toEqual({ nivel: 'OK', titulo: 'Sem pendências.' });
  });
});
