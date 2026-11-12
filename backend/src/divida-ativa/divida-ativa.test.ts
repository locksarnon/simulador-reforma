import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { DividaAtivaService, linhaParaInscricao, trimestresCandidatos } from './divida-ativa.service';
import { lerCndt, lerCrf } from '../infosimples/infosimples.service';

// Linhas fictícias no layout oficial dos dados abertos da PGFN (cabeçalho igual ao publicado).
const CAB = 'CPF_CNPJ;TIPO_PESSOA;TIPO_DEVEDOR;NOME_DEVEDOR;UF_DEVEDOR;UNIDADE_RESPONSAVEL;ENTIDADE_RESPONSAVEL;UNIDADE_INSCRICAO;NUMERO_INSCRICAO;TIPO_SITUACAO_INSCRICAO;SITUACAO_INSCRICAO;RECEITA_PRINCIPAL;DATA_INSCRICAO;INDICADOR_AJUIZADO;VALOR_CONSOLIDADO';
const PJ = '11.222.333/0001-81;Pessoa jurídica;Principal;EMPRESA FICTÍCIA LTDA;MT;CUIABA;PGFN;1ª REGIÃO;FGMT202300001;Em cobrança;AJUIZADA;Contribuições FGTS;01/02/2023;SIM;1500.50';
const PF = 'XXX.123.456-XX;Pessoa física;Principal;FULANO;MT;CUIABA;PGFN;1ª REGIÃO;FGMT202300002;Em cobrança;ENC PROTESTO;Contribuições FGTS;01/02/2023;NAO;10.00';

describe('base aberta da Dívida Ativa (PGFN)', () => {
  it('trimestres candidatos do atual para trás, virando o ano', () => {
    expect(trimestresCandidatos(new Date('2026-02-15T12:00:00Z'), 3)).toEqual(['2026_trimestre_01', '2025_trimestre_04', '2025_trimestre_03']);
  });

  it('guarda só pessoa jurídica, com raiz, valor e ajuizamento', () => {
    const l = (linha: string) => Object.fromEntries(CAB.split(';').map((c, i) => [c, linha.split(';')[i]]));
    expect(linhaParaInscricao(l(PF), 'FGTS', 'C1')).toBeNull();
    expect(linhaParaInscricao(l(PJ), 'FGTS', 'C1')).toMatchObject({ raiz: '11222333', cnpj: '11222333000181', numero_inscricao: 'FGMT202300001', ajuizado: true, valor: '1500.50', situacao: 'AJUIZADA', tipo_situacao: 'Em cobrança' });
  });

  let temUnzip = true;
  try { execSync('unzip -v', { stdio: 'ignore' }); execSync('zip -v', { stdio: 'ignore' }); } catch { temUnzip = false; }
  it.skipIf(!temUnzip)('importa o ZIP oficial (CSV em latin1, cabeçalho repetido em cada arquivo) em lotes', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pgfn-teste-'));
    writeFileSync(join(pasta, 'a_1.csv'), Buffer.from(`${CAB}\n${PJ}\n${PF}\n`, 'latin1'));
    writeFileSync(join(pasta, 'a_2.csv'), Buffer.from(`${CAB}\n${PJ.replace('0001-81', '0002-62').replace('FGMT202300001', 'FGMT202300003')}\n`, 'latin1'));
    execSync(`cd ${pasta} && zip -q base.zip a_1.csv a_2.csv`);
    const gravados: Record<string, unknown>[] = [];
    const s = new DividaAtivaService({ dividaAtivaInscricao: { createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => { gravados.push(...data); }) } } as never);
    expect(await s.importarZip(join(pasta, 'base.zip'), 'FGTS', 'C1')).toBe(2);
    expect(gravados.map((g) => g.cnpj)).toEqual(['11222333000181', '11222333000262']);
    expect(gravados[0].nome).toBe('EMPRESA FICTÍCIA LTDA');
  });

  it('consulta pela raiz na base vigente e soma o total; sem base devolve null', async () => {
    const semBase = new DividaAtivaService({ dividaAtivaCarga: { findFirst: async () => null } } as never);
    expect(await semBase.consultar('11222333000181')).toBeNull();
    const findMany = vi.fn(async () => [{ cnpj: '11222333000181', origem: 'SIDA', numero_inscricao: '1', tipo_devedor: 'Principal', tipo_situacao: 'Em cobrança', situacao: 'ATIVA', receita: 'IRPJ', data_inscricao: '01/01/2020', ajuizado: false, valor: '100.25' }, { cnpj: '11222333000262', origem: 'FGTS', numero_inscricao: '2', tipo_devedor: 'Principal', tipo_situacao: null, situacao: null, receita: null, data_inscricao: null, ajuizado: true, valor: '50' }]);
    const s = new DividaAtivaService({ dividaAtivaCarga: { findFirst: async () => ({ id: 'C1', trimestre: '2026_trimestre_03', concluido_em: new Date() }) }, dividaAtivaInscricao: { findMany } } as never);
    const r = await s.consultar('11.222.333/0001-81');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { raiz: '11222333', carga_id: 'C1' } }));
    expect(r).toMatchObject({ trimestre: '2026_trimestre_03', total: 150.25, ajuizadas: 1 });
    expect(r!.inscricoes[0]).toMatchObject({ origem: 'Dívida ativa geral (SIDA)', situacao: 'Em cobrança: ATIVA' });
  });
});

describe('Infosimples: leitura da CNDT e do CRF', () => {
  it('CNDT negativa, positiva com efeito de negativa e positiva', () => {
    expect(lerCndt({ conseguiu_emitir_certidao_negativa: true, certidao: 'Certidão Negativa de Débitos Trabalhistas', validade_data: '11/05/2027', emissao_data: '12/11/2026', certidao_codigo: '123' })).toMatchObject({ status: 'CONCLUIDO', validade: '11/05/2027', numero: '123' });
    expect(lerCndt({ conseguiu_emitir_certidao_negativa: false, consta: true, certidao: 'Certidão Positiva de Débitos Trabalhistas com efeito de Negativa' }).status).toBe('CONCLUIDO');
    expect(lerCndt({ conseguiu_emitir_certidao_negativa: false, consta: true, certidao: 'Certidão Positiva de Débitos Trabalhistas', total_de_processos: '3' })).toMatchObject({ status: 'DEBITOS', resumo: expect.stringMatching(/3 processo/) });
  });
  it('CRF regular com validade; irregular', () => {
    expect(lerCrf({ situacao: 'REGULAR', validade_inicio_data: '01/11/2026', validade_fim_data: '30/11/2026', crf: '2026110100000000000000' })).toMatchObject({ status: 'CONCLUIDO', validade: '30/11/2026' });
    expect(lerCrf({ situacao: 'IRREGULAR' }).status).toBe('IRREGULAR');
  });
});
