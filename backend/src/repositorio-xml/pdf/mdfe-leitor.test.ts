import { describe, expect, it } from 'vitest';
import { ErroLeituraDocumento } from './erros';
import { ErroLeituraMdfe, lerMdfe } from './mdfe-leitor';
import { CHAVE_MDFE_EXEMPLO, CNPJ_EMITENTE_MDFE, chaveFicticia, digitoDaChave, mdfeExemplo, mdfeMinimo } from './__fixtures__/mdfe-exemplo';
import { nfeExemplo } from './__fixtures__/nfe-exemplo';

describe('lerMdfe', () => {
  it('lê identificação, emitente, percurso, modal rodoviário, documentos, seguro, totais, QR Code e protocolo', () => {
    const m = lerMdfe(mdfeExemplo());
    expect(m).toMatchObject({
      chave: CHAVE_MDFE_EXEMPLO, versao: '3.00', modelo: '58', serie: '1', numero: '4512', homologacao: false,
      tipoEmitente: '1', tipoTransportador: '1', formaEmissao: '1', modal: 'RODOVIARIO', ufCarregamento: 'MT', ufDescarregamento: 'PR',
      canalVerde: false, cargaPosterior: false, temInfDoc: true,
    });
    expect(m.dataEmissao).toBe('2026-11-05T08:42:10-04:00');
    expect(m.dataInicioViagem).toBe('2026-11-05T14:00:00-04:00');
    expect(m.municipiosCarregamento).toEqual([{ codigo: '5107925', nome: 'SORRISO' }, { codigo: '5105259', nome: 'LUCAS DO RIO VERDE' }]);
    expect(m.ufsPercurso).toEqual(['MS']);

    expect(m.emitente).toMatchObject({ documento: CNPJ_EMITENTE_MDFE, ie: '131000111', nome: 'TRANSPORTADORA GRAOS DO NORTE LTDA', fantasia: 'GRAOS DO NORTE' });
    expect(m.emitente.endereco).toMatchObject({ logradouro: 'RODOVIA BR 163 KM 782', numero: 'S/N', complemento: 'GALPAO 2', bairro: 'DISTRITO INDUSTRIAL', municipio: 'SORRISO', uf: 'MT', cep: '78890000', fone: '6635441200' });

    const r = m.rodoviario!;
    expect(r.rntrc).toBe('04512789');
    expect(r.ciots).toEqual([{ ciot: '123456789012', documento: '12345678000195' }, { ciot: '123456789013', documento: '52998224725' }]);
    expect(r.valesPedagio).toEqual([
      { fornecedor: '12345678000195', responsavel: '98765432000110', comprovante: '202611050001234', valor: '842.30', tipo: '01' },
      { fornecedor: '12345678000195', responsavel: '', comprovante: '202611050001235', valor: '310.00', tipo: '03' },
    ]);
    expect(r.contratantes).toEqual([{ nome: 'AGRO EXPORTADORA SOL NASCENTE S/A', documento: '98765432000110', numeroContrato: '2026-0098', valorContrato: '48500.00' }]);
    expect(r.pagamentos).toHaveLength(1);
    expect(r.pagamentos[0]).toMatchObject({
      nome: 'AGRO EXPORTADORA SOL NASCENTE S/A', documento: '98765432000110', valorContrato: '48500.00', altoDesempenho: true, formaPagamento: '1', adiantamento: '15000.00',
      parcelas: [{ numero: '001', vencimento: '2026-12-05', valor: '33500.00' }],
      banco: { banco: '', agencia: '', ipef: '', pix: 'financeiro@transportadora-exemplo.com.br' },
    });
    expect(r.pagamentos[0].componentes).toEqual([{ tipo: '01', valor: '842.30', descricao: '' }, { tipo: '99', valor: '150.00', descricao: 'ADICIONAL DE ESPERA NO PORTO' }]);
    expect(r.veiculos.map((v) => [v.tipo, v.placa, v.uf])).toEqual([['TRACAO', 'QJK4B21', 'MT'], ['REBOQUE', 'ABC1D23', 'MT'], ['REBOQUE', 'ABC4E56', 'MT']]);
    expect(r.veiculos[0]).toMatchObject({ renavam: '01234567890', tara: '9500', capacidadeKg: '0', tipoRodado: '03', tipoCarroceria: '00', proprietario: null });
    expect(r.veiculos[1]).toMatchObject({ tara: '7200', capacidadeKg: '20000', capacidadeM3: '45', tipoCarroceria: '03' });
    expect(r.veiculos[1].proprietario).toEqual({ documento: '45678901000123', rntrc: '04999111', nome: 'TRANSPORTES PARCEIROS DO MEDIO NORTE LTDA', ie: '131777888', uf: 'MT', tipo: '2' });
    expect(r.condutores).toEqual([{ cpf: '52998224725', nome: 'JOSE CARLOS DA SILVA' }, { cpf: '11144477735', nome: 'ANTONIO FERREIRA LIMA' }]);
    expect(r.lacres).toEqual(['RD7001', 'RD7002', 'RD7003']);
    expect(r.codigoAgendamentoPorto).toBe('AGD2026110512');
    expect(m.aereo).toBeNull();

    expect(m.municipiosDescarga.map((mun) => [mun.codigo, mun.nome, mun.documentos.length])).toEqual([['4118204', 'PARANAGUA', 4], ['4119905', 'PONTA GROSSA', 4], ['4104808', 'CASCAVEL', 4]]);
    const docs = m.municipiosDescarga[0].documentos;
    expect(docs.map((d) => d.tipo)).toEqual(['CTE', 'CTE', 'NFE', 'NFE']);
    docs.forEach((d) => expect(d.chave).toMatch(/^[0-9]{44}$/));
    expect(docs[0].chave).toBe(chaveFicticia('57', 1, CNPJ_EMITENTE_MDFE));

    expect(m.seguros).toEqual([{ responsavel: '1', documentoResponsavel: CNPJ_EMITENTE_MDFE, seguradora: 'SEGURADORA EXEMPLO S/A', cnpjSeguradora: '45678901000123', apolice: '1234567890123', averbacoes: ['2026110000000123456789', '2026110000000987654321'] }]);
    expect(m.produtoPredominante).toEqual({ tipoCarga: '01', produto: 'SOJA EM GRAOS', gtin: 'SEM GTIN', ncm: '12019000', localCarregamento: '', localDescarregamento: '' });
    expect(m.totais).toEqual({ qtdCte: '6', qtdNfe: '6', qtdMdfe: '', valorCarga: '148750.50', unidade: '01', pesoCarga: '38500.0000' });
    expect(m.lacres).toEqual(['MD5001', 'MD5002', 'MD5003']);
    expect(m.autorizados).toEqual(['12345678000195', '52998224725']);
    expect(m.informacoesFisco).toContain('contrato de transporte continuado');
    expect(m.informacoesComplementares).toContain('safra 2025/26');
    expect(m.qrCode).toBe(`https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${CHAVE_MDFE_EXEMPLO}&tpAmb=1`);
    expect(m.protocolo).toEqual({ numero: '151260000012345', dataHora: '2026-11-05T09:42:58-03:00', status: '100', motivo: 'Autorizado o uso do MDF-e' });
  });

  it('as chaves de acesso do exemplo têm o dígito verificador certo (módulo 11)', () => {
    expect(CHAVE_MDFE_EXEMPLO).toHaveLength(44);
    expect(CHAVE_MDFE_EXEMPLO.slice(20, 22)).toBe('58');
    expect(CHAVE_MDFE_EXEMPLO[43]).toBe(digitoDaChave(CHAVE_MDFE_EXEMPLO.slice(0, 43)));
    // Contas feitas à mão (pesos 2 a 9 da direita para a esquerda, voltando ao 2): 1234 => 4x2 + 3x3 + 2x4 + 1x5 = 30, resto 8, DV 3.
    expect(digitoDaChave('1234')).toBe('3');
    expect(digitoDaChave('111111111')).toBe('9'); // soma 46 (os pesos voltam ao 2 no nono dígito), resto 2
    expect(digitoDaChave('5')).toBe('1'); // soma 10, resto 10
    expect(digitoDaChave('6')).toBe('0'); // soma 12, resto 1: DV 0
    expect(digitoDaChave('0')).toBe('0'); // soma 0, resto 0: DV 0
  });

  it('homologação, contingência e carga incluída depois', () => {
    expect(lerMdfe(mdfeExemplo({ homologacao: true })).homologacao).toBe(true);
    const contingencia = lerMdfe(mdfeExemplo({ contingencia: true }));
    expect(contingencia.formaEmissao).toBe('2');
    expect(contingencia.chave[34]).toBe('2'); // tpEmis na chave
    expect(contingencia.qrCode).toContain('&sign=');
    const posterior = lerMdfe(mdfeExemplo({ cargaPosterior: true }));
    expect(posterior).toMatchObject({ cargaPosterior: true, temInfDoc: false, municipiosDescarga: [] });
  });

  it('o XML só com a raiz MDFe (sem o mdfeProc) lê igual, sem protocolo; sem infMDFeSupl não há QR Code', () => {
    const m = lerMdfe(mdfeExemplo({ semProtocolo: true, semQrCode: true }));
    expect(m.chave).toBe(CHAVE_MDFE_EXEMPLO);
    expect(m.protocolo).toBeNull();
    expect(m.qrCode).toBe('');
    expect(m.homologacao).toBe(false);
  });

  it('modal aéreo, ferroviário e aquaviário: lê os dados do modal que veio no XML', () => {
    const aereo = lerMdfe(mdfeExemplo({ modal: 'aereo' }));
    expect(aereo.modal).toBe('AEREO');
    expect(aereo.rodoviario).toBeNull();
    expect(aereo.aereo).toEqual({ marcaNacionalidade: 'PT', marcaMatricula: 'MDF', numeroVoo: 'AB1234', aerodromoEmbarque: 'CGB', aerodromoDestino: 'CWB', dataVoo: '2026-11-06' });

    const ferro = lerMdfe(mdfeExemplo({ modal: 'ferroviario', vagoes: 4 }));
    expect(ferro.modal).toBe('FERROVIARIO');
    expect(ferro.ferroviario).toMatchObject({ prefixo: 'R123', dataHoraLiberacao: '2026-11-06T06:30:00-03:00', origem: 'RUM', destino: 'PNG', quantidadeVagoes: '4' });
    expect(ferro.ferroviario!.vagoes).toHaveLength(4);
    expect(ferro.ferroviario!.vagoes[1]).toEqual({ serie: 'HFS', numero: '00100217', sequencia: '002', tipo: 'GRANELEIRO', pesoBaseCalculo: '99.500', pesoReal: '98.250', toneladaUtil: '96.900' });
    expect(ferro.totais.unidade).toBe('02');

    const aquav = lerMdfe(mdfeExemplo({ modal: 'aquaviario', documentosPorMunicipio: 1 }));
    expect(aquav.modal).toBe('AQUAVIARIO');
    expect(aquav.aquaviario).toMatchObject({
      irin: 'PPXY', tipoEmbarcacao: '01', codigoEmbarcacao: '0123456789', nomeEmbarcacao: 'NAVIO GRANELEIRO EXEMPLO', viagem: '0123',
      portoEmbarque: 'BRSSZ', portoDestino: 'BRPNG', portosTransbordo: ['BRITQ'], tipoNavegacao: '1',
    });
    expect(aquav.aquaviario!.terminaisCarregamento).toEqual([{ codigo: '12345678', nome: 'TERMINAL DE GRAOS DO PORTO DE SANTOS' }]);
    expect(aquav.aquaviario!.comboio).toEqual([{ codigo: 'BAL001', balsa: 'BALSA GRANELEIRA 1' }, { codigo: 'BAL002', balsa: 'BALSA GRANELEIRA 2' }]);
    expect(aquav.aquaviario!.unidadesCargaVazias).toEqual([{ identificacao: 'MSKU1234567', tipo: '1' }]);
    expect(aquav.municipiosDescarga[0].documentos.map((d) => d.tipo)).toEqual(['CTE', 'NFE', 'MDFE']);
  });

  it('o modelo vem da chave quando falta a tag mod, e a chave vem do protocolo quando falta o Id', () => {
    const semMod = mdfeExemplo().replace('<mod>58</mod>', '');
    expect(lerMdfe(semMod).modelo).toBe('58');
    const semId = mdfeExemplo().replace(/ Id="MDFe\d{44}"/, '');
    expect(lerMdfe(semId).chave).toBe(CHAVE_MDFE_EXEMPLO);
    expect(() => lerMdfe(semId.replace(/<protMDFe[\s\S]*<\/protMDFe>/, ''))).toThrow(/chave de acesso de 44 dígitos/);
  });

  it('MDF-e mínimo: o que falta vem vazio (listas vazias, grupos nulos), sem quebrar', () => {
    const m = lerMdfe(mdfeMinimo());
    expect(m).toMatchObject({
      chave: CHAVE_MDFE_EXEMPLO, modelo: '58', serie: '', numero: '', dataEmissao: '', modal: '', ufCarregamento: '', homologacao: false, temInfDoc: false,
      rodoviario: null, aereo: null, ferroviario: null, aquaviario: null, produtoPredominante: null, protocolo: null, qrCode: '',
    });
    expect(m.emitente).toMatchObject({ documento: CNPJ_EMITENTE_MDFE, nome: '', ie: '' });
    expect([m.municipiosDescarga, m.seguros, m.lacres, m.autorizados, m.ufsPercurso, m.municipiosCarregamento]).toEqual([[], [], [], [], [], []]);
    expect(m.totais).toEqual({ qtdCte: '', qtdNfe: '', qtdMdfe: '', valorCarga: '', unidade: '', pesoCarga: '' });
  });

  it('com o modal só em ide/modal (sem o grupo em infModal) o modal vem do código', () => {
    const xml = mdfeMinimo().replace('<mod>58</mod>', '<mod>58</mod><modal>4</modal>');
    expect(lerMdfe(xml).modal).toBe('FERROVIARIO');
  });

  it('recusa o que não é MDF-e modelo 58, XML sem chave, vazio e grande demais; o erro é um ErroLeituraDocumento', () => {
    expect(() => lerMdfe(mdfeExemplo().replace('<mod>58</mod>', '<mod>57</mod>'))).toThrow(/modelo 58 \(este documento é modelo 57\)/);
    expect(() => lerMdfe(nfeExemplo())).toThrow(/não é um MDF-e/);
    expect(() => lerMdfe('<catalogo><item>nada fiscal</item></catalogo>')).toThrow(ErroLeituraMdfe);
    expect(() => lerMdfe('')).toThrow(ErroLeituraDocumento);
    expect(() => lerMdfe('isto nem é XML')).toThrow(ErroLeituraDocumento);
    expect(() => lerMdfe(`<MDFe>${'x'.repeat(2 * 1024 * 1024 + 1)}</MDFe>`)).toThrow(ErroLeituraDocumento);
    expect(() => lerMdfe('<MDFe xmlns="http://www.portalfiscal.inf.br/mdfe"><infMDFe Id="MDFe123"><ide><mod>58</mod></ide></infMDFe></MDFe>')).toThrow(/chave de acesso/);
    try {
      lerMdfe('<x/>');
    } catch (e) {
      expect(e).toBeInstanceOf(ErroLeituraDocumento);
    }
  });
});
