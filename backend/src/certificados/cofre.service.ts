import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

export type SegredoCifrado = { cifrado: Buffer; iv: Buffer; tag: Buffer; chaveId: string };

type ChaveMestra = { id: string; chave: Buffer };

const INFO = Buffer.from('intax-cofre-v1');
/** Id gravado nos segredos cifrados com a CERT_VAULT_KEY única. */
export const ID_CHAVE_UNICA = 'v1';
/** Tamanho da etiqueta de autenticação do GCM: fixo, para uma etiqueta truncada nunca ser aceita. */
const TAG_BYTES = 16;

/**
 * Cofre de segredos do InTAX (certificados A1 dos clientes).
 *
 * AES-256-GCM com chave derivada por registro (HKDF-SHA256 da chave-mestra e do id do registro) e IV aleatório de 96 bits.
 * O contexto (dados autenticados) amarra o texto cifrado ao dono: um segredo copiado para outra empresa ou outro
 * certificado não decifra. A(s) chave(s)-mestra(s) vêm só do ambiente: CERT_VAULT_KEYS="id:base64,outro:base64"
 * (a primeira cifra; todas decifram, o que permite trocar a chave sem perder os segredos antigos) ou, mais simples,
 * CERT_VAULT_KEY (base64 de 32 bytes). Nunca vão para o banco, para o Git nem para os logs.
 *
 * ATENÇÃO NA TROCA DE CHAVE: o segredo guarda o id da chave que o cifrou, e a chave única de CERT_VAULT_KEY tem o id "v1".
 * Para trocar, passe CERT_VAULT_KEYS="v2:<nova>,v1:<antiga>": a nova cifra os envios novos e a "v1" continua abrindo os antigos.
 * Com outro id no lugar do "v1", os certificados já guardados deixam de abrir ("a chave que cifrou este certificado não está
 * mais no servidor").
 */
@Injectable()
export class CofreService {
  private chaves: ChaveMestra[] | null = null;

  constructor(private readonly config: ConfigService) {}

  private carregar(): ChaveMestra[] {
    if (this.chaves) return this.chaves;
    const lista = (this.config.get<string>('CERT_VAULT_KEYS') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const unica = this.config.get<string>('CERT_VAULT_KEY');
    const brutas = lista.length ? lista : unica ? [`${ID_CHAVE_UNICA}:${unica.trim()}`] : [];
    const out: ChaveMestra[] = [];
    for (const item of brutas) {
      const i = item.indexOf(':');
      const chave = Buffer.from(item.slice(i + 1), 'base64');
      if (i <= 0 || chave.length !== 32) {
        throw new Error('Chave do cofre inválida: informe 32 bytes em base64 (formato id:base64).');
      }
      out.push({ id: item.slice(0, i), chave });
    }
    this.chaves = out;
    return out;
  }

  /** Há ao menos uma chave-mestra válida configurada? */
  disponivel(): boolean {
    try {
      return this.carregar().length > 0;
    } catch {
      return false;
    }
  }

  private exigir(): ChaveMestra[] {
    let chaves: ChaveMestra[];
    try {
      chaves = this.carregar();
    } catch {
      throw new ServiceUnavailableException('A chave do cofre de certificados está inválida no servidor (CERT_VAULT_KEY).');
    }
    if (!chaves.length) {
      throw new ServiceUnavailableException('O cofre de certificados não está configurado no servidor (defina CERT_VAULT_KEY).');
    }
    return chaves;
  }

  private derivar(mestra: Buffer, registroId: string): Buffer {
    return Buffer.from(hkdfSync('sha256', mestra, Buffer.from(registroId, 'utf8'), INFO, 32));
  }

  cifrar(texto: string | Buffer, registroId: string, contexto: string): SegredoCifrado {
    const ativa = this.exigir()[0];
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.derivar(ativa.chave, registroId), iv, { authTagLength: TAG_BYTES });
    c.setAAD(Buffer.from(contexto, 'utf8'));
    const cifrado = Buffer.concat([c.update(typeof texto === 'string' ? Buffer.from(texto, 'utf8') : texto), c.final()]);
    return { cifrado, iv, tag: c.getAuthTag(), chaveId: ativa.id };
  }

  decifrar(segredo: SegredoCifrado, registroId: string, contexto: string): Buffer {
    const mestra = this.exigir().find((k) => k.id === segredo.chaveId);
    if (!mestra) throw new ServiceUnavailableException('A chave que cifrou este certificado não está mais no servidor.');
    try {
      if (segredo.tag.length !== TAG_BYTES) throw new Error('etiqueta de autenticação com tamanho inesperado');
      const d = createDecipheriv('aes-256-gcm', this.derivar(mestra.chave, registroId), segredo.iv, { authTagLength: TAG_BYTES });
      d.setAAD(Buffer.from(contexto, 'utf8'));
      d.setAuthTag(segredo.tag);
      return Buffer.concat([d.update(segredo.cifrado), d.final()]);
    } catch {
      throw new ServiceUnavailableException('Não foi possível abrir o segredo do certificado (chave do cofre ou dados alterados).');
    }
  }
}
