import { BadRequestException } from '@nestjs/common';
export type OpcoesValidacao = { cClassTrib: boolean; duplicidades: boolean; principioAtivo: boolean; dataInicio: string; dataFim: string; erps: string[]; addons: string[]; gruposContabeis: boolean; grupos: boolean };
export const OPCOES_PADRAO: OpcoesValidacao = { cClassTrib: true, duplicidades: false, principioAtivo: false, dataInicio: '', dataFim: '', erps: [], addons: [], gruposContabeis: false, grupos: false };
export function lerOpcoes(bruto?: string): OpcoesValidacao {
  let o: Partial<OpcoesValidacao>;
  try { o = bruto ? JSON.parse(bruto) : {}; } catch { throw new BadRequestException('Opções de validação inválidas.'); }
  if (!o || Array.isArray(o) || typeof o !== 'object') throw new BadRequestException('Opções inválidas.');
  for (const k of ['cClassTrib', 'duplicidades', 'principioAtivo', 'gruposContabeis', 'grupos'] as const) if (o[k] !== undefined && typeof o[k] !== 'boolean') throw new BadRequestException('Opção inválida: ' + k);
  if (o.erps !== undefined && (!Array.isArray(o.erps) || o.erps.length > 10 || o.erps.some(e => typeof e !== 'string' || e.length > 80))) throw new BadRequestException('ERPs inválidos.');
  if (o.addons !== undefined && (!Array.isArray(o.addons) || o.addons.some(a => !['pims','farmbox'].includes(a)))) throw new BadRequestException('Add-ons inválidos.');
  const r = { ...OPCOES_PADRAO, ...o };
  for (const d of [r.dataInicio, r.dataFim]) if (typeof d !== 'string' || (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d))) throw new BadRequestException('Data inválida.');
  if (r.dataInicio && r.dataFim && r.dataInicio > r.dataFim) throw new BadRequestException('O início do período deve ser anterior ao fim.');
  return r;
}
export function normalizarProduto(v: string) { return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function dataProduto(v: string): string | null {
  const s = v.trim();
  let iso = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s) ? s.slice(0,10) : '';
  const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) iso = br[3] + '-' + br[2] + '-' + br[1];
  if (!iso || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10) !== iso) return null;
  return iso;
}
