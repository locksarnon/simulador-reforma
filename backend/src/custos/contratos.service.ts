import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { textoDoPdf } from '../pre-analise/leitor-certidoes';
import { INTEGRACOES } from './custos.service';

type Usuario = { email?: string; role?: string } | undefined;
const CHAVE = 'custos_contratos';
const LIMITE = 15 * 1024 * 1024;

export type ContratoAnexo = { id: string; nome: string; integracao: string; numero: string | null; objeto: string | null; vigencia: string | null; tamanho: number; storage_key: string; enviado_por: string | null; enviado_em: string };

/**
 * Lê a capa do contrato do Serpro ("Registro de Documentos Contratuais"): número do pedido eletrônico, objeto e vigência.
 * O produto vem do objeto (Integra Contador, Consulta CND, Consulta Dívida Ativa, Consulta NF-e); Infosimples pelo nome.
 */
export function lerCapaContrato(texto: string) {
  const t = texto.replace(/\s+/g, ' ');
  const numero = t.match(/Pedido\s+Eletr[oô]nico\s*(\d{5,7})/i)?.[1] ?? t.match(/\b(6\d{5})\b/)?.[1] ?? null;
  const vigencia = t.match(/(\d{2}\/\d{2}\/\d{4}\s+a\s+\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;
  const integracao = /integra\s*contador/i.test(t) ? 'Integra Contador'
    : /consulta\s*nf-?e/i.test(t) ? 'Consulta NF-e'
    : /d[ií]vida\s*ativa/i.test(t) ? 'Consulta Dívida Ativa'
    : /consulta\s*cnd/i.test(t) ? 'Consulta CND'
    : /infosimples/i.test(t) ? 'Infosimples' : null;
  const objeto = t.match(/(Integra Contador[^.]{0,40}|CONSULTA NFE[^.]{0,30}|Consulta D[ií]vida Ativa[^.]{0,30}|Consulta CND)/i)?.[1]?.trim() ?? null;
  return { numero, vigencia, integracao, objeto: objeto ? objeto.replace(/\s+(CONTRATO DE ADES[ÃA]O|O CLIENTE).*$/i, '').trim() : null };
}

/** Administração > Custos das ferramentas: os contratos (PDF) de cada integração, guardados no InTAX, junto da tabela de preços. */
@Injectable()
export class ContratosService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  private exigirAdmin(u: Usuario) {
    if (u?.role !== 'admin') throw new ForbiddenException('Só administradores veem e enviam os contratos.');
  }

  private async lerLista(): Promise<ContratoAnexo[]> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE } }).catch(() => null);
    try { const v = p ? JSON.parse(p.valor) : []; return Array.isArray(v) ? v : []; } catch { return []; }
  }

  private async gravar(lista: ContratoAnexo[]) {
    const valor = JSON.stringify(lista);
    await this.prisma.parametroSistema.upsert({ where: { chave: CHAVE }, update: { valor }, create: { chave: CHAVE, valor, descricao: 'Contratos das ferramentas externas (anexos)' } });
  }

  async listar(u: Usuario) {
    this.exigirAdmin(u);
    return (await this.lerLista()).map(({ storage_key: _k, ...c }) => c).sort((a, b) => INTEGRACOES.indexOf(a.integracao as never) - INTEGRACOES.indexOf(b.integracao as never) || a.nome.localeCompare(b.nome));
  }

  async enviar(arquivo: { buffer: Buffer; originalname?: string } | undefined, integracaoInformada: string | undefined, u: Usuario) {
    this.exigirAdmin(u);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo do contrato (PDF).');
    if (arquivo.buffer.length > LIMITE) throw new BadRequestException('O contrato passa de 15 MB.');
    if (arquivo.buffer.subarray(0, 5).toString() !== '%PDF-') throw new BadRequestException('O contrato precisa ser um PDF.');
    let capa: ReturnType<typeof lerCapaContrato> = { numero: null, vigencia: null, integracao: null, objeto: null };
    try { capa = lerCapaContrato(await textoDoPdf(arquivo.buffer)); } catch { /* PDF sem texto: fica o que o usuário escolheu */ }
    const integracao = INTEGRACOES.includes(integracaoInformada as never) ? integracaoInformada! : capa.integracao;
    if (!integracao) throw new BadRequestException('Não deu para identificar a integração deste contrato: escolha qual é.');
    const lista = await this.lerLista();
    if (capa.numero && lista.some((c) => c.numero === capa.numero)) throw new BadRequestException(`O contrato ${capa.numero} já está anexado.`);
    const id = randomUUID();
    const nome = (arquivo.originalname || `contrato-${capa.numero ?? id}.pdf`).replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 120);
    const storage_key = `custos/contratos/${id}.pdf`;
    await this.storage.guardar(storage_key, arquivo.buffer, 'application/pdf');
    const novo: ContratoAnexo = { id, nome, integracao, numero: capa.numero, objeto: capa.objeto, vigencia: capa.vigencia, tamanho: arquivo.buffer.length, storage_key, enviado_por: u?.email ?? null, enviado_em: new Date().toISOString() };
    await this.gravar([...lista, novo]);
    const { storage_key: _k, ...visivel } = novo;
    return visivel;
  }

  async arquivo(id: string, u: Usuario) {
    this.exigirAdmin(u);
    const c = (await this.lerLista()).find((x) => x.id === id);
    if (!c) throw new NotFoundException('Contrato não encontrado.');
    return { nome: c.nome, buffer: await this.storage.getObjectBuffer(c.storage_key) };
  }

  async remover(id: string, u: Usuario) {
    this.exigirAdmin(u);
    const lista = await this.lerLista();
    const c = lista.find((x) => x.id === id);
    if (!c) throw new NotFoundException('Contrato não encontrado.');
    await this.gravar(lista.filter((x) => x.id !== id));
    await this.storage.removeObject(c.storage_key).catch(() => undefined);
    return { ok: true };
  }
}
