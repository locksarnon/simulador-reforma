import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { interpretarCertidao, textoDoPdf } from './leitor-certidoes';

const HOJE = new Date('2026-11-12T12:00:00-03:00');
const CNPJ = '12345678000195';

const CNDT_NEGATIVA = `PODER JUDICIÁRIO JUSTIÇA DO TRABALHO CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS Nome: EMPRESA TESTE LTDA (MATRIZ E FILIAIS)
CNPJ: 12.345.678/0001-95 Certidão nº: 123456789/2026 Expedição: 10/11/2026, às 10:00:00 Validade: 09/05/2027 - 180 (cento e oitenta) dias, contados da data de sua expedição.
Certifica-se que EMPRESA TESTE LTDA (MATRIZ E FILIAIS), inscrito(a) no CNPJ sob o nº 12.345.678/0001-95, NÃO CONSTA como inadimplente no Banco Nacional de Devedores Trabalhistas.`;
const CNDT_POSITIVA = CNDT_NEGATIVA.replace('CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS', 'CERTIDÃO POSITIVA DE DÉBITOS TRABALHISTAS');
const CNDT_EFEITO = CNDT_NEGATIVA.replace('CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS', 'CERTIDÃO POSITIVA DE DÉBITOS TRABALHISTAS COM EFEITO DE NEGATIVA');
const CRF = `Certificado de Regularidade do FGTS - CRF Inscrição: 12.345.678/0001-95 Razão Social: EMPRESA TESTE LTDA
A EMPRESA abaixo identificada está regular perante o Fundo de Garantia do Tempo de Serviço - FGTS. O presente Certificado não servirá de prova contra cobrança de quaisquer débitos referentes a contribuições e/ou encargos devidos, decorrentes das obrigações com o FGTS.
Validade:01/11/2026 a 30/11/2026 Certificação Número: 2026110100000000000000 Informação obtida em 01/11/2026 09:00:00
encontra-se em situação regular perante o Fundo de Garantia do Tempo de Serviço`;
const FEDERAL = `MINISTÉRIO DA FAZENDA Secretaria da Receita Federal do Brasil Procuradoria-Geral da Fazenda Nacional
CERTIDÃO POSITIVA COM EFEITOS DE NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO
Nome: EMPRESA TESTE LTDA CNPJ: 12.345.678/0001-95 Emitida às 10:00:00 do dia 05/11/2026 <hora e data de Brasília>. Válida até 04/05/2027.
Código de controle da certidão: ABCD.1234.EF56.7890`;

describe('leitura das certidões anexadas', () => {
  it('CNDT negativa: concluída, com validade, número e CNPJ conferido pela raiz', () => {
    const l = interpretarCertidao('TRABALHISTA', CNDT_NEGATIVA, '12345678000276', HOJE);
    expect(l).toMatchObject({ status: 'CONCLUIDO', situacao: 'Negativa', validade: '09/05/2027', emissao: '10/11/2026', numero: '123456789/2026', confere: true });
  });
  it('CNDT positiva = Débitos; com efeito de negativa = Concluída', () => {
    expect(interpretarCertidao('TRABALHISTA', CNDT_POSITIVA, CNPJ, HOJE).status).toBe('DEBITOS');
    expect(interpretarCertidao('TRABALHISTA', CNDT_EFEITO, CNPJ, HOJE)).toMatchObject({ status: 'CONCLUIDO', situacao: 'Positiva com efeito de negativa' });
  });
  it('certidão vencida ou de outro CNPJ fica Irregular', () => {
    expect(interpretarCertidao('TRABALHISTA', CNDT_NEGATIVA, CNPJ, new Date('2027-06-01T12:00:00-03:00')).resumo).toMatch(/vencida/);
    const outra = interpretarCertidao('TRABALHISTA', CNDT_NEGATIVA, '99888777000166', HOJE);
    expect(outra).toMatchObject({ status: 'IRREGULAR', confere: false });
    expect(outra.resumo).toMatch(/não é o desta pré-análise/);
  });
  it('CRF do FGTS: regular, validade final do intervalo e conferência pelo CNPJ completo', () => {
    expect(interpretarCertidao('FGTS', CRF, CNPJ, HOJE)).toMatchObject({ status: 'CONCLUIDO', situacao: 'Regular', validade: '30/11/2026', emissao: '01/11/2026', numero: '2026110100000000000000', confere: true });
    expect(interpretarCertidao('FGTS', CRF, '12345678000276', HOJE).confere).toBe(false);
  });
  it('certidão federal conjunta: positiva com efeitos de negativa, validade e código de controle', () => {
    expect(interpretarCertidao('PGFN', FEDERAL, CNPJ, HOJE)).toMatchObject({ status: 'CONCLUIDO', situacao: 'Positiva com efeitos de negativa', validade: '04/05/2027', emissao: '05/11/2026', numero: 'ABCD.1234.EF56.7890' });
    expect(interpretarCertidao('PGFN', FEDERAL.replace('POSITIVA COM EFEITOS DE NEGATIVA', 'POSITIVA'), CNPJ, HOJE).status).toBe('DEBITOS');
  });
  it('PDF de outro documento não é aceito como certidão', () => {
    expect(interpretarCertidao('FGTS', CNDT_NEGATIVA, CNPJ, HOJE)).toMatchObject({ status: 'MANUAL', situacao: 'documento não reconhecido' });
  });
  it('lê o texto de um PDF de verdade e recusa o que não é PDF', async () => {
    const pdf = await new Promise<Buffer>((ok) => { const d = new PDFDocument(); const c: Buffer[] = []; d.on('data', (x: Buffer) => c.push(x)); d.on('end', () => ok(Buffer.concat(c))); d.text('CERTIDAO NEGATIVA DE DEBITOS TRABALHISTAS CNPJ: 12.345.678/0001-95 Validade: 09/05/2027'); d.end(); });
    const texto = await textoDoPdf(pdf);
    expect(interpretarCertidao('TRABALHISTA', texto, CNPJ, HOJE)).toMatchObject({ status: 'CONCLUIDO', validade: '09/05/2027' });
    await expect(textoDoPdf(Buffer.from('não é pdf'))).rejects.toThrow(/não é um PDF/);
  });
});
