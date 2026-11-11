import { describe, expect, it } from 'vitest';
import { ErroLeituraDocumento } from './erros';
import { ErroLeituraNfse, lerNfse } from './nfse-leitor';
import { CHAVE_NFSE_EXEMPLO, chaveNfseExemplo, nfseExemplo } from './__fixtures__/nfse-exemplo';
import { nfeExemplo } from './__fixtures__/nfe-exemplo';

describe('lerNfse', () => {
  it('lê identificação, prestador, tomador, serviço, ISSQN, tributos federais, IBS/CBS, totais e complementares', () => {
    const n = lerNfse(nfseExemplo());
    expect(n).toMatchObject({
      chave: CHAVE_NFSE_EXEMPLO, versao: '1.01', numero: '123', municipioEmissor: 'Lucas do Rio Verde', ufEmissor: 'MT',
      ambienteGerador: '2', tipoAmbiente: '1', homologacao: false, situacao: '100', dataHoraEmissao: '2026-11-05T10:20:00-03:00',
      competencia: '2026-11-05', numeroDps: '123', serieDps: '1', dataHoraDps: '2026-11-05T10:15:00-03:00', emitente: '1',
    });
    expect(CHAVE_NFSE_EXEMPLO).toHaveLength(50);

    // o DPS só traz CNPJ, inscrição, contatos e regime do prestador: nome e endereço vêm do grupo emit da NFS-e
    expect(n.prestador).toMatchObject({
      documento: '11222333000181', tipoDocumento: 'CNPJ', inscricaoMunicipal: '45012', nome: 'AGRO CONSULTORIA E ASSISTENCIA TECNICA LTDA',
      fone: '65999887766', email: 'financeiro@agroconsultoria.example.com.br', simplesNacional: '1', regimeApuracaoSn: '', regimeEspecial: '0',
    });
    expect(n.prestador.endereco).toMatchObject({
      logradouro: 'AVENIDA BRASIL NORTE', numero: '1250', complemento: 'SALA 4', bairro: 'CENTRO', codigoMunicipio: '5105259', municipio: 'Lucas do Rio Verde', uf: 'MT', cep: '78455000',
    });
    expect(n.tomador).toMatchObject({ documento: '45723174000110', tipoDocumento: 'CNPJ', nome: 'FAZENDA SANTA LUZIA AGROPECUARIA S/A', fone: '6635441200' });
    // o nome do município só vem no XML para o município emissor, o da prestação e o de incidência: o tomador está em Sorriso, o da prestação
    expect(n.tomador?.endereco).toMatchObject({ logradouro: 'RODOVIA MT 242', numero: 'KM 18', codigoMunicipio: '5107925', municipio: 'Sorriso', uf: 'MT', cep: '78890000' });
    expect(n.destinatario).toBeNull();
    expect(n.intermediario).toBeNull();

    expect(n.servico).toMatchObject({
      codigoTribNacional: '070102', codigoTribMunicipal: '', descricaoTribNacional: 'Agronomia e congêneres.', descricaoTribMunicipal: '', codigoNbs: '115021100',
      local: { codigoMunicipio: '5107925', municipio: 'Sorriso', uf: 'MT', pais: '' },
    });
    expect(n.servico.descricao).toContain('Assistência técnica agronômica');
    expect(n.issqn).toMatchObject({
      tipoTributacao: '1', incidencia: { codigoMunicipio: '5105259', municipio: 'Lucas do Rio Verde', uf: 'MT', pais: '' },
      baseCalculo: '8500.00', aliquota: '2.00', tipoRetencao: '1', valor: '170.00', tipoImunidade: '', tipoSuspensao: '', deducoes: '',
    });
    expect(n.federal).toMatchObject({ irrf: '', contribuicaoPrevidenciaria: '', contribuicoesSociais: '', pis: '55.25', cofins: '255.00', tipoRetencaoPisCofins: '2' });
    expect(n.ibsCbs).toMatchObject({
      presente: true, cst: '000', classificacao: '000001', indicadorOperacao: '100301', indicadorDestinatario: '0', finalidade: '0',
      localidade: { codigoMunicipio: '5107925', municipio: 'Sorriso', uf: 'MT' }, baseCalculo: '8019.75', totalIbs: '8.02', totalNf: '8500.00',
      estadual: { aliquota: '0.10', reducao: '', aliquotaEfetiva: '0.10', valor: '8.02' },
      municipal: { aliquota: '0.00', aliquotaEfetiva: '0.00', valor: '0.00' },
      cbs: { aliquota: '0.90', aliquotaEfetiva: '0.90', valor: '72.18' },
    });
    expect(n.totais).toEqual({ valorServico: '8500.00', descontoIncondicionado: '', descontoCondicionado: '', totalRetencoes: '0.00', valorLiquido: '8500.00' });
    expect(n.tributosAproximados).toEqual({ tipo: 'valor', federal: '1143.25', estadual: '0.00', municipal: '170.00', percentualSimples: '' });
    expect(n.complementares).toMatchObject({ informacoes: 'Pagamento em 30 dias. Safra 2026/27.', documentoTecnico: 'ART 1420260012345', numeroPedido: 'PO-2026-0457', itensPedido: [], usoMunicipio: '' });
  });

  it('lê os grupos opcionais: destinatário, intermediário, prestador completo na DPS, código municipal e todos os complementos', () => {
    const n = lerNfse(nfseExemplo({
      destinatarioDistinto: true, comIntermediario: true, prestadorCompletoNaDps: true, codigoMunicipal: true, todosOsComplementos: true, nomePrestador: 'OUTRO NOME LTDA',
    }));
    expect(n.ibsCbs.indicadorDestinatario).toBe('1');
    expect(n.destinatario).toMatchObject({ documento: '45723174000200', nome: 'FAZENDA SANTA LUZIA AGROPECUARIA S/A - FILIAL SINOP', inscricaoMunicipal: '' });
    // o município do destinatário não é um dos que o XML nomeia: fica o código e a UF
    expect(n.destinatario?.endereco).toMatchObject({ codigoMunicipio: '5107909', municipio: '', uf: 'MT', cep: '78550000' });
    expect(n.intermediario).toMatchObject({ documento: '03778899000140', inscricaoMunicipal: '88120', nome: 'INTERMEDIARIA DE NEGOCIOS AGRO LTDA', fone: '6532110090' });
    expect(n.prestador.nome).toBe('OUTRO NOME LTDA');
    expect(n.prestador.endereco).toMatchObject({ logradouro: 'AVENIDA BRASIL NORTE', municipio: 'Lucas do Rio Verde', cep: '78455000' });
    expect(n.servico).toMatchObject({ codigoTribMunicipal: '001', descricaoTribMunicipal: 'Assistência técnica agronômica a produtores rurais' });
    expect(n.complementares).toEqual({
      informacoes: 'Pagamento em 30 dias. Safra 2026/27.', substituida: '51052592211222333000181000000000009926100987654321', documentoReferencia: 'Contrato 2026/118',
      codigoObra: 'CNO-90.123.45678/90', inscricaoImobiliaria: '01.02.003.0045.001', codigoEvento: 'EVT-2026-33', documentoTecnico: 'ART 1420260012345',
      numeroPedido: 'PO-2026-0457', itensPedido: ['1', '2', '5'], usoMunicipio: 'Alvará municipal 2026/4412',
    });
  });

  it('retenções do ISSQN e federais, tributos aproximados em % ou sem estimativa, homologação e situação', () => {
    const n = lerNfse(nfseExemplo({ issqnRetido: true, retencoesFederais: true, tributosAproximados: 'percentual', homologacao: true, situacao: '102' }));
    expect(n.issqn.tipoRetencao).toBe('2');
    expect(n.federal).toMatchObject({ irrf: '127.50', contribuicoesSociais: '85.00', tipoRetencaoPisCofins: '3' });
    expect(n.totais.totalRetencoes).toBe('382.50');
    expect(n.totais.valorLiquido).toBe('8117.50');
    expect(n.tributosAproximados).toEqual({ tipo: 'percentual', federal: '13.45', estadual: '0.00', municipal: '2.00', percentualSimples: '' });
    expect(n).toMatchObject({ homologacao: true, tipoAmbiente: '2', situacao: '102' });
    expect(lerNfse(nfseExemplo({ tributosAproximados: 'nenhum' })).tributosAproximados).toEqual({ tipo: '', federal: '', estadual: '', municipal: '', percentualSimples: '' });
  });

  it('optante do Simples Nacional: regime, sem valores de ISSQN nem IBS/CBS, só o percentual aproximado do Simples', () => {
    const n = lerNfse(nfseExemplo({ simplesNacional: true }));
    expect(n.prestador).toMatchObject({ simplesNacional: '3', regimeApuracaoSn: '1', regimeEspecial: '0' });
    expect(n.issqn).toMatchObject({ baseCalculo: '', aliquota: '', valor: '' });
    expect(n.ibsCbs.presente).toBe(false);
    expect(n.ibsCbs).toMatchObject({ cst: '', baseCalculo: '', totalNf: '', finalidade: '' });
    expect(n.tributosAproximados).toEqual({ tipo: '', federal: '', estadual: '', municipal: '', percentualSimples: '6.00' });
  });

  it('serviço sem incidência de ISSQN (990101) não traz o município de incidência', () => {
    const n = lerNfse(nfseExemplo({ naoSujeitaIssqn: true }));
    expect(n.servico).toMatchObject({ codigoTribNacional: '990101', descricaoTribNacional: 'Serviços sem a incidência de ISSQN e ICMS' });
    expect(n.issqn).toMatchObject({ tipoTributacao: '4', incidencia: { codigoMunicipio: '', municipio: '', uf: '' }, baseCalculo: '' });
  });

  it('tomador no exterior: NIF, endereço do exterior e sem código de município', () => {
    const t = lerNfse(nfseExemplo({ tomadorExterior: true })).tomador;
    expect(t).toMatchObject({ documento: 'US-98-7654321', tipoDocumento: 'NIF', motivoSemNif: '' });
    expect(t?.endereco).toMatchObject({ pais: 'US', codigoPostal: '60601', cidade: 'Chicago', estadoProvincia: 'Illinois', codigoMunicipio: '', uf: '', cep: '', logradouro: 'North Michigan Avenue' });
    const semNif = nfseExemplo({ tomadorExterior: true }).replace('<NIF>US-98-7654321</NIF>', '<cNaoNIF>1</cNaoNIF>');
    expect(lerNfse(semNif).tomador).toMatchObject({ documento: '', tipoDocumento: '', motivoSemNif: '1' });
  });

  it('o emit só completa o prestador quando é a mesma pessoa (DPS emitida por outra parte não herda nome nem endereço do emit)', () => {
    const outroPrestador = nfseExemplo().replace('<prest><CNPJ>11222333000181</CNPJ>', '<prest><CNPJ>99888777000166</CNPJ>');
    const n = lerNfse(outroPrestador);
    expect(n.prestador).toMatchObject({ documento: '99888777000166', nome: '', inscricaoMunicipal: '45012' });
    expect(n.prestador.endereco).toMatchObject({ logradouro: '', municipio: '', uf: '' });
    // mas o município emissor do cabeçalho continua vindo da NFS-e
    expect(n.municipioEmissor).toBe('Lucas do Rio Verde');
  });

  it('a UF sai do código IBGE e o nome do município só quando o XML o traz para aquele código', () => {
    const xml = nfseExemplo({ comIntermediario: true }).replace('<cMun>5103403</cMun>', '<cMun>3550308</cMun>');
    const i = lerNfse(xml).intermediario?.endereco;
    expect(i).toMatchObject({ codigoMunicipio: '3550308', municipio: '', uf: 'SP' });
  });

  it('aceita a NFS-e dentro de outro elemento e ignora o espaço em branco do XML', () => {
    const xml = nfseExemplo().replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0" encoding="UTF-8"?>\n<retorno>') + '\n</retorno>';
    expect(lerNfse(xml).chave).toBe(CHAVE_NFSE_EXEMPLO);
  });

  it('a chave muda com a competência e aceita a inscrição alfanumérica (CNPJ novo) no Id', () => {
    expect(chaveNfseExemplo('2027-01-15')).not.toBe(CHAVE_NFSE_EXEMPLO);
    const chave = ['510525922', 'AB12CD34EF56', '81', '0000000000123', '2611', '123456789', '8'].join('');
    expect(chave).toHaveLength(50);
    const xml = nfseExemplo().replace(/Id="NFS[0-9A-Z]{50}"/, `Id="NFS${chave}"`);
    expect(lerNfse(xml).chave).toBe(chave);
  });

  it('recusa o que não é NFS-e Nacional, com mensagem em português para a tela', () => {
    const recusas: [string, RegExp][] = [
      ['<catalogo><item>nada fiscal</item></catalogo>', /não é uma NFS-e Nacional/],
      [nfeExemplo(), /não é uma NFS-e Nacional/],
      ['', /vazio ou excede/],
      // leiaute municipal (ABRASF): tem InfNfse, mas não tem a DPS dentro
      ['<CompNfse><Nfse><InfNfse><Numero>1</Numero></InfNfse></Nfse></CompNfse>', /não é uma NFS-e Nacional/],
      // NFS-e sem a DPS
      [nfseExemplo().replace(/<DPS[\s\S]*<\/DPS>/, ''), /não é uma NFS-e Nacional/],
      // sem a chave de acesso no Id, ou com o Id fora do padrão
      [nfseExemplo().replace(/ Id="NFS[0-9A-Z]{50}"/, ''), /chave de acesso de 50 caracteres/],
      [nfseExemplo().replace(/Id="NFS([0-9A-Z]{50})"/, (_, c: string) => `Id="NFS${c}999"`), /chave de acesso de 50 caracteres/],
      [`<NFSe>${'x'.repeat(2 * 1024 * 1024 + 1)}</NFSe>`, /vazio ou excede/],
    ];
    for (const [xml, mensagem] of recusas) {
      expect(() => lerNfse(xml), mensagem.source).toThrow(mensagem);
      expect(() => lerNfse(xml)).toThrow(ErroLeituraNfse);
    }
    expect(new ErroLeituraNfse('x')).toBeInstanceOf(ErroLeituraDocumento);
  });
});
