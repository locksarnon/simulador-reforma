import { describe, expect, it } from 'vitest';
import { ErroLeituraCte, documentoDaChave, lerCte } from './cte-leitor';
import { ErroLeituraDocumento } from './erros';
import { CHAVE_CTE_EXEMPLO, CHAVE_CTE_REFERENCIADO, URL_QR_CTE_EXEMPLO, chaveNfeExemplo, cteExemplo } from './__fixtures__/cte-exemplo';

describe('lerCte', () => {
  it('lê identificação, emitente, partes, tomador, carga, valores, imposto, documentos, observações, fluxo, modal, QR Code e protocolo', () => {
    const c = lerCte(cteExemplo());
    expect(c).toMatchObject({
      chave: CHAVE_CTE_EXEMPLO, versao: '4.00', modelo: '57', serie: '1', numero: '123', tipoCte: '0', tipoServico: '0', homologacao: false, cfop: '5353',
    });
    expect(c.dataEmissao).toBe('2026-11-05T10:15:00-03:00');
    expect(c.naturezaOperacao).toContain('TRANSPORTE');
    expect(c.inicioPrestacao).toEqual({ uf: 'MT', municipio: 'SORRISO' });
    expect(c.terminoPrestacao).toEqual({ uf: 'MT', municipio: 'RONDONOPOLIS' });
    expect(c.globalizado).toEqual({ indicador: false, informacao: '' });
    expect(c.retira.indicador).toBe('1');

    // o telefone do emitente fica dentro de enderEmit; o das outras partes, no próprio grupo
    expect(c.emitente).toMatchObject({ documento: '11222333000181', ie: '131234567', fantasia: 'TRANSGRAOS', fone: '6635441000' });
    expect(c.emitente.nome).toBe('TRANSPORTADORA GRAOS DO CERRADO LTDA');
    expect(c.emitente.endereco).toMatchObject({ logradouro: 'RODOVIA BR 163', numero: 'KM 801', complemento: 'GALPAO 2', bairro: 'DISTRITO INDUSTRIAL', municipio: 'SORRISO', uf: 'MT', cep: '78890000', pais: '' });
    expect(c.remetente).toMatchObject({ documento: '12345678000195', ie: '131000222', nome: 'FAZENDA SÃO JOÃO AGROPECUÁRIA LTDA', fone: '6635442000' });
    expect(c.remetente?.endereco).toMatchObject({ municipio: 'SORRISO', cep: '78890000', pais: 'BRASIL' });
    expect(c.expedidor?.nome).toBe('ARMAZENS GERAIS VALE VERDE LTDA');
    expect(c.recebedor?.endereco.municipio).toBe('RONDONOPOLIS');
    expect(c.destinatario).toMatchObject({ documento: '98765432000110', ie: '131999888', fone: '6634210000' });
    expect(c.tomador.papel).toBe('remetente');
    expect(c.tomador.parte?.documento).toBe('12345678000195');

    expect(c.carga).toMatchObject({ valorCarga: '182500.00', produtoPredominante: 'SOJA EM GRAOS', outrasCaracteristicas: 'GRANEL' });
    expect(c.carga.quantidades).toEqual([
      { codigoUnidade: '01', tipoMedida: 'PESO BRUTO', quantidade: '37450.0000' },
      { codigoUnidade: '01', tipoMedida: 'PESO BASE DE CALCULO', quantidade: '37450.0000' },
      { codigoUnidade: '02', tipoMedida: 'PESO AFERIDO', quantidade: '37.4200' },
      { codigoUnidade: '03', tipoMedida: 'VOLUME', quantidade: '1.0000' },
    ]);
    expect(c.prestacao).toMatchObject({ valorTotal: '3763.33', valorReceber: '3763.33', valorLiquido: '' });
    expect(c.prestacao.componentes).toEqual([{ nome: 'FRETE PESO', valor: '3688.83' }, { nome: 'PEDAGIO', valor: '31.50' }, { nome: 'SEC/CAT', valor: '43.00' }]);
    expect(c.imposto.icms).toMatchObject({ grupo: 'ICMS00', cst: '00', baseCalculo: '3763.33', aliquota: '12.00', valor: '451.60', percentualReducao: '' });
    expect(c.imposto.ibsCbs).toBeNull();

    expect(c.documentos).toHaveLength(3);
    expect(c.documentos[0]).toEqual({ tipo: 'NFE', rotulo: 'NF-e', emitente: '12345678000195', serie: '1', numero: '1', chave: chaveNfeExemplo(1), descricao: '' });
    expect(c.documentosAnteriores).toEqual([]);
    expect(c.referencias).toEqual([]);
    expect(c.observacoes.geral).toContain('ROMANEIO 4587');
    expect(c.observacoes.caracteristicaTransporte).toBe('CONVENCIONAL');
    expect(c.fluxo).toEqual({ origem: 'SORRISO', passagens: ['NOVA MUTUM'], destino: 'RONDONOPOLIS' });
    expect(c.modal).toEqual({ codigo: '01', rntrc: '12345678', ordensColeta: [], detalhes: [] });
    expect(c.qrCode).toBe(URL_QR_CTE_EXEMPLO); // o &amp; do XML volta a ser &
    expect(c.protocolo).toEqual({ numero: '351260000000321', dataHora: '2026-11-05T10:16:30-03:00', status: '100', motivo: 'Autorizado o uso do CT-e' });
  });

  it('XML só com a CTe (sem protocolo), em homologação, sem expedidor, sem recebedor e sem QR Code', () => {
    const c = lerCte(cteExemplo({ homologacao: true, semProtocolo: true, semExpedidor: true, semRecebedor: true, semQrCode: true }));
    expect(c.homologacao).toBe(true);
    expect(c.protocolo).toBeNull();
    expect(c.expedidor).toBeNull();
    expect(c.recebedor).toBeNull();
    expect(c.qrCode).toBe('');
    const soCte = cteExemplo().replace(/^[\s\S]*?(<CTe[\s\S]*<\/CTe>)[\s\S]*$/, '$1');
    expect(soCte.startsWith('<CTe')).toBe(true);
    const lido = lerCte(soCte);
    expect(lido.chave).toBe(CHAVE_CTE_EXEMPLO);
    expect(lido.protocolo).toBeNull();
  });

  it('o tomador vem da parte que o código do toma3 indica, ou do grupo toma4 ("outros")', () => {
    const quem = (tomador: 'remetente' | 'expedidor' | 'recebedor' | 'destinatario' | 'outros') => lerCte(cteExemplo({ tomador }));
    expect(quem('remetente').tomador.parte?.nome).toBe('FAZENDA SÃO JOÃO AGROPECUÁRIA LTDA');
    expect(quem('expedidor').tomador).toMatchObject({ papel: 'expedidor', parte: { nome: 'ARMAZENS GERAIS VALE VERDE LTDA' } });
    expect(quem('recebedor').tomador).toMatchObject({ papel: 'recebedor', parte: { documento: '33444555000163' } });
    expect(quem('destinatario').tomador).toMatchObject({ papel: 'destinatario', parte: { nome: 'TRADING COMMODITIES BRASIL S/A' } });
    const outros = quem('outros').tomador;
    expect(outros.papel).toBe('outros');
    expect(outros.parte).toMatchObject({ documento: '44555666000154', ie: '131000555', nome: 'COOPERATIVA AGROINDUSTRIAL DO MEDIO NORTE', fantasia: 'COOPERNORTE', fone: '6635443000' });
    expect(outros.parte?.endereco).toMatchObject({ logradouro: 'RUA DOS COOPERADOS', municipio: 'SORRISO', cep: '78890100' });
    // o leiaute 2.00 chamava o grupo de toma03
    const antigo = cteExemplo().replace(/toma3/g, 'toma03').replace('<toma>0</toma>', '<toma>3</toma>');
    expect(lerCte(antigo).tomador.papel).toBe('destinatario');
  });

  it('cada grupo de ICMS entrega situação tributária, base, alíquota e valor (no ICMS60, os da substituição tributária)', () => {
    const lerIcms = (icms: NonNullable<Parameters<typeof cteExemplo>[0]>['icms']) => lerCte(cteExemplo({ icms })).imposto.icms;
    expect(lerIcms('ICMS20')).toMatchObject({ grupo: 'ICMS20', cst: '20', percentualReducao: '40.00', baseCalculo: '2258.00', aliquota: '12.00', valor: '270.96' });
    expect(lerIcms('ICMS45')).toMatchObject({ grupo: 'ICMS45', cst: '40', baseCalculo: '', valor: '' });
    expect(lerIcms('ICMS60')).toMatchObject({ grupo: 'ICMS60', cst: '60', baseCalculo: '3763.33', aliquota: '17.00', valor: '639.77', creditoOutorgado: '127.95' });
    expect(lerIcms('ICMS90')).toMatchObject({ grupo: 'ICMS90', cst: '90', percentualReducao: '10.00', creditoOutorgado: '10.00' });
    expect(lerIcms('ICMSOutraUF')).toMatchObject({ grupo: 'ICMSOutraUF', cst: '90', baseCalculo: '3763.33', aliquota: '12.00', valor: '451.60', percentualReducao: '0.00' });
    expect(lerIcms('ICMSSN')).toMatchObject({ grupo: 'ICMSSN', cst: '01', indicadorSimples: '1' });
    expect(lerCte(cteExemplo().replace(/<imp>[\s\S]*<\/imp>/, '<imp/>')).imposto.icms.grupo).toBe('');
  });

  it('lê o grupo de IBS e CBS da Reforma Tributária (NT 2025.001) quando o XML traz', () => {
    const c = lerCte(cteExemplo({ ibsCbs: true }));
    expect(c.imposto.ibsCbs).toEqual({
      cst: '000', classificacao: '000001', baseCalculo: '3763.33', aliquotaIbsUf: '0.10', valorIbsUf: '3.76', aliquotaIbsMun: '0.00', valorIbsMun: '0.00',
      valorIbs: '3.76', aliquotaCbs: '0.90', valorCbs: '33.87',
    });
    expect(c.imposto.valorTotalDfe).toBe('3800.96');
  });

  it('CT-e complementar, substituto e de anulação (leiaute 3.00) trazem a chave do CT-e de referência', () => {
    const complemento = lerCte(cteExemplo({ tipo: 'complemento' }));
    expect(complemento.tipoCte).toBe('1');
    expect(complemento.referencias).toEqual([{ tipo: 'complementado', chave: CHAVE_CTE_REFERENCIADO }]);
    expect(complemento.documentos).toEqual([]);
    const substituto = lerCte(cteExemplo({ tipo: 'substituto' }));
    expect(substituto.tipoCte).toBe('3');
    expect(substituto.referencias).toEqual([{ tipo: 'substituido', chave: CHAVE_CTE_REFERENCIADO }]);
    expect(substituto.documentos).toHaveLength(3);
    const anulacao = lerCte(cteExemplo({ tipo: 'anulacao' }));
    expect(anulacao).toMatchObject({ versao: '3.00', tipoCte: '2' });
    expect(anulacao.referencias).toEqual([{ tipo: 'anulado', chave: CHAVE_CTE_REFERENCIADO }]);
  });

  it('documentos originários: a chave da NF-e dá o emitente (CNPJ ou CPF), a série e o número; NF em papel e outros usam o remetente', () => {
    const c = lerCte(cteExemplo());
    expect(c.documentos[1]).toMatchObject({ tipo: 'NFE', emitente: '12345678909', serie: '1', numero: '2' }); // produtor rural: CPF na chave
    expect(documentoDaChave(chaveNfeExemplo(2))).toBe('12345678909');
    expect(documentoDaChave(chaveNfeExemplo(1))).toBe('12345678000195');
    expect(documentoDaChave('123')).toBe('');
    const papel = cteExemplo().replace(/<infDoc>[\s\S]*<\/infDoc>/, '<infDoc><infNF><mod>01</mod><serie>1</serie><nDoc>4455</nDoc><dEmi>2026-11-01</dEmi></infNF><infNF><mod>04</mod><serie>2</serie><nDoc>77</nDoc></infNF></infDoc>');
    expect(lerCte(papel).documentos).toEqual([
      { tipo: 'NF', rotulo: 'NF 01', emitente: '12345678000195', serie: '1', numero: '4455', chave: '', descricao: '' },
      { tipo: 'NF', rotulo: 'NF 04', emitente: '12345678000195', serie: '2', numero: '77', chave: '', descricao: '' },
    ]);
    const outros = cteExemplo().replace(/<infDoc>[\s\S]*<\/infDoc>/, '<infDoc><infOutros><tpDoc>00</tpDoc><descOutros>DECLARACAO DO EXPEDIDOR</descOutros><nDoc>991</nDoc></infOutros><infOutros><tpDoc>99</tpDoc></infOutros></infDoc>');
    expect(lerCte(outros).documentos).toEqual([
      { tipo: 'OUTRO', rotulo: 'Declaração', emitente: '12345678000195', serie: '', numero: '991', chave: '', descricao: 'DECLARACAO DO EXPEDIDOR' },
      { tipo: 'OUTRO', rotulo: 'Outros', emitente: '12345678000195', serie: '', numero: '', chave: '', descricao: '' },
    ]);
    expect(lerCte(cteExemplo({ documentos: 1500 })).documentos).toHaveLength(1500);
  });

  it('documentos de transporte anterior (redespacho): CT-e eletrônico e documento em papel', () => {
    const c = lerCte(cteExemplo({ documentosAnteriores: true }));
    expect(c.documentosAnteriores).toEqual([
      { tipo: 'CTE_ANTERIOR', rotulo: 'CT-e', emitente: '44555666000154', serie: '1', numero: '98', chave: CHAVE_CTE_REFERENCIADO, descricao: '' },
      { tipo: 'PAPEL_ANTERIOR', rotulo: 'DTA', emitente: '44555666000154', serie: '1-2', numero: '4455', chave: '', descricao: '' },
    ]);
  });

  it('veículos novos transportados (caso específico do MOC): chassi, cor, marca/modelo, valor unitário e frete', () => {
    const c = lerCte(cteExemplo({ veiculosNovos: 2 }));
    expect(c.veiculosNovos).toEqual([
      { chassi: '9BWZZZ377VT004201', cor: '12 - PRATA METALICO', modelo: '123451', valorUnitario: '86000.00', frete: '1201.00' },
      { chassi: '9BWZZZ377VT004202', cor: '12 - PRATA METALICO', modelo: '123452', valorUnitario: '87000.00', frete: '1202.00' },
    ]);
    expect(lerCte(cteExemplo()).veiculosNovos).toEqual([]);
  });

  it('observações: uso livre do emissor, reservado ao Fisco e informações adicionais de interesse do Fisco', () => {
    const c = lerCte(cteExemplo({ obsCont: 2, obsFisco: 1, infAdFisco: 'CONVENIO ICMS 106/96' }));
    expect(c.observacoes.usoEmissor).toEqual([{ campo: 'CAMPO1', texto: 'CONTEUDO LIVRE DO EMISSOR NUMERO 1' }, { campo: 'CAMPO2', texto: 'CONTEUDO LIVRE DO EMISSOR NUMERO 2' }]);
    expect(c.observacoes.fisco).toEqual([{ campo: 'FISCO1', texto: 'NORMA REFERENCIADA 1' }]);
    expect(c.observacoes.informacoesFisco).toBe('CONVENIO ICMS 106/96');
  });

  it('modal rodoviário: RNTRC e ordens de coleta; outros modais entregam os campos do grupo como estão no XML', () => {
    const rodo = lerCte(cteExemplo({ ordensColeta: 2 })).modal;
    expect(rodo.rntrc).toBe('12345678');
    expect(rodo.ordensColeta).toEqual([
      { serie: '1', numero: '17', dataEmissao: '2026-11-02', emitente: '11222333000181', ie: '131234567', uf: 'MT', fone: '6635441000' },
      { serie: '1', numero: '34', dataEmissao: '2026-11-03', emitente: '11222333000181', ie: '131234567', uf: 'MT', fone: '6635441000' },
    ]);
    const ferro = lerCte(cteExemplo({ modal: '04' })).modal;
    expect(ferro.codigo).toBe('04');
    expect(ferro.rntrc).toBe('');
    expect(ferro.detalhes).toEqual([
      { campo: 'tpTraf', valor: '1' }, { campo: 'respFat', valor: '1' }, { campo: 'ferrEmi', valor: '1' }, { campo: 'vFrete', valor: '3688.83' }, { campo: 'fluxo', valor: '1234567890' },
    ]);
    expect(lerCte(cteExemplo({ modal: '02' })).modal.detalhes.map((d) => d.campo)).toEqual(['nMinu', 'nOCA', 'dPrevAereo', 'xDime', 'cInfManu', 'CL', 'cTar', 'vTar']);
  });

  it('CT-e globalizado e recebedor que retira a carga', () => {
    const c = lerCte(cteExemplo({ globalizado: true }));
    expect(c.globalizado).toEqual({ indicador: true, informacao: 'CTE GLOBALIZADO CONFORME REGIME ESPECIAL AUTORIZADO PELA SEFAZ' });
    const retira = lerCte(cteExemplo().replace('<retira>1</retira>', '<retira>0</retira><xDetRetira>RETIRA NO PATIO DO TERMINAL</xDetRetira>'));
    expect(retira.retira).toEqual({ indicador: '0', detalhes: 'RETIRA NO PATIO DO TERMINAL' });
  });

  it('XML mínimo: o que falta fica vazio, sem quebrar', () => {
    const c = lerCte(cteExemplo({ enxuto: true }));
    expect(c.observacoes).toMatchObject({ geral: '', usoEmissor: [], fisco: [] });
    expect(c.fluxo).toEqual({ origem: '', passagens: [], destino: '' });
    expect(c.emitente.fantasia).toBe('');
    expect(c.prestacao.componentes).toHaveLength(1);
    const minimo = `<CTe><infCte Id="CTe${CHAVE_CTE_EXEMPLO}"><ide><mod>57</mod></ide></infCte></CTe>`;
    const m = lerCte(minimo);
    expect(m.chave).toBe(CHAVE_CTE_EXEMPLO);
    expect(m).toMatchObject({ numero: '', serie: '', remetente: null, destinatario: null, tomador: { papel: '', parte: null }, qrCode: '', protocolo: null });
    expect(m.documentos).toEqual([]);
    expect(m.prestacao.componentes).toEqual([]);
  });

  it('aceita a chave só no protocolo e o modelo só na chave', () => {
    const semId = cteExemplo().replace(/ Id="CTe\d{44}"/, '');
    expect(lerCte(semId).chave).toBe(CHAVE_CTE_EXEMPLO);
    expect(() => lerCte(semId.replace(/<protCTe[\s\S]*<\/protCTe>/, ''))).toThrow(/chave de acesso de 44 dígitos/);
    expect(lerCte(cteExemplo().replace('<mod>57</mod>', '')).modelo).toBe('57');
  });

  it('aceita o XML com BOM ou linhas em branco antes da declaração, que alguns sistemas gravam', () => {
    expect(lerCte(`﻿${cteExemplo()}`).chave).toBe(CHAVE_CTE_EXEMPLO);
    expect(lerCte(`\n  \r\n${cteExemplo()}`).chave).toBe(CHAVE_CTE_EXEMPLO);
  });

  it('XML mal formado ou incompleto vira erro com mensagem em português (não a da biblioteca, em inglês)', () => {
    for (const xml of ['isto nem é XML', '<cteProc><CTe>', '<a><b></a>']) {
      expect(() => lerCte(xml), xml).toThrow(ErroLeituraCte);
      expect(() => lerCte(xml), xml).toThrow(/não é um XML válido/);
    }
    expect(() => lerCte('   ')).toThrow(/XML vazio/);
  });

  it('recusa o que não é CT-e modelo 57, com mensagem em português para a tela', () => {
    const erro = (xml: string) => { try { lerCte(xml); } catch (e) { return e as Error; } return null; };
    expect(erro('<catalogo><item>nada fiscal</item></catalogo>')).toBeInstanceOf(ErroLeituraCte);
    expect(erro('<catalogo/>')?.message).toMatch(/não é um CT-e/);
    expect(erro('<catalogo/>')).toBeInstanceOf(ErroLeituraDocumento);
    expect(erro('')).toBeInstanceOf(ErroLeituraCte);
    expect(erro(`<a>${'x'.repeat(2 * 1024 * 1024 + 1)}</a>`)).toBeInstanceOf(ErroLeituraCte);
    // CT-e OS (modelo 67): pela raiz e pelo modelo
    expect(erro('<cteOSProc><CTeOS><infCte/></CTeOS></cteOSProc>')?.message).toMatch(/CT-e OS \(modelo 67\).*DACTE OS/);
    expect(erro(cteExemplo().replace('<mod>57</mod>', '<mod>67</mod>'))?.message).toMatch(/CT-e OS \(modelo 67\)/);
    expect(erro(cteExemplo().replace('<mod>57</mod>', '<mod>64</mod>'))?.message).toMatch(/modelo 57 \(este documento é modelo 64\)/);
    expect(erro('<cteSimpProc><CTeSimp/></cteSimpProc>')?.message).toMatch(/CT-e Simplificado/);
    expect(erro('<GTVeProc><GTVe/></GTVeProc>')?.message).toMatch(/GTV-e/);
    expect(erro('<mdfeProc><MDFe/></mdfeProc>')?.message).toMatch(/não é um CT-e/);
    expect(erro('<nfeProc><NFe><infNFe/></NFe></nfeProc>')?.message).toMatch(/não é um CT-e/);
    expect(erro('<cteProc><CTe/></cteProc>')?.message).toMatch(/não é um CT-e/);
  });
});
