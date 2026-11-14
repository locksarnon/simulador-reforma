import { describe, expect, it } from 'vitest';
import { indiceHistorico, lerEfd } from './recuperacao-xml-historico.service';

const cnpj = '12345678000199';
const chave = '352101' + cnpj + '550010000000011000000001';
const efd = (linhas: string[]) => Buffer.from([
  '|0000|015|0|01012021|31012021|EMPRESA|' + cnpj + '||SP|123456|3550308||||',
  ...linhas,
  '|9999|5|',
].join('\r\n'));
const nota = (data: string) => '|C100|1|0||55|00|1|1|' + chave + '|' + data + '|';
const xml = (assinatura: string, chaveProtocolo = chave) => Buffer.from(
  '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe' + chave + '"><ide><mod>55</mod></ide>'
  + '<emit><CNPJ>' + cnpj + '</CNPJ></emit></infNFe>' + assinatura + '</NFe><protNFe><infProt>'
  + '<chNFe>' + chaveProtocolo + '</chNFe><cStat>100</cStat><nProt>135210000000001</nProt></infProt></protNFe></nfeProc>',
);

describe('recuperação histórica de NF-e', () => {
  it('deduplica as chaves do registro C100 e restringe o período pela data de emissão', () => {
    const arquivo = efd([nota('14012021'), nota('15012021'), nota('15012021')]);
    expect(lerEfd(arquivo, cnpj, '2021-01-15', '2021-01-31')).toEqual({ competencia: '2021-01', chaves: new Set([chave]) });
    expect(lerEfd(arquivo, cnpj, '2021-01-16', '2021-01-31')?.chaves.size).toBe(0);
    expect(lerEfd(arquivo, '12345678000270', '2021-01-01', '2021-01-31')).toBeNull();
  });

  it('recusa XML sem assinatura, com protocolo de outra chave ou de outro CNPJ', () => {
    const assinatura = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>AAAA</SignatureValue></Signature>';
    expect(indiceHistorico(xml(assinatura), chave, cnpj)?.chave).toBe(chave);
    expect(indiceHistorico(xml(''), chave, cnpj)).toBeNull();
    expect(indiceHistorico(xml(assinatura, '0'.repeat(44)), chave, cnpj)).toBeNull();
    expect(indiceHistorico(xml(assinatura), chave, '12345678000270')).toBeNull();
  });
});
