import { describe, expect, it } from 'vitest';
import { contar, divisaoDoCnae, faltasDoCadastro, PainelCarteiraService } from './painel-carteira.service';

const base = { cnpj_cpf: null, regime_atual: null, setor: null, uf: null, municipio: null, status: 'Ativa', produtor_rural: null, cnae_principal: null, cnae_descricao: null, porte: null, latitude: null, longitude: null, email_contato: null, whatsapp_contato: null, dados_publicos_em: null };

function montar(empresas: Record<string, unknown>[], consulta?: (cnpj: string) => Promise<Record<string, unknown>>) {
  const lista = empresas.map((e, i) => ({ id: `E${i + 1}`, razao_social: `Empresa ${i + 1}`, ...base, ...e }));
  const prisma = {
    empresa: {
      findMany: async () => lista,
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(lista.find((e) => e.id === where.id)!, data),
    },
    servicoContratado: { findMany: async () => [{ empresa_id: 'E1', tipo: 'BPO_FISCAL' }, { empresa_id: 'E1', tipo: 'DIAGNOSTICO_PONTUAL' }, { empresa_id: 'E2', tipo: 'DIAGNOSTICO_PONTUAL' }] },
  };
  const cnpj = {
    consultar: consulta ?? (async (c: string) => ({ cnae_codigo: '0115600', cnae_descricao: 'Cultivo de soja', porte: 'DEMAIS', natureza_juridica: 'Sociedade Empresária Limitada', codigo_municipio_ibge: '5103403', uf: 'MT', municipio: 'CUIABA', cnpj: c })),
  };
  return { service: new PainelCarteiraService(prisma as never, cnpj as never), lista };
}

describe('Painel da carteira: contas', () => {
  it('conta do maior para o menor e chama o vazio de "Não informado"', () => {
    expect(contar([{ r: 'A' }, { r: 'B' }, { r: 'A' }, { r: null }], (x) => x.r)).toEqual([{ nome: 'A', total: 2 }, { nome: 'B', total: 1 }, { nome: 'Não informado', total: 1 }]);
    expect(divisaoDoCnae('0115600')).toBe('01');
    expect(divisaoDoCnae(null)).toBeNull();
  });

  it('a saúde do cadastro diz o que falta em cada empresa', () => {
    expect(faltasDoCadastro({ id: 'x', razao_social: 'X', ...base } as never)).toEqual(['CNPJ/CPF', 'regime', 'UF e município', 'contato']);
    expect(faltasDoCadastro({ id: 'x', razao_social: 'X', ...base, cnpj_cpf: '58.509.112/0001-52', regime_atual: 'Lucro Real', uf: 'MT', municipio: 'Cuiabá', email_contato: 'a@b' } as never)).toEqual(['CNAE']);
  });

  it('resumo: carteiras, regimes, municípios com ponto no mapa, CNAE e pendências', async () => {
    const t = montar([
      { cnpj_cpf: '58.509.112/0001-52', regime_atual: 'Lucro Presumido', uf: 'MT', municipio: 'Cuiabá', latitude: -15.5, longitude: -55.9, cnae_principal: '0115600', cnae_descricao: 'Cultivo de soja', porte: 'DEMAIS', email_contato: 'a@b', dados_publicos_em: new Date() },
      { cnpj_cpf: '12.345.678/0001-95', regime_atual: 'Lucro Presumido', uf: 'MT', municipio: 'CUIABÁ' },
      { cnpj_cpf: '123.456.789-00', regime_atual: 'Produtor rural PF', uf: 'GO', municipio: 'Rio Verde' },
    ]);
    const r = await t.service.resumo();
    expect(r.total).toBe(3);
    expect(r.carteiras).toEqual({ bpo: 1, diagnostico: 2, ambas: 1, sem: 1 });
    expect(r.por_regime[0]).toEqual({ nome: 'Lucro Presumido', total: 2 });
    expect(r.por_municipio[0]).toMatchObject({ uf: 'MT', total: 2, latitude: -15.5676 }); // "Cuiabá" e "CUIABÁ" juntos
    expect(r.por_cnae).toEqual([{ codigo: '0115600', descricao: 'Cultivo de soja', total: 1 }]);
    expect(r.por_porte.find((p) => p.nome === 'Não informado')?.total).toBe(1); // só conta quem tem CNPJ
    expect(r.saude.pendentes_de_cnpj).toBe(1);
    expect(r.saude.sem_ponto_no_mapa).toBe(0);
    expect(r.saude.completas).toBe(1);
  });
});

it('localiza as cidades do mapa mesmo sem geocodificação no cadastro', async () => {
  const cidades = [
    ['MS', 'CAMPO GRANDE'], ['GO', ' GOIANIA '], ['MT', 'ALTA FLORESTA'],
    ['MT', 'CLAUDIA'], ['PA', 'PARAGOMINAS'], ['MT', 'SORRISO'],
  ];
  const { service } = montar([...cidades.map(([uf, municipio]) => ({ uf, municipio })), { uf: 'XX', municipio: 'Inválido' }, {}]);
  const resumo = await service.resumo();
  expect(resumo.saude.sem_ponto_no_mapa).toBe(2);
  expect(resumo.por_municipio.filter((m) => m.latitude !== null)).toHaveLength(6);
  expect(resumo.por_municipio.find((m) => m.municipio === 'Campo Grande')).toMatchObject({ latitude: -20.4626, longitude: -54.6086 });
});

describe('Painel da carteira: completar pelo CNPJ', () => {
  it('preenche CNAE, porte e ponto do mapa; não troca UF e município digitados; CPF fica de fora', async () => {
    const t = montar([
      { cnpj_cpf: '58.509.112/0001-52', uf: 'GO', municipio: 'Rio Verde' },
      { cnpj_cpf: '12.345.678/0001-95' },
      { cnpj_cpf: '123.456.789-00' },
    ]);
    const r = await t.service.completarPeloCnpj(0);
    expect(r).toEqual({ atualizadas: 2, falhas: [], restantes: 0 });
    expect(t.lista[0]).toMatchObject({ cnae_principal: '0115600', porte: 'DEMAIS', uf: 'GO', municipio: 'Rio Verde', latitude: expect.any(Number) });
    expect(t.lista[0].latitude).not.toBe(-15.5676);
    expect(t.lista[1]).toMatchObject({ uf: 'MT', municipio: 'CUIABA' });
    expect(t.lista[2].dados_publicos_em).toBeNull();
    expect(await t.service.completarPeloCnpj(0)).toEqual({ atualizadas: 0, falhas: [], restantes: 0 }); // não repete
  });

  it('erro na consulta vira falha com motivo, e a empresa não volta à fila', async () => {
    const t = montar([{ cnpj_cpf: '11.111.111/0001-11' }], async () => { throw new Error('CNPJ não encontrado na Receita Federal.'); });
    const r = await t.service.completarPeloCnpj(0);
    expect(r.falhas).toEqual([{ razao_social: 'Empresa 1', motivo: 'CNPJ não encontrado na Receita Federal.' }]);
    expect((await t.service.completarPeloCnpj(0)).falhas).toEqual([]);
  });

  it('faz no máximo 20 por chamada e diz quantas faltam', async () => {
    const t = montar(Array.from({ length: 25 }, (_, i) => ({ cnpj_cpf: `11.111.111/0001-${String(i).padStart(2, '0')}` })));
    expect(await t.service.completarPeloCnpj(0)).toMatchObject({ atualizadas: 20, restantes: 5 });
    expect(await t.service.completarPeloCnpj(0)).toMatchObject({ atualizadas: 5, restantes: 0 });
  });
});
