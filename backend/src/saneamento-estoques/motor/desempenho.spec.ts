import { describe, expect, it } from 'vitest';
import type { ItemTrabalho } from '../tipos';
import { executarMotor } from './index';

// Base sintética de 30 mil itens (sem dado real): famílias de produto × medidas × marcas, com repetições e erros plantados.
const FAMILIAS = ['PARAFUSO SEXTAVADO', 'ROLAMENTO RIGIDO', 'HERBICIDA GLIFOSATO', 'FUNGICIDA TEBUCONAZOL', 'ADUBO NPK', 'OLEO LUBRIFICANTE', 'CORREIA DENTADA', 'FILTRO AR', 'LUVA NITRILICA', 'MANGUEIRA HIDRAULICA',
  'SEMENTE SOJA', 'SEMENTE MILHO', 'CABO FLEXIVEL', 'LAMPADA LED', 'TINTA ACRILICA', 'BOMBA CENTRIFUGA', 'VALVULA ESFERA', 'ARRUELA LISA', 'PORCA SEXTAVADA', 'ANEL VEDACAO'];
const GRUPOS = ['PECAS', 'INSUMOS', 'DEFENSIVOS', 'SEMENTES', 'ELETRICA', 'DIVERSOS'];
const MARCAS = ['ALFA', 'BETA', 'GAMA', 'DELTA', 'OMEGA', 'SIGMA', 'TETA', 'KAPPA'];

function gerar(n: number): ItemTrabalho[] {
  const out: ItemTrabalho[] = [];
  for (let i = 0; i < n; i++) {
    const f = FAMILIAS[i % FAMILIAS.length]; const medida = 1 + (i % 97); const marca = MARCAS[(i >> 3) % MARCAS.length]; const modelo = `M${i % 4999}`;
    out.push({
      id: `id${i}`, codigo: String(i % 29000 === 0 && i > 0 ? i - 1 : i).padStart(6, '0'), estabelecimento: i % 7 === 0 ? 'FILIAL' : null,
      descricao: i % 53 === 0 ? `${f.toLowerCase()} ${medida}mm ${marca} ${modelo}` : `${f} ${medida}MM ${marca} ${modelo}`, unidade: ['UN', 'KG', 'L', 'CX', 'SC', 'TON'][i % 6], ncm: i % 11 === 0 ? null : String(10000000 + (i % 900) * 1000), grupo: GRUPOS[i % GRUPOS.length],
      ativo: i % 13 !== 0, saldo: i % 5 === 0 ? i % 300 : null, ultimaMovimentacao: i % 9 === 0 ? null : `202${5 + (i % 2)}-0${1 + (i % 9)}-15`, fabricante: marca, referencia: i % 6 === 0 ? `REF${i % 3000}` : null, finalidade: null, campos: {},
    });
  }
  return out;
}

describe('desempenho: 30 mil itens', () => {
  it('roda todas as camadas sem estourar memória, em tempo razoável', () => {
    const itens = gerar(30000);
    const t0 = Date.now();
    const antes = process.memoryUsage().heapUsed;
    const r = executarMotor(itens, { dataBase: '2026-11-25', atividades: [], erp: null, corteMovimentacao: '2025-06-01' });
    const ms = Date.now() - t0;
    const mb = Math.round((process.memoryUsage().heapUsed - antes) / 1048576);
    const porCamada = Object.fromEntries(r.map((x) => [x.camada, x.casos.length]));
    console.log(`[desempenho] 30000 itens: ${ms} ms, +${mb} MB de heap, casos por camada`, JSON.stringify(porCamada));
    expect(r).toHaveLength(6); expect(r.every((x) => x.analisados === 30000)).toBe(true);
    expect(ms).toBeLessThan(300000);
  }, 400000);
});
