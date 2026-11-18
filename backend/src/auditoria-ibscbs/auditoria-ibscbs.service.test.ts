import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditoriaIbsCbsService } from './auditoria-ibscbs.service';

const NFE = (chave: string) => `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${chave}" versao="4.00">
<ide><mod>55</mod><dhEmi>2026-10-10T10:00:00-03:00</dhEmi><tpNF>1</tpNF><cMunFG>4106902</cMunFG><tpAmb>1</tpAmb></ide><emit><CNPJ>00000000000191</CNPJ></emit>
<det nItem="1"><prod><NCM>84714900</NCM><CFOP>5102</CFOP><xProd>P</xProd><vProd>100.00</vProd></prod><imposto>
<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>100.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.10</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.10</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>0.90</vCBS></gCBS></gIBSCBS></IBSCBS></imposto></det></infNFe></NFe></nfeProc>`;

function montar(opcoes: { xmls: Record<string, string | Error>; calculadora: () => Promise<unknown> }) {
  const gravados = new Map<string, Record<string, unknown>>();
  const docs = Object.keys(opcoes.xmls).map((id) => ({ id, empresa_id: 'E1', chave: `chave-${id}`, modelo: '55', data_emissao: new Date('2026-10-10'), emitente_doc: '00000000000191', emitente_nome: 'X', storage_key: `k-${id}` }));
  const prisma = {
    $queryRaw: vi.fn(async () => docs.map((d) => ({ id: d.id }))),
    classTrib: { findMany: async () => [{ c_class_trib: '000001' }] },
    documentoXml: { findUniqueOrThrow: async ({ where }: { where: { id: string } }) => docs.find((d) => d.id === where.id)!, findUnique: async ({ where }: { where: { id: string } }) => docs.find((d) => d.id === where.id) ?? null },
    empresa: { findUnique: async () => ({ cnpj_cpf: '11.222.333/0001-81' }) },
    auditoriaIbsCbs: { upsert: vi.fn(async ({ where, create }: { where: { documento_id: string }; create: Record<string, unknown> }) => { gravados.set(where.documento_id, create); return create; }) },
  };
  const storage = { getObjectBuffer: async (k: string) => { const x = opcoes.xmls[k.replace('k-', '')]; if (x instanceof Error) throw x; return Buffer.from(x as string); } };
  const calc = { versaoServico: async () => ({ versaoApp: '1.6.1', versaoDb: 'V0059' }), post: opcoes.calculadora };
  return { s: new AuditoriaIbsCbsService(prisma as never, storage as never, calc as never), gravados, prisma };
}
const OK = async () => ({ http: 200, json: { objetos: [{ nObj: 1, estadoItem: 'CALCULADO', tribCalc: { IBSCBS: { gIBSCBS: { vBC: '100.00', gIBSUF: { vIBSUF: '0.10' }, gIBSMun: { vIBSMun: '0.00' }, vIBS: '0.10', gCBS: { vCBS: '0.90' } } } } }] } });

describe('auditoria do IBS/CBS: fila e falhas', () => {
  it('documento que não dá para conferir é gravado como FALHA e não trava o resto da fila', async () => {
    const { s, gravados } = montar({ xmls: { a: new Error('objeto sumido do armazenamento'), b: NFE('41261100000000000191550010000000011000000011') }, calculadora: OK });
    const r = await s.rodar();
    expect(r.conferidas).toBe(1);
    expect(gravados.get('a')).toMatchObject({ situacao: 'FALHA', versao_db: 'V0059+r4' });
    expect((gravados.get('a')!.detalhes as { aviso: string }[])[0].aviso).toContain('objeto sumido');
    expect(gravados.get('b')).toMatchObject({ situacao: 'CONFERE', papel: 'RECEBIDA' });
  });
  it('XML que não é NF-e também vira FALHA com o motivo', async () => {
    const { s, gravados } = montar({ xmls: { a: '<outra/>' }, calculadora: OK });
    await s.rodar();
    expect(gravados.get('a')).toMatchObject({ situacao: 'FALHA' });
  });
  it('calculadora fora do ar no meio do lote: interrompe sem gravar resultado definitivo', async () => {
    const queda = async () => { throw new BadRequestException('A calculadora oficial da Receita não respondeu agora.'); };
    const { s, gravados } = montar({ xmls: { a: NFE('41261100000000000191550010000000011000000011'), b: NFE('41261100000000000191550010000000021000000022') }, calculadora: queda });
    const r = await s.rodar();
    expect(r.conferidas).toBe(0);
    expect(gravados.size).toBe(0);
  });
  it('resposta 5xx da calculadora é passageira (não grava); 4xx sem itens é falha da nota (grava)', async () => {
    const c5 = montar({ xmls: { a: NFE('41261100000000000191550010000000011000000011') }, calculadora: async () => ({ http: 503, json: null }) });
    await c5.s.rodar();
    expect(c5.gravados.size).toBe(0);
    const c4 = montar({ xmls: { a: NFE('41261100000000000191550010000000011000000011') }, calculadora: async () => ({ http: 422, json: null }) });
    await c4.s.rodar();
    expect(c4.gravados.get('a')).toMatchObject({ situacao: 'FALHA' });
  });
  it('a consulta de pendentes ignora falha recente e refaz a antiga (6 h) e versão diferente', async () => {
    const { s, prisma } = montar({ xmls: { a: NFE('41261100000000000191550010000000011000000011') }, calculadora: OK });
    await s.rodar();
    const sql = String((prisma.$queryRaw.mock.calls[0] as unknown[])[0] ? JSON.stringify((prisma.$queryRaw.mock.calls[0] as unknown[])[0]) : '');
    expect(sql).toContain('FALHA');
    expect(sql).toContain('6 hours');
    expect(sql).toContain('versao_db');
  });
});
