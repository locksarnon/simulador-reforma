import { describe, expect, it, vi } from 'vitest';
import { ConsultaDistribuicao, ErroDeComunicacao, RespostaDistribuicao } from './distribuicao-dfe.cliente';
import { DistribuicaoDfeHttp } from './distribuicao-dfe.http';
import { DistribuicaoDfeRoteador } from './distribuicao-dfe.roteador';
import { NfseAdnHttp } from './nfse-adn.http';

const material = { certificadoId: 'k1', documento: '12345678000195', keyPem: 'k', certPem: 'c', cadeiaPem: [] };
const consulta = (tipo: ConsultaDistribuicao['tipo']): ConsultaDistribuicao => ({ tipo, ambiente: 'HOMOLOGACAO', documento: '12345678000195', ufAutor: '51', ultNSU: '000000000000000' });
const resposta = (xMotivo: string): RespostaDistribuicao => ({ cStat: '137', xMotivo, ultNSU: '000000000000000', maxNSU: '000000000000000', documentos: [] });

describe('DistribuicaoDfeRoteador', () => {
  const montar = () => {
    const sefaz = { consultar: vi.fn(async () => resposta('sefaz')) };
    const adn = { consultar: vi.fn(async () => resposta('adn')) };
    return { sefaz, adn, roteador: new DistribuicaoDfeRoteador(sefaz as unknown as DistribuicaoDfeHttp, adn as unknown as NfseAdnHttp) };
  };

  it('NFS-e vai ao ADN, com a consulta e o certificado como chegaram', async () => {
    const { sefaz, adn, roteador } = montar();
    const c = consulta('NFSE');
    expect((await roteador.consultar(c, material)).xMotivo).toBe('adn');
    expect(adn.consultar).toHaveBeenCalledWith(c, material);
    expect(sefaz.consultar).not.toHaveBeenCalled();
  });

  it('NF-e, CT-e e MDF-e vão à Distribuição de DF-e da SEFAZ', async () => {
    const { sefaz, adn, roteador } = montar();
    for (const tipo of ['NFE', 'CTE', 'MDFE'] as const) {
      const c = consulta(tipo);
      expect((await roteador.consultar(c, material)).xMotivo, tipo).toBe('sefaz');
      expect(sefaz.consultar).toHaveBeenLastCalledWith(c, material);
    }
    expect(sefaz.consultar).toHaveBeenCalledTimes(3);
    expect(adn.consultar).not.toHaveBeenCalled();
  });

  it('a falha de comunicação do serviço escolhido chega a quem chamou', async () => {
    const { adn, roteador } = montar();
    adn.consultar.mockRejectedValueOnce(new ErroDeComunicacao('tempo esgotado'));
    await expect(roteador.consultar(consulta('NFSE'), material)).rejects.toThrow(ErroDeComunicacao);
  });
});
