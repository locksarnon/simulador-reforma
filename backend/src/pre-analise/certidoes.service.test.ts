import PDFDocument from 'pdfkit';
import { describe, expect, it, vi } from 'vitest';
import { CertidoesService } from './certidoes.service';
import { interpretarCertidaoGenerica } from './leitor-certidoes';

const HOJE = new Date('2026-11-12T12:00:00-03:00');
const pdfCom = (texto: string) => new Promise<Buffer>((ok) => { const d = new PDFDocument(); const c: Buffer[] = []; d.on('data', (x: Buffer) => c.push(x)); d.on('end', () => ok(Buffer.concat(c))); d.text(texto); d.end(); });

describe('certidão estadual e municipal (leitura genérica)', () => {
  it('lê negativa, validade, emissão e confere o CNPJ pela raiz', () => {
    const l = interpretarCertidaoGenerica('GOVERNO DO ESTADO DE MATO GROSSO SECRETARIA DE FAZENDA CERTIDÃO NEGATIVA DE DÉBITOS FISCAIS CNPJ: 58.509.112/0001-52 Emitida em 10/11/2026 Válida até 09/01/2027 Código de autenticidade: ABC123XYZ', '58509112000233', HOJE);
    expect(l).toMatchObject({ status: 'CONCLUIDO', situacao: 'Negativa', validade: '09/01/2027', emissao: '10/11/2026', numero: 'ABC123XYZ', confere: true });
  });
  it('positiva com efeito de negativa vale; positiva aponta débitos; "válida por N dias" calcula a validade', () => {
    expect(interpretarCertidaoGenerica('PREFEITURA MUNICIPAL CERTIDÃO POSITIVA COM EFEITO DE NEGATIVA CNPJ 58.509.112/0001-52 VALIDADE: 31/12/2026', '58509112000152', HOJE).status).toBe('CONCLUIDO');
    expect(interpretarCertidaoGenerica('CERTIDÃO POSITIVA DE DÉBITOS CNPJ 58.509.112/0001-52 VALIDADE: 31/12/2026', '58509112000152', HOJE).status).toBe('DEBITOS');
    expect(interpretarCertidaoGenerica('CERTIDÃO NEGATIVA DE DÉBITOS MUNICIPAIS CNPJ 58.509.112/0001-52 DATA DA EMISSÃO: 01/11/2026 VÁLIDA POR 90 (NOVENTA) DIAS', '58509112000152', HOJE).validade).toBe('30/01/2027');
  });
  it('sem situação lida fica para a pessoa conferir; CNPJ de outra empresa fica irregular', () => {
    expect(interpretarCertidaoGenerica('documento qualquer', '58509112000152', HOJE).status).toBe('MANUAL');
    expect(interpretarCertidaoGenerica('CERTIDÃO NEGATIVA CNPJ 11.222.333/0001-81 VÁLIDA ATÉ 31/12/2026', '58509112000152', HOJE)).toMatchObject({ status: 'IRREGULAR', confere: false });
  });
});

describe('certidões do cliente', () => {
  function montar(o: { modo?: string; cnd?: unknown; chaves?: boolean; cndt?: unknown } = {}) {
    const tipos = ['CND federal (Receita e PGFN)', 'CND estadual', 'CND municipal', 'CNDT (débitos trabalhistas)', 'CRF do FGTS'].map((nome, i) => ({ id: `T${i}`, nome, alerta_dias: 15 }));
    const docs: Record<string, unknown>[] = [];
    const arquivos: Record<string, unknown>[] = [];
    const prisma = {
      empresa: { findUnique: async () => ({ id: 'E1', razao_social: 'EXTRA AGRO LTDA', cnpj_cpf: '58.509.112/0001-52', uf: 'MT', municipio: 'Sorriso' }) },
      tipoDocumento: { findMany: async () => tipos },
      documentoEmpresa: { findMany: async () => [...docs].reverse(), create: async ({ data }: { data: Record<string, unknown> }) => { const d = { id: `D${docs.length}`, createdAt: new Date(), ...data }; docs.push(d); return d; } },
      arquivoEmpresa: { findMany: async () => arquivos, create: async ({ data }: { data: Record<string, unknown> }) => { const a = { id: `A${arquivos.length}`, ...data }; arquivos.push(a); return a; } },
    };
    const guardados: string[] = [];
    const storage = { guardar: async (k: string) => { guardados.push(k); } };
    const serpro = { certidaoFederal: vi.fn(async () => o.cnd ?? null), disponivelEmProducao: async () => !!o.chaves };
    const monitoramento = { modo: async () => o.modo ?? 'PRODUCAO' };
    return { s: new CertidoesService(prisma as never, storage as never, serpro as never, monitoramento as never, { estado: async () => ({ configurado: !!o.cndt }), cndt: async () => o.cndt ?? null, crf: async () => null } as never), docs, arquivos, guardados, serpro };
  }

  it('anexa a CNDT: lê o PDF, guarda na pasta Certidões com validade e a lista mostra a atual com o arquivo', async () => {
    const t = montar();
    const pdf = await pdfCom('CERTIDAO NEGATIVA DE DEBITOS TRABALHISTAS CNPJ: 58.509.112/0001-52 Expedicao: 10/11/2026 Validade: 09/05/2027');
    const r = await t.s.anexar('E1', 'TRABALHISTA', pdf, undefined, { email: 'qa@fal' });
    expect(r.leitura).toMatchObject({ status: 'CONCLUIDO', validade: '09/05/2027' });
    expect(t.arquivos[0]).toMatchObject({ pasta: 'Certidões', empresa_id: 'E1', tipo_mime: 'application/pdf' });
    expect(t.docs[0]).toMatchObject({ tipo_id: 'T3', arquivo_id: 'A0', criado_por: 'qa@fal' });
    expect((t.docs[0].validade as Date).toISOString().slice(0, 10)).toBe('2027-05-09');
    const l = await t.s.listar('E1');
    const cndt = l.certidoes.find((c) => c.tipo === 'TRABALHISTA')!;
    expect(cndt.atual).toMatchObject({ situacao: 'VALIDO', arquivo: { id: 'A0' } });
    expect(l.certidoes.find((c) => c.tipo === 'ESTADUAL')!.atual).toBeNull();
    expect(l.empresa).toMatchObject({ uf: 'MT', municipio: 'Sorriso' });
  });

  it('PDF de outra certidão é recusado; a validade informada na tela vence a lida', async () => {
    const t = montar();
    await expect(t.s.anexar('E1', 'FGTS', await pdfCom('CERTIDAO NEGATIVA DE DEBITOS TRABALHISTAS'), undefined, {})).rejects.toThrow(/não parece ser/);
    const r = await t.s.anexar('E1', 'MUNICIPAL', await pdfCom('CERTIDAO NEGATIVA DE DEBITOS MUNICIPAIS CNPJ 58.509.112/0001-52'), '2027-02-28', {});
    expect(r.leitura.validade).toBe('28/02/2027');
    await expect(t.s.anexar('E1', 'OUTRA', Buffer.from('%PDF-'), undefined, {})).rejects.toThrow(/desconhecido/);
  });

  it('emite a CND federal pela API só em produção, e guarda o PDF com validade e código', async () => {
    const demo = montar({ modo: 'DEMONSTRACAO' });
    await expect(demo.s.emitirFederal('E1', {})).rejects.toThrow(/só funciona em produção/);
    const sem = montar({ modo: 'PRODUCAO' });
    await expect(sem.s.emitirFederal('E1', {})).rejects.toThrow(/não está configurada/);
    const t = montar({ modo: 'PRODUCAO', chaves: true, cnd: { status: 'CONCLUIDO', resumo: 'Certidão negativa', demonstracao: false, pdf: Buffer.from('%PDF-1.4'), detalhes: [{ rotulo: 'Situação', valor: 'Negativa' }, { rotulo: 'Emissão', valor: '12/11/2026' }, { rotulo: 'Validade', valor: '11/05/2027' }, { rotulo: 'Código de controle', valor: 'ABCD1234' }] } });
    const r = await t.s.emitirFederal('E1', { email: 'qa@fal' });
    expect(r.emitida).toBe(true);
    expect(t.serpro.certidaoFederal).toHaveBeenCalledWith('58509112000152', 'PRODUCAO');
    expect(t.docs[0]).toMatchObject({ tipo_id: 'T0', numero: 'ABCD1234' });
    expect((await t.s.listar('E1')).emissao_automatica_federal).toBe(true);
  });
  it('emite a CNDT pela Infosimples e guarda com validade e origem; sem Infosimples pede o token', async () => {
    const semToken = montar();
    await expect(semToken.s.emitir('E1', 'TRABALHISTA', { email: 'qa@fal' })).rejects.toThrow(/Infosimples não está configurada/);
    await expect(semToken.s.emitir('E1', 'ESTADUAL', { email: 'qa@fal' })).rejects.toThrow(/não tem emissão automática/);
    const t = montar({ cndt: { status: 'CONCLUIDO', situacao: 'Certidão Negativa de Débitos Trabalhistas', resumo: 'ok', emissao: '12/11/2026', validade: '11/05/2027', numero: 'C-1', detalhes: [], comprovante: { buffer: Buffer.from('%PDF-'), tipo: 'application/pdf', extensao: 'pdf' } } });
    expect((await t.s.emitir('E1', 'TRABALHISTA', { email: 'qa@fal' })).emitida).toBe(true);
    expect(t.docs[0]).toMatchObject({ tipo_id: 'T3', numero: 'C-1' });
    const l = await t.s.listar('E1');
    expect(l.emissao_automatica).toMatchObject({ TRABALHISTA: true, FGTS: true });
    expect(l.certidoes.find((c) => c.tipo === 'TRABALHISTA')!.historico[0].origem).toBe('Portal oficial, pela Infosimples');
  });
});
