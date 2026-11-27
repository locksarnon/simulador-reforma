import { describe, expect, it } from 'vitest';
import { atualizarEmpresaPeloCnpj, type DadosCnpj } from '../../cnpj/dados-publicos';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const CNPJ = '12.345.678/0001-90';

const dadosCnpj = (o: Partial<DadosCnpj> = {}): DadosCnpj => ({
  razao_social: 'Cliente Ltda', nome_fantasia: '', uf: 'MT', municipio: 'Sorriso', cnae_descricao: 'Comércio atacadista de defensivos', situacao: 'ATIVA',
  cnae_codigo: '4683400', cnaes_secundarios: [{ codigo: '5211701', descricao: 'Armazéns gerais' }, { codigo: '6911701', descricao: 'Serviços advocatícios' }],
  porte: 'DEMAIS', natureza_juridica: '206-2', codigo_municipio_ibge: '5107925', opcao_pelo_simples: false, opcao_pelo_mei: false, data_inicio_atividade: '2000-01-01',
  capital_social: 100, matriz_filial: 'MATRIZ', socios: [], ...o,
});

/** Consulta de CNPJ falsa: devolve `dados`, lança `erro` ou nunca responde (`pendurar`). */
function consultaFalsa(opcoes: { dados?: DadosCnpj; erro?: Error; pendurar?: boolean } = {}) {
  const chamadas: string[] = [];
  return {
    chamadas,
    consultar: async (cnpj: string) => {
      chamadas.push(cnpj);
      if (opcoes.pendurar) return new Promise<DadosCnpj>(() => {});
      if (opcoes.erro) throw opcoes.erro;
      return opcoes.dados ?? dadosCnpj();
    },
  };
}

function montar(empresa: Record<string, unknown>, cnpj?: ReturnType<typeof consultaFalsa>) {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z'), responsavel: 'Ana' }],
    empresa: [{ id: 'E1', erp: null, erp_versao: null, cnae_principal: null, cnae_descricao: null, cnaes_secundarios: [], dados_publicos_em: null, ...empresa }],
  });
  const projetos = new SanProjetoService(prisma as never, cnpj as never);
  return { prisma, db, projetos };
}
async function status(p: Promise<unknown>) { try { await p; return 200; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? 500; } }
async function mensagem(p: Promise<unknown>) { try { await p; return null; } catch (e) { return (e as Error).message; } }

describe('atividades do cliente vindas do CNPJ', () => {
  it('cadastro com CNAE: cria as atividades dele e não consulta o CNPJ', async () => {
    const cnpj = consultaFalsa();
    const c = montar({ cnpj_cpf: CNPJ, cnae_principal: '0111301', cnae_descricao: 'Cultivo de arroz', cnaes_secundarios: [{ codigo: '4930202', descricao: 'Transporte' }], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }, cnpj);
    const p = await c.projetos.criar('D1', USER);
    expect(p.avisoAtividades).toBeNull();
    expect(cnpj.chamadas).toEqual([]);
    expect(c.db.sanAtividade.map((a) => [a.codigo, a.origem])).toEqual([['0111301', 'CNPJ'], ['4930202', 'CNPJ']]);
  });

  it('PJ sem CNAE no cadastro: consulta o CNPJ, atualiza os dados públicos do cliente e cria as atividades (origem CNPJ)', async () => {
    const cnpj = consultaFalsa();
    const c = montar({ cnpj_cpf: CNPJ, uf: 'MT', municipio: null }, cnpj);
    const p = await c.projetos.criar('D1', USER);
    expect(cnpj.chamadas).toEqual(['12345678000190']);
    expect(p.avisoAtividades).toBeNull();
    const emp = c.db.empresa[0];
    expect(emp.cnae_principal).toBe('4683400');
    expect(emp.dados_publicos_em).toBeInstanceOf(Date);
    expect(emp.municipio).toBe('Sorriso'); // vazio no cadastro: preenchido pela Receita
    expect(emp.uf).toBe('MT');
    expect(c.db.sanAtividade.map((a) => [a.codigo, a.origem, a.mantida])).toEqual([['4683400', 'CNPJ', true], ['5211701', 'CNPJ', true], ['6911701', 'CNPJ', true]]);
    // A versão do CNPJ do projeto é a da consulta feita agora: sem aviso de "revisar".
    const o = await c.projetos.obter(p.id);
    expect(o.cnpjDesatualizado).toBe(false);
    expect(o.cliente).toMatchObject({ tipoDocumento: 'PJ', temCnae: true, cnaePrincipal: '4683400' });
    // Motivo do mapeamento por CNAE; o que não tem regra fica sem atividade (nunca é chutado).
    expect(o.mapaAtividades.mapeadas.find((m) => m.codigo === '5211701')).toMatchObject({ atividade: 'ARMAZENAGEM', motivo: expect.stringContaining('52.1') });
    expect(o.mapaAtividades.semMapeamento).toEqual(['6911701']);
  });

  it('consulta falhando ou sem resposta não impede abrir o projeto: fica o aviso', async () => {
    const c = montar({ cnpj_cpf: CNPJ }, consultaFalsa({ erro: new Error('Falha ao consultar a BrasilAPI.') }));
    const p = await c.projetos.criar('D1', USER);
    expect(p.id).toBeTruthy();
    expect(p.avisoAtividades).toContain('Falha ao consultar a BrasilAPI.');
    expect(c.db.sanAtividade).toHaveLength(0);
    expect(c.db.empresa[0].dados_publicos_em).toBeNull();
    const o = await c.projetos.obter(p.id);
    expect(o.cliente).toMatchObject({ tipoDocumento: 'PJ', temCnae: false });
  });

  it('PF: não consulta e avisa para marcar na lista', async () => {
    const cnpj = consultaFalsa();
    const c = montar({ cnpj_cpf: '123.456.789-09' }, cnpj);
    const p = await c.projetos.criar('D1', USER);
    expect(cnpj.chamadas).toEqual([]);
    expect(p.avisoAtividades).toBe('Pessoa física: marque as atividades na lista.');
    const o = await c.projetos.obter(p.id);
    expect(o.cliente.tipoDocumento).toBe('PF');
    expect(o.listaAtividades.map((a) => a.codigo)).toContain('PRODUCAO_AGRICOLA');
    expect(await status(c.projetos.buscarAtividadesPeloCnpj(p.id, o.versao))).toBe(400);
    expect(await mensagem(c.projetos.buscarAtividadesPeloCnpj(p.id, o.versao))).toBe('Pessoa física: marque as atividades na lista.');
  });

  it('buscar pelo CNPJ acrescenta o que falta sem apagar as manuais nem reativar as excluídas', async () => {
    const cnpj = consultaFalsa({ dados: dadosCnpj({ cnae_codigo: '4683400', cnaes_secundarios: [] }) });
    const c = montar({ cnpj_cpf: CNPJ }, cnpj);
    const p = await c.projetos.criar('D1', USER); // cria com 4683400
    const [a] = await c.projetos.listarAtividades(p.id);
    await c.projetos.alterarAtividade(p.id, a.id, { mantida: false }); // o consultor exclui
    await c.projetos.adicionarAtividade(p.id, { codigo: 'ARMAZENAGEM', descricao: 'Armazenagem' }); // e acrescenta uma manual
    // O CNPJ passou a ter um secundário novo.
    cnpj.consultar = async (doc: string) => { cnpj.chamadas.push(doc); return dadosCnpj({ cnae_codigo: '4683400', cnaes_secundarios: [{ codigo: '0161001', descricao: 'Apoio à agricultura' }] }); };
    const versao = (await c.projetos.obter(p.id)).versao;
    const r = await c.projetos.buscarAtividadesPeloCnpj(p.id, versao);
    expect(r.acrescentadas).toEqual([{ codigo: '0161001', descricao: 'Apoio à agricultura' }]);
    expect(r.atividadesConfirmadas).toBe(false);
    expect(r.projeto.versao).toBe(versao + 1);
    expect(r.projeto.cnpjDesatualizado).toBe(false);
    const lista = await c.projetos.listarAtividades(p.id);
    expect(lista.map((x) => [x.codigo, x.origem, x.mantida])).toEqual([['4683400', 'CNPJ', false], ['ARMAZENAGEM', 'MANUAL', true], ['0161001', 'CNPJ', true]]);
    // De novo: nada a acrescentar.
    const r2 = await c.projetos.buscarAtividadesPeloCnpj(p.id, r.projeto.versao);
    expect(r2.acrescentadas).toEqual([]);
    expect(r2.aviso).toContain('Nenhuma atividade nova');
    expect(await status(c.projetos.buscarAtividadesPeloCnpj(p.id, 1))).toBe(409); // versão velha
  });

  it('projeto já aberto sem atividades (cadastro sem CNAE e consulta que falhou na abertura): o botão resolve', async () => {
    const cnpj = consultaFalsa({ erro: new Error('fora do ar') });
    const c = montar({ cnpj_cpf: CNPJ }, cnpj);
    const p = await c.projetos.criar('D1', USER);
    expect(c.db.sanAtividade).toHaveLength(0);
    cnpj.consultar = async () => dadosCnpj();
    const r = await c.projetos.buscarAtividadesPeloCnpj(p.id, 1);
    expect(r.acrescentadas.map((x) => x.codigo)).toEqual(['4683400', '5211701', '6911701']);
    expect(c.db.empresa[0].cnae_principal).toBe('4683400');
  });

  it('com as atividades confirmadas: não muda a trava nem a lista, devolve o que falta e o projeto pede "revisar atividades"', async () => {
    const cnpj = consultaFalsa({ dados: dadosCnpj({ cnaes_secundarios: [] }) });
    const c = montar({ cnpj_cpf: CNPJ }, cnpj);
    const p = await c.projetos.criar('D1', USER);
    const conf = await c.projetos.confirmarAtividades(p.id, 1, USER);
    await new Promise((r) => setTimeout(r, 5)); // a consulta nova é de outro instante (dados_publicos_em muda)
    cnpj.consultar = async () => dadosCnpj({ cnaes_secundarios: [{ codigo: '4930202', descricao: 'Transporte de carga' }] });
    const r = await c.projetos.buscarAtividadesPeloCnpj(p.id, conf!.versao);
    expect(r.atividadesConfirmadas).toBe(true);
    expect(r.acrescentadas).toEqual([]);
    expect(r.pendentes).toEqual([{ codigo: '4930202', descricao: 'Transporte de carga' }]);
    expect(r.aviso).toContain('Reabra');
    expect(r.projeto.atividadesConfirmadas).toBe(true);
    expect(r.projeto.cnpjDesatualizado).toBe(true);
    expect((await c.projetos.listarAtividades(p.id)).map((x) => x.codigo)).toEqual(['4683400']);
  });

  it('buscar pelo CNPJ com a consulta falhando: 400 com o motivo (como no cadastro do cliente); sem CNPJ no cadastro: 400', async () => {
    const c = montar({ cnpj_cpf: CNPJ, cnae_principal: '4683400' }, consultaFalsa({ erro: new Error('Falha ao consultar a BrasilAPI.') }));
    const p = await c.projetos.criar('D1', USER);
    expect(await status(c.projetos.buscarAtividadesPeloCnpj(p.id, 1))).toBe(400);
    expect(await mensagem(c.projetos.buscarAtividadesPeloCnpj(p.id, 1))).toContain('Falha ao consultar a BrasilAPI.');
    c.db.empresa[0].cnpj_cpf = null;
    expect(await status(c.projetos.buscarAtividadesPeloCnpj(p.id, 1))).toBe(400);
  });
});

describe('atualizarEmpresaPeloCnpj (o caminho do cadastro do cliente)', () => {
  it('desiste quando a consulta não responde a tempo e não grava nada', async () => {
    const c = montar({ cnpj_cpf: CNPJ });
    const erro = await mensagem(atualizarEmpresaPeloCnpj(c.prisma as never, consultaFalsa({ pendurar: true }), c.db.empresa[0] as never, 20));
    expect(erro).toContain('não respondeu a tempo');
    expect(c.db.empresa[0].dados_publicos_em).toBeNull();
  });
  it('recusa documento que não é CNPJ', async () => {
    const c = montar({ cnpj_cpf: '12345678909' });
    expect(await mensagem(atualizarEmpresaPeloCnpj(c.prisma as never, consultaFalsa(), c.db.empresa[0] as never))).toContain('não tem CNPJ');
  });
});
