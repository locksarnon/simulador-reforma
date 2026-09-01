import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseXml, getFirstDeep, getTextDeep } from '../importacao-xml/shared/xml-parser';

/**
 * Validador estrutural de DPS/NFS-e (Padrão Nacional, XSD v1.01 - 09/02/2026).
 * Não persiste nem loga o XML enviado — validação é feita em memória e só o
 * relatório (checks) sai da função.
 *
 * Três camadas, do "mínimo" ao "mais arriscado de afirmar":
 * - estruturaValida: XML bem formado + raiz reconhecida (DPS ou NFSe).
 * - prontoParaAutorizacao: campos obrigatórios do grupo IBS/CBS presentes e
 *   no formato/enum exigido pelo XSD oficial.
 * - conformidadeTributaria: cruzamento com nosso catálogo (Anexo VIII /
 *   ClassTrib) — é inferência nossa, catálogo pode estar incompleto, por
 *   isso nunca vira "erro bloqueante", só aviso.
 */

export interface ValidacaoCheck {
  camada: 'estrutura' | 'autorizacao' | 'conformidade';
  codigo: string;
  severidade: 'info' | 'warning' | 'blocking';
  mensagem: string;
}

export interface ValidacaoResultado {
  estruturaValida: boolean;
  prontoParaAutorizacao: boolean;
  conformidadeTributaria: boolean;
  checks: ValidacaoCheck[];
}

const RAIZES_RECONHECIDAS = ['dps', 'nfse'];

@Injectable()
export class ValidadorNfseService {
  constructor(private readonly prisma: PrismaService) {}

  async validar(xmlContent: string): Promise<ValidacaoResultado> {
    const checks: ValidacaoCheck[] = [];

    let doc: any;
    try {
      doc = parseXml(xmlContent);
    } catch (err: any) {
      checks.push({
        camada: 'estrutura',
        codigo: 'XML_MAL_FORMADO',
        severidade: 'blocking',
        mensagem: err?.message || 'XML mal formado.',
      });
      return { estruturaValida: false, prontoParaAutorizacao: false, conformidadeTributaria: false, checks };
    }

    const root = doc.documentElement;
    const rootName = (root?.localName || root?.nodeName || '').toLowerCase();
    if (!root || !RAIZES_RECONHECIDAS.includes(rootName)) {
      checks.push({
        camada: 'estrutura',
        codigo: 'RAIZ_INESPERADA',
        severidade: 'warning',
        mensagem: `Elemento raiz "${rootName || '(vazio)'}" não é "DPS" nem "NFSe" (Padrão Nacional, XSD v1.01). A validação segue mesmo assim, buscando os campos em qualquer profundidade.`,
      });
    } else {
      checks.push({
        camada: 'estrutura',
        codigo: 'RAIZ_OK',
        severidade: 'info',
        mensagem: `Elemento raiz reconhecido: ${root.localName || root.nodeName}.`,
      });
    }
    const estruturaValida = true;

    let prontoParaAutorizacao = true;

    const finNFSe = getTextDeep(root, 'finNFSe');
    if (!finNFSe) {
      checks.push({ camada: 'autorizacao', codigo: 'FINNFSE_AUSENTE', severidade: 'blocking', mensagem: 'Campo obrigatório "finNFSe" não encontrado.' });
      prontoParaAutorizacao = false;
    } else if (finNFSe !== '0') {
      checks.push({ camada: 'autorizacao', codigo: 'FINNFSE_INVALIDO', severidade: 'blocking', mensagem: `finNFSe = "${finNFSe}" inválido — o XSD só aceita "0" (NFS-e regular).` });
      prontoParaAutorizacao = false;
    } else {
      checks.push({ camada: 'autorizacao', codigo: 'FINNFSE_OK', severidade: 'info', mensagem: 'finNFSe = 0 (NFS-e regular).' });
    }

    const cIndOp = getTextDeep(root, 'cIndOp');
    if (!cIndOp) {
      checks.push({ camada: 'autorizacao', codigo: 'CINDOP_AUSENTE', severidade: 'blocking', mensagem: 'Campo obrigatório "cIndOp" não encontrado — sem ele não é possível determinar onde o IBS/CBS incide (territorialidade, Art. 11 da LC 214/2025).' });
      prontoParaAutorizacao = false;
    } else if (!/^\d{6}$/.test(cIndOp)) {
      checks.push({ camada: 'autorizacao', codigo: 'CINDOP_FORMATO_INVALIDO', severidade: 'blocking', mensagem: `cIndOp = "${cIndOp}" não tem o formato de 6 dígitos numéricos exigido pelo XSD.` });
      prontoParaAutorizacao = false;
    } else {
      checks.push({ camada: 'autorizacao', codigo: 'CINDOP_OK', severidade: 'info', mensagem: `cIndOp = ${cIndOp} — formato correto.` });
    }

    const indDest = getTextDeep(root, 'indDest');
    if (!indDest) {
      checks.push({ camada: 'autorizacao', codigo: 'INDDEST_AUSENTE', severidade: 'blocking', mensagem: 'Campo obrigatório "indDest" não encontrado.' });
      prontoParaAutorizacao = false;
    } else if (!['0', '1'].includes(indDest)) {
      checks.push({ camada: 'autorizacao', codigo: 'INDDEST_INVALIDO', severidade: 'blocking', mensagem: `indDest = "${indDest}" inválido — o XSD só aceita 0 ou 1.` });
      prontoParaAutorizacao = false;
    } else {
      checks.push({
        camada: 'autorizacao',
        codigo: 'INDDEST_OK',
        severidade: 'info',
        mensagem: indDest === '0' ? 'indDest = 0 (destinatário é o próprio tomador do serviço).' : 'indDest = 1 (destinatário difere do tomador).',
      });
    }

    const indFinal = getTextDeep(root, 'indFinal');
    if (indFinal && !['0', '1'].includes(indFinal)) {
      checks.push({ camada: 'autorizacao', codigo: 'INDFINAL_INVALIDO', severidade: 'blocking', mensagem: `indFinal = "${indFinal}" inválido — o XSD só aceita 0 ou 1.` });
      prontoParaAutorizacao = false;
    } else if (indFinal === '1') {
      checks.push({ camada: 'autorizacao', codigo: 'INDFINAL_OK', severidade: 'info', mensagem: 'indFinal = 1 (uso/consumo pessoal, art. 57 da LC 214/2025).' });
    }

    const cClassTrib = getTextDeep(root, 'cClassTrib');
    if (cClassTrib && !/^\d{6}$/.test(cClassTrib)) {
      checks.push({ camada: 'autorizacao', codigo: 'CCLASSTRIB_FORMATO_INVALIDO', severidade: 'blocking', mensagem: `cClassTrib = "${cClassTrib}" não tem o formato de 6 dígitos exigido.` });
      prontoParaAutorizacao = false;
    }

    const valoresEl = getFirstDeep(root, 'valores');
    if (!valoresEl) {
      checks.push({ camada: 'autorizacao', codigo: 'VALORES_AUSENTE', severidade: 'blocking', mensagem: 'Grupo obrigatório "valores" (base de cálculo/valores do serviço) não encontrado.' });
      prontoParaAutorizacao = false;
    }

    // Camada de conformidade: cruzamento com nosso catálogo próprio (Anexo
    // VIII / ClassTrib). É inferência nossa — catálogo pode estar
    // incompleto — por isso nunca bloqueia, só informa/alerta.
    let conformidadeTributaria = prontoParaAutorizacao;

    if (cIndOp && /^\d{6}$/.test(cIndOp)) {
      const conhecido = await this.prisma.correlacaoServico.findFirst({ where: { ind_op: cIndOp } });
      if (!conhecido) {
        checks.push({
          camada: 'conformidade',
          codigo: 'CINDOP_NAO_CATALOGADO',
          severidade: 'warning',
          mensagem: `cIndOp ${cIndOp} não foi localizado no nosso catálogo (Anexo VIII RTC). Pode ser válido mesmo assim — nosso catálogo não é exaustivo — mas vale conferir manualmente.`,
        });
        conformidadeTributaria = false;
      } else {
        checks.push({
          camada: 'conformidade',
          codigo: 'CINDOP_CATALOGADO',
          severidade: 'info',
          mensagem: `cIndOp ${cIndOp} corresponde, no nosso catálogo, a: "${conhecido.local_incidencia_ibs || conhecido.descricao_item || '—'}".`,
        });
      }
    }

    if (cClassTrib && /^\d{6}$/.test(cClassTrib)) {
      const conhecido = await this.prisma.classTrib.findFirst({ where: { c_class_trib: cClassTrib } });
      if (!conhecido) {
        checks.push({
          camada: 'conformidade',
          codigo: 'CCLASSTRIB_NAO_CATALOGADO',
          severidade: 'warning',
          mensagem: `cClassTrib ${cClassTrib} não está cadastrado em Catálogos IBS/CBS. Pode ser válido — nosso cadastro pode estar incompleto — mas vale conferir manualmente.`,
        });
        conformidadeTributaria = false;
      } else {
        checks.push({
          camada: 'conformidade',
          codigo: 'CCLASSTRIB_CATALOGADO',
          severidade: 'info',
          mensagem: `cClassTrib ${cClassTrib}: ${conhecido.descricao_oficial || '(sem descrição cadastrada)'}.`,
        });
      }
    }

    return { estruturaValida, prontoParaAutorizacao, conformidadeTributaria, checks };
  }
}
