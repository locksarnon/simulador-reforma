import { describe, expect, it, vi } from 'vitest';
import { URL_CONSULTA_NFSE, gerarDanfse } from './danfse';
import { ErroLeituraDocumento } from './erros';
import { ErroLeituraNfse } from './nfse-leitor';
import { Pintor } from './pintor';
import { matrizQr } from './qr';
import { nfeExemplo } from './__fixtures__/nfe-exemplo';
import { CHAVE_NFSE_EXEMPLO, nfseExemplo } from './__fixtures__/nfse-exemplo';
import { paginas, textoDoPdf } from './__fixtures__/pdf-teste';

const gerar = (xml: string, opcoes = {}) => gerarDanfse(xml, { semCompressao: true, ...opcoes });
/** Texto do PDF, uma linha desenhada por linha de texto; o espaço sem quebra de "R$ 1,00" nos totais aproximados vira espaço comum. */
const linhasDe = (pdf: Buffer): string[] => textoDoPdf(pdf).replace(/\u00a0/g, ' ').split('\n');
const textoDe = (pdf: Buffer): string => linhasDe(pdf).join('\n');
/** Um valor que quebrou em várias linhas: as linhas viram um texto só, com espaço simples (o pdfkit deixa o espaço do fim da linha). */
const colapsar = (linhas: string[]): string => linhas.join(' ').replace(/\s+/g, ' ').trim();

/** O valor de um campo: a linha desenhada logo depois do rótulo (a `ocorrencia`-ésima vez que o rótulo aparece). */
function valorDe(pdf: Buffer, rotulo: string, ocorrencia = 0): string | undefined {
  const linhas = linhasDe(pdf);
  let achados = -1;
  for (let i = 0; i < linhas.length; i += 1) {
    if (linhas[i] === rotulo) { achados += 1; if (achados === ocorrencia) return linhas[i + 1]; }
  }
  return undefined;
}
/** As linhas entre dois rótulos (um valor que quebrou em mais de uma linha), juntas com espaço. */
function entre(pdf: Buffer, de: string, ate: string, ocorrencia = 0): string {
  const linhas = linhasDe(pdf);
  let inicio = -1;
  for (let i = 0, achados = -1; i < linhas.length; i += 1) {
    if (linhas[i] === de) { achados += 1; if (achados === ocorrencia) { inicio = i; break; } }
  }
  const fim = linhas.indexOf(ate, inicio + 1);
  return colapsar(linhas.slice(inicio + 1, fim));
}
/** Tudo o que foi escrito no quadro de informações complementares, na ordem. */
const informacoes = (pdf: Buffer): string => {
  const linhas = linhasDe(pdf);
  return colapsar(linhas.slice(linhas.indexOf('INFORMAÇÕES COMPLEMENTARES') + 1));
};
const TOTAIS_PADRAO = 'Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: R$ 1.143,25; Estaduais: R$ 0,00; Municipais: R$ 170,00';

/** Todo campo de texto no limite do leiaute e dezenas de linhas nas descrições, com todos os blocos presentes. */
const nfseCheia = (): string => {
  const repetir = (txt: string, n: number) => txt.repeat(n).trim();
  return nfseExemplo({ todosOsComplementos: true, comIntermediario: true, destinatarioDistinto: true, prestadorCompletoNaDps: true, codigoMunicipal: true })
    .replace(/<xNome>[^<]*<\/xNome>/g, `<xNome>${repetir('RAZAO SOCIAL MUITO LONGA DA EMPRESA ', 8)}</xNome>`)
    .replace(/<xLgr>[^<]*<\/xLgr>/g, `<xLgr>${repetir('AVENIDA DOS BANDEIRANTES DO CENTRO OESTE ', 6)}</xLgr>`)
    .replace(/<email>[^<]*<\/email>/g, `<email>${'a'.repeat(30)}@${'b'.repeat(40)}.com.br</email>`)
    .replace(/<xDescServ>[^<]*<\/xDescServ>/, `<xDescServ>${Array.from({ length: 400 }, (_, i) => `linha ${i + 1}`).join('\n')}</xDescServ>`)
    .replace(/<xInfComp>[^<]*<\/xInfComp>/, `<xInfComp>${Array.from({ length: 400 }, (_, i) => `obs ${i + 1}`).join('\n')}</xInfComp>`)
    .replace(/<xOutInf>[^<]*<\/xOutInf>/, `<xOutInf>${repetir('uso do municipio ', 100)}</xOutInf>`);
};

describe('gerarDanfse', () => {
  it('uma NFS-e vira um PDF de uma página com os blocos na ordem do modelo e os dados do XML', async () => {
    const pdf = await gerar(nfseExemplo());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);

    // blocos na ordem do Anexo I da NT 008/2026
    const t = textoDe(pdf);
    const ordem = [
      'DANFSe v2.0', 'Documento Auxiliar da NFS-e', 'CHAVE DE ACESSO DA NFS-E', 'EMITENTE DA NFS-e', 'PRESTADOR / FORNECEDOR', 'TOMADOR / ADQUIRENTE',
      'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO', 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', 'SERVIÇO PRESTADO', 'Descrição do Serviço',
      'TRIBUTAÇÃO MUNICIPAL (ISSQN)', 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)', 'TRIBUTAÇÃO IBS / CBS', 'VALOR TOTAL DA NFS-E', 'INFORMAÇÕES COMPLEMENTARES',
    ];
    let anterior = -1;
    for (const bloco of ordem) {
      const posicao = t.indexOf(bloco);
      expect(posicao, bloco).toBeGreaterThan(anterior);
      anterior = posicao;
    }

    // identificação
    expect(valorDe(pdf, 'CHAVE DE ACESSO DA NFS-E')).toBe(CHAVE_NFSE_EXEMPLO);
    expect(valorDe(pdf, 'NÚMERO DA NFS-E')).toBe('123');
    expect(valorDe(pdf, 'COMPETÊNCIA DA NFS-E')).toBe('05/11/2026');
    expect(valorDe(pdf, 'DATA E HORA DA EMISSÃO DA NFS-E')).toBe('05/11/2026 10:20:00');
    expect(valorDe(pdf, 'NÚMERO DA DPS')).toBe('123');
    expect(valorDe(pdf, 'SÉRIE DA DPS')).toBe('1');
    expect(valorDe(pdf, 'DATA E HORA DA EMISSÃO DA DPS')).toBe('05/11/2026 10:15:00');
    expect(valorDe(pdf, 'EMITENTE DA NFS-e')).toBe('Prestador');
    expect(valorDe(pdf, 'SITUAÇÃO DA NFS-e')).toBe('NFS-e Gerada');
    expect(valorDe(pdf, 'FINALIDADE')).toBe('NFS-e regular');

    // prestador (nome e endereço do grupo emit) e tomador
    expect(valorDe(pdf, 'CNPJ / CPF / NIF', 0)).toBe('11.222.333/0001-81');
    expect(valorDe(pdf, 'Indicador Municipal (Inscrição)', 0)).toBe('45012');
    expect(valorDe(pdf, 'Telefone', 0)).toBe('(65) 99988-7766');
    expect(valorDe(pdf, 'Nome / Nome Empresarial', 0)).toBe('AGRO CONSULTORIA E ASSISTENCIA TECNICA LTDA');
    expect(valorDe(pdf, 'Município / Sigla UF', 0)).toBe('Lucas do Rio Verde / MT');
    expect(valorDe(pdf, 'Código IBGE / CEP', 0)).toBe('5105259 / 78.455-000');
    expect(valorDe(pdf, 'Endereço', 0)).toBe('AVENIDA BRASIL NORTE, 1250, SALA 4, CENTRO');
    expect(valorDe(pdf, 'E-mail', 0)).toBe('financeiro@agroconsultoria.example.com.br');
    expect(valorDe(pdf, 'Simples Nacional na Data de Competência')).toBe('Não Optante');
    expect(valorDe(pdf, 'CNPJ / CPF / NIF', 1)).toBe('45.723.174/0001-10');
    expect(valorDe(pdf, 'Nome / Nome Empresarial', 1)).toBe('FAZENDA SANTA LUZIA AGROPECUARIA S/A');
    expect(valorDe(pdf, 'Município / Sigla UF', 1)).toBe('Sorriso / MT');
    expect(valorDe(pdf, 'Código IBGE / CEP', 1)).toBe('5107925 / 78.890-000');
    expect(valorDe(pdf, 'Endereço', 1)).toBe('RODOVIA MT 242, KM 18, ZONA RURAL, ZONA RURAL');

    // serviço
    expect(valorDe(pdf, 'Código de Tributação Nacional / Municipal')).toBe('07.01.02');
    expect(valorDe(pdf, 'Código da NBS')).toBe('1.1502.11.00');
    expect(valorDe(pdf, 'Local da Prestação / Sigla UF / País')).toBe('Sorriso / MT');
    expect(linhasDe(pdf)).toContain('Agronomia e congêneres.');
    expect(entre(pdf, 'Descrição do Serviço', 'TRIBUTAÇÃO MUNICIPAL (ISSQN)')).toContain('Assistência técnica agronômica: monitoramento de lavoura de soja');

    // ISSQN e tributos federais
    expect(valorDe(pdf, 'Tipo de Tributação do ISSQN')).toBe('Operação Tributável');
    expect(valorDe(pdf, 'Município / Sigla UF / País de Incidência do ISSQN')).toBe('Lucas do Rio Verde / MT');
    expect(valorDe(pdf, 'Regime Especial de Tributação do ISSQN')).toBe('Nenhum');
    expect(valorDe(pdf, 'BC ISSQN')).toBe('R$ 8.500,00');
    expect(valorDe(pdf, 'Alíquota Aplicada')).toBe('2,00%');
    expect(valorDe(pdf, 'Retenção do ISSQN')).toBe('Não Retido');
    expect(valorDe(pdf, 'ISSQN Apurado')).toBe('R$ 170,00');
    expect(valorDe(pdf, 'IRRF')).toBe('-');
    expect(valorDe(pdf, 'PIS - Débito Apuração Própria')).toBe('R$ 55,25');
    expect(valorDe(pdf, 'COFINS - Débito Apuração Própria')).toBe('R$ 255,00');
    expect(valorDe(pdf, 'Descrição Contrib. Sociais - Retidas')).toBe('PIS/COFINS Não Retidos');

    // IBS/CBS
    expect(valorDe(pdf, 'CST / cClassTrib')).toBe('000 / 000001');
    expect(valorDe(pdf, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF')).toBe('100301 / 5107925 / Sorriso / MT');
    expect(valorDe(pdf, 'Exclusões e Reduções da Base de Cálculo')).toBe('R$ 480,25'); // ISSQN 170,00 + PIS 55,25 + COFINS 255,00
    expect(valorDe(pdf, 'Base de Cálculo Após Exclusões e Reduções')).toBe('R$ 8.019,75');
    expect(valorDe(pdf, 'Red. Alíquota IBS / Red. Alíquota CBS')).toBe('-');
    expect(valorDe(pdf, 'Alíquota - IBS UF / IBS Mun')).toBe('0,10% / 0,00%');
    expect(valorDe(pdf, 'Alíq. Efetiva Municipal - IBS')).toBe('0,00%');
    expect(valorDe(pdf, 'Valor Apurado Municipal - IBS')).toBe('R$ 0,00');
    expect(valorDe(pdf, 'Alíq. Efetiva Estadual - IBS')).toBe('0,10%');
    expect(valorDe(pdf, 'Valor Apurado Estadual - IBS')).toBe('R$ 8,02');
    expect(valorDe(pdf, 'Valor Total Apurado - IBS')).toBe('R$ 8,02');
    expect(valorDe(pdf, 'Alíquota - CBS')).toBe('0,90%');
    expect(valorDe(pdf, 'Alíquota Efetiva - CBS')).toBe('0,90%');
    expect(valorDe(pdf, 'Valor Total Apurado - CBS')).toBe('R$ 72,18');

    // valor total
    expect(valorDe(pdf, 'VALOR DA OPERAÇÃO / SERVIÇO')).toBe('R$ 8.500,00');
    expect(valorDe(pdf, 'Total das Retenções (ISSQN / Federais)')).toBe('R$ 0,00');
    expect(valorDe(pdf, 'VALOR LÍQUIDO DA NFS-e')).toBe('R$ 8.500,00');
    expect(valorDe(pdf, 'Total do IBS/CBS')).toBe('R$ 80,20');
    expect(valorDe(pdf, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS')).toBe('R$ 8.500,00');
    expect(informacoes(pdf)).toBe(`Inf. Cont.: Pagamento em 30 dias. Safra 2026/27. | Doc. Tec.: ART 1420260012345 | Núm. Ped.: PO-2026-0457 | ${TOTAIS_PADRAO}`);
  });

  it('o cabeçalho traz o município e os ambientes, e o QR Code leva a URL da consulta pública com a chave, com legenda de três linhas', async () => {
    const espiao = vi.spyOn(Pintor.prototype, 'qrCode');
    try {
      const pdf = await gerar(nfseExemplo());
      const linhas = linhasDe(pdf);
      expect(linhas).toContain('NFS-e'); // espaço reservado da logomarca
      expect(linhas).toContain('Município: Lucas do Rio Verde / MT');
      expect(linhas).toContain('Ambiente Gerador: 2');
      expect(linhas).toContain('Tipo de Ambiente: 1');
      const i = linhas.indexOf('A autenticidade desta NFS-e pode ser verificada');
      expect(i).toBeGreaterThan(-1);
      expect(linhas.slice(i, i + 3)).toEqual([
        'A autenticidade desta NFS-e pode ser verificada', 'pela leitura deste código QR ou pela consulta da', 'chave de acesso no portal nacional da NFS-e',
      ]);

      expect(espiao).toHaveBeenCalledTimes(1);
      const [, , tamanho, texto] = espiao.mock.calls[0];
      expect(texto).toBe(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${CHAVE_NFSE_EXEMPLO}`);
      expect(texto).toBe(URL_CONSULTA_NFSE + CHAVE_NFSE_EXEMPLO);
      expect(texto).toHaveLength(53 + 50);
      // no mínimo 1,52 x 1,52 cm (NT 008, item 2.4.3), com os módulos legíveis
      expect(tamanho).toBeGreaterThanOrEqual((1.52 * 72) / 2.54);
      expect(matrizQr(texto).length).toBeGreaterThan(20);
    } finally {
      espiao.mockRestore();
    }
  });

  it('o código da chave de acesso sai em um bloco só, de 50 caracteres, também com CNPJ alfanumérico', async () => {
    const chave = ['510525922', 'AB12CD34EF56', '81', '0000000000123', '2611', '123456789', '8'].join('');
    const xml = nfseExemplo().replace(/Id="NFS[0-9A-Z]{50}"/, `Id="NFS${chave}"`).replace('<CNPJ>45723174000110</CNPJ>', '<CNPJ>12ABC34501DE35</CNPJ>');
    const pdf = await gerar(xml);
    expect(valorDe(pdf, 'CHAVE DE ACESSO DA NFS-E')).toBe(chave);
    expect(valorDe(pdf, 'CNPJ / CPF / NIF', 1)).toBe('12.ABC.345/01DE-35');
  });

  it('tomador, destinatário e intermediário sem dados viram a frase única do item 2.3.1, e o espaço sobra para o resto', async () => {
    const completo = await gerar(nfseExemplo({ destinatarioDistinto: true, comIntermediario: true }));
    const pdf = await gerar(nfseExemplo({ semTomador: true, semDestinatario: true }));
    const linhas = linhasDe(pdf);
    expect(linhas).toContain('TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
    expect(linhas).toContain('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
    expect(linhas).toContain('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
    for (const titulo of ['TOMADOR / ADQUIRENTE', 'DESTINATÁRIO DA OPERAÇÃO', 'INTERMEDIÁRIO DA OPERAÇÃO']) expect(linhas, titulo).not.toContain(titulo);
    expect(paginas(pdf)).toBe(1);
    // os blocos completos estão no outro PDF
    const cheio = linhasDe(completo);
    for (const titulo of ['TOMADOR / ADQUIRENTE', 'DESTINATÁRIO DA OPERAÇÃO', 'INTERMEDIÁRIO DA OPERAÇÃO']) expect(cheio, titulo).toContain(titulo);
  });

  it('o destinatário que é o próprio tomador leva a frase do item 2.3.2; quando é outra pessoa o bloco dele mostra os dados do dest', async () => {
    const proprio = linhasDe(await gerar(nfseExemplo()));
    expect(proprio).toContain('O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO');
    expect(proprio).not.toContain('DESTINATÁRIO DA OPERAÇÃO');

    const pdf = await gerar(nfseExemplo({ destinatarioDistinto: true, comIntermediario: true }));
    const linhas = linhasDe(pdf);
    expect(linhas).not.toContain('O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO');
    expect(linhas).toContain('DESTINATÁRIO DA OPERAÇÃO');
    expect(valorDe(pdf, 'CNPJ / CPF / NIF', 2)).toBe('45.723.174/0002-00');
    expect(valorDe(pdf, 'Nome / Nome Empresarial', 2)).toBe('FAZENDA SANTA LUZIA AGROPECUARIA S/A - FILIAL SINOP');
    // o XML não dá o nome do município do destinatário: a UF sai com um traço no lugar do nome, e o código IBGE aparece ao lado
    expect(valorDe(pdf, 'Município / Sigla UF', 2)).toBe('- / MT');
    expect(valorDe(pdf, 'Código IBGE / CEP', 2)).toBe('5107909 / 78.550-000');
    // o destinatário não tem inscrição municipal; o intermediário tem
    expect(valorDe(pdf, 'Indicador Municipal (Inscrição)', 2)).toBe('88120');
    expect(valorDe(pdf, 'CNPJ / CPF / NIF', 3)).toBe('03.778.899/0001-40');
    expect(valorDe(pdf, 'Nome / Nome Empresarial', 3)).toBe('INTERMEDIARIA DE NEGOCIOS AGRO LTDA');
  });

  it('operação não sujeita ao ISSQN: frase única no lugar do bloco, e o município some do cabeçalho', async () => {
    const frase = 'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN';
    for (const xml of [nfseExemplo({ naoSujeitaIssqn: true }), nfseExemplo().replace('<tribISSQN>1</tribISSQN>', '<tribISSQN>4</tribISSQN>')]) {
      const pdf = await gerar(xml);
      const linhas = linhasDe(pdf);
      expect(linhas).toContain(frase);
      expect(linhas).not.toContain('TRIBUTAÇÃO MUNICIPAL (ISSQN)');
      expect(linhas).not.toContain('Tipo de Tributação do ISSQN');
      expect(paginas(pdf)).toBe(1);
    }
    // no item 99 (990101) o município do emitente não é exibido
    const sem99 = linhasDe(await gerar(nfseExemplo({ naoSujeitaIssqn: true })));
    expect(sem99.some((l) => l.startsWith('Município:'))).toBe(false);
    expect(sem99).toContain('Ambiente Gerador: 2');
    // imunidade e exportação mantêm o bloco, com os campos próprios
    const imune = await gerar(nfseExemplo().replace('<tribISSQN>1</tribISSQN>', '<tribISSQN>2</tribISSQN><tpImunidade>4</tpImunidade>'));
    expect(valorDe(imune, 'Tipo de Tributação do ISSQN')).toBe('Imunidade');
    expect(valorDe(imune, 'Tipo de Imunidade do ISSQN')).toBe('Livros, jornais, periódicos e o papel...');
  });

  it('NFS-e cancelada leva a marca d\'água CANCELADA; a de homologação leva a expressão em vermelho abaixo do título', async () => {
    const normal = await gerar(nfseExemplo());
    expect(textoDe(normal)).not.toContain('CANCELADA');
    expect(textoDe(normal)).not.toContain('SEM VALIDADE JURÍDICA');
    expect(normal.toString('latin1')).not.toMatch(/0 1 1 0 scn/);

    const cancelada = await gerar(nfseExemplo(), { cancelada: true });
    expect(linhasDe(cancelada)).toContain('CANCELADA');
    expect(paginas(cancelada)).toBe(1);
    expect(cancelada.toString('latin1')).toMatch(/0\.65\d* 0\.65\d* 0\.65\d* scn/); // cinza K35

    const homolog = await gerar(nfseExemplo({ homologacao: true }));
    const linhas = linhasDe(homolog);
    const i = linhas.indexOf('Documento Auxiliar da NFS-e');
    expect(linhas[i - 1]).toBe('DANFSe v2.0');
    expect(linhas[i + 1]).toBe('NFS-e SEM VALIDADE JURÍDICA');
    expect(linhas).toContain('Tipo de Ambiente: 2');
    expect(homolog.toString('latin1')).toMatch(/\/DeviceCMYK cs\n0 1 1 0 scn/); // vermelho sólido M100/Y100
    expect(linhas).not.toContain('CANCELADA');

    // a NFS-e não é denegada: a opção das outras notas é ignorada
    expect(textoDe(await gerar(nfseExemplo(), { denegada: true }))).not.toContain('DENEGADA');
  });

  it('campos sem informação no XML levam traço (nota 12), do prestador ao IBS/CBS', async () => {
    const pdf = await gerar(nfseExemplo({ enxuta: true, simplesNacional: true, semTomador: true }));
    expect(valorDe(pdf, 'Telefone', 0)).toBe('-');
    expect(valorDe(pdf, 'E-mail', 0)).toBe('-');
    expect(valorDe(pdf, 'Código da NBS')).toBe('-');
    expect(valorDe(pdf, 'Tipo de Imunidade do ISSQN')).toBe('-');
    expect(valorDe(pdf, 'Número Processo Suspensão')).toBe('-');
    expect(valorDe(pdf, 'BC ISSQN')).toBe('-');
    expect(valorDe(pdf, 'ISSQN Apurado')).toBe('-');
    expect(valorDe(pdf, 'Contribuições Sociais - Retidas')).toBe('-');
    // sem o grupo IBSCBS no XML o bloco todo e a finalidade levam traço
    expect(valorDe(pdf, 'FINALIDADE')).toBe('-');
    for (const rotulo of ['CST / cClassTrib', 'Exclusões e Reduções da Base de Cálculo', 'Alíquota - IBS UF / IBS Mun', 'Valor Total Apurado - CBS', 'Total do IBS/CBS', 'VALOR LÍQUIDO DA NFS-e + IBS/CBS']) {
      expect(valorDe(pdf, rotulo), rotulo).toBe('-');
    }
    // o que o XML traz do Simples Nacional aparece
    expect(valorDe(pdf, 'Simples Nacional na Data de Competência')).toBe('Optante - Microempresa ou Empresa de...');
    expect(valorDe(pdf, 'Regime de Apuração Tributária pelo SN')).toBe('Regime de apuração dos tributos federais e municipal pelo Simples Nacional');
  });

  it('uma NFS-e quase vazia (só a chave e a DPS) sai do mesmo jeito, tudo com traço, em uma página', async () => {
    const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${CHAVE_NFSE_EXEMPLO}"><DPS><infDPS/></DPS></infNFSe></NFSe>`;
    const pdf = await gerar(xml);
    expect(paginas(pdf)).toBe(1);
    const linhas = linhasDe(pdf);
    expect(linhas).toContain('PRESTADOR / FORNECEDOR');
    expect(linhas).toContain('TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
    expect(valorDe(pdf, 'NÚMERO DA NFS-E')).toBe('-');
    expect(valorDe(pdf, 'Nome / Nome Empresarial')).toBe('-');
    expect(valorDe(pdf, 'VALOR LÍQUIDO DA NFS-e')).toBe('-');
    expect(informacoes(pdf)).toBe('Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: -; Estaduais: -; Municipais: -');
    // sem município emissor nem ambientes, o cabeçalho leva traço
    expect(linhas).toContain('Município: -');
    expect(linhas).toContain('Ambiente Gerador: -');
    expect(linhas).toContain('Tipo de Ambiente: -');
  });

  it('recusa o que não é NFS-e Nacional, com ErroLeituraNfse', async () => {
    await expect(gerarDanfse('<catalogo/>')).rejects.toBeInstanceOf(ErroLeituraNfse);
    await expect(gerarDanfse(nfeExemplo())).rejects.toThrow(/não é uma NFS-e Nacional/);
    await expect(gerarDanfse('')).rejects.toBeInstanceOf(ErroLeituraDocumento);
    await expect(gerarDanfse(nfseExemplo().replace(/ Id="NFS[0-9A-Z]{50}"/, ''))).rejects.toThrow(/chave de acesso de 50 caracteres/);
  });

  it('caractere fora do alfabeto do PDF vira ponto de interrogação em vez de quebrar o arquivo', async () => {
    const xml = nfseExemplo().replace('FAZENDA SANTA LUZIA AGROPECUARIA S/A', 'FAZENDA ŐŰ S/A');
    expect(valorDe(await gerar(xml), 'Nome / Nome Empresarial', 1)).toBe('FAZENDA ?? S/A');
  });

  it('descrições longas cabem na única página, cortadas com reticências nos limites da NT (1.297 e 1.997 caracteres)', async () => {
    const descricao = 'PALAVRA '.repeat(400);
    const infComp = 'OBS '.repeat(700);
    const pdf = await gerar(nfseExemplo({ descricao, infComp }));
    expect(paginas(pdf)).toBe(1);
    expect(entre(pdf, 'Descrição do Serviço', 'TRIBUTAÇÃO MUNICIPAL (ISSQN)')).toBe(`${descricao.slice(0, 1297).trimEnd()}...`);
    const itens = `Inf. Cont.: ${infComp.trim()} | Doc. Tec.: ART 1420260012345 | Núm. Ped.: PO-2026-0457`;
    // os itens perdem o que passa de 1.997 caracteres, e a linha dos totais aproximados fica sempre inteira, por último
    expect(informacoes(pdf)).toBe(`${itens.slice(0, 1997).trimEnd()}... | ${TOTAIS_PADRAO}`);
    // dentro do limite nada é cortado
    const medio = await gerar(nfseExemplo({ descricao: 'Serviço de campo. '.repeat(50) }));
    expect(entre(medio, 'Descrição do Serviço', 'TRIBUTAÇÃO MUNICIPAL (ISSQN)')).toBe('Serviço de campo. '.repeat(50).trim());
  });

  it('nome e endereço passam de 77 caracteres com reticências, e a descrição do código de tributação de 167', async () => {
    const nome = 'AGROPECUARIA E CONSULTORIA DE PRODUTOS AGRICOLAS E SERVICOS TECNICOS ESPECIALIZADOS DO CENTRO-OESTE LTDA ME';
    const longa = 'Florestamento, reflorestamento, semeadura, adubação, reparação de solo, plantio, silagem, colheita, corte e descascamento de árvores, silvicultura, exploração florestal e dos serviços congêneres indissociáveis da formação.';
    const pdf = await gerar(nfseExemplo({ nomePrestador: nome, descricaoTribNacional: longa }));
    expect(entre(pdf, 'Nome / Nome Empresarial', 'Município / Sigla UF', 0)).toBe(`${nome.slice(0, 77)}...`);
    expect(colapsar(linhasDe(pdf))).toContain(`${longa.slice(0, 167).trimEnd()}...`);
    expect(colapsar(linhasDe(pdf))).not.toContain(longa);
  });

  it('com todos os blocos cheios e textos enormes ainda é uma página só, e a linha dos totais aproximados não se perde', async () => {
    const pdf = await gerar(nfseCheia());
    expect(paginas(pdf)).toBe(1);
    const t = textoDe(pdf);
    expect(t).toContain('Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: R$ 1.143,25; Estaduais: R$ 0,00; Municipais: R$ 170,00');
    // a descrição do serviço ainda tem espaço para as primeiras linhas, que terminam em reticências
    const descricao = entre(pdf, 'Descrição do Serviço', 'TRIBUTAÇÃO MUNICIPAL (ISSQN)');
    expect(descricao.startsWith('linha 1 linha 2 linha 3')).toBe(true);
    expect(descricao).not.toContain('linha 100'); // o resto é cortado: a caixa só tem altura para as primeiras linhas
    for (const titulo of ['TRIBUTAÇÃO IBS / CBS', 'VALOR TOTAL DA NFS-E', 'INFORMAÇÕES COMPLEMENTARES']) expect(t, titulo).toContain(titulo);
  });

  it('a linha de PIS e COFINS só é impressa para competência até 2026 (nota 6); o resto do bloco federal fica', async () => {
    const ate2026 = linhasDe(await gerar(nfseExemplo({ competencia: '2026-12-31' })));
    expect(ate2026).toContain('PIS - Débito Apuração Própria');
    expect(ate2026).toContain('COFINS - Débito Apuração Própria');
    const depois = linhasDe(await gerar(nfseExemplo({ competencia: '2027-01-01' })));
    expect(depois).not.toContain('PIS - Débito Apuração Própria');
    expect(depois).not.toContain('Descrição Contrib. Sociais - Retidas');
    for (const rotulo of ['TRIBUTAÇÃO FEDERAL (EXCETO CBS)', 'IRRF', 'Contribuição Previdenciária - Retida', 'Contribuições Sociais - Retidas']) expect(depois, rotulo).toContain(rotulo);
  });

  it('retenções do ISSQN e federais, e IBS/CBS por fora a partir de 2027', async () => {
    const pdf = await gerar(nfseExemplo({ issqnRetido: true, retencoesFederais: true, competencia: '2027-01-15' }));
    expect(valorDe(pdf, 'Retenção do ISSQN')).toBe('Retido pelo Tomador');
    expect(valorDe(pdf, 'IRRF')).toBe('R$ 127,50');
    expect(valorDe(pdf, 'Contribuições Sociais - Retidas')).toBe('R$ 85,00');
    expect(valorDe(pdf, 'Total das Retenções (ISSQN / Federais)')).toBe('R$ 382,50');
    expect(valorDe(pdf, 'VALOR LÍQUIDO DA NFS-e')).toBe('R$ 8.117,50');
    expect(valorDe(pdf, 'Valor Total Apurado - CBS')).toBe('R$ 733,04');
    expect(valorDe(pdf, 'Total do IBS/CBS')).toBe('R$ 741,37');
    expect(valorDe(pdf, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS')).toBe('R$ 8.858,87');
    expect(valorDe(pdf, 'Exclusões e Reduções da Base de Cálculo')).toBe('R$ 170,00'); // só o ISSQN: sem PIS/COFINS em 2027
    const piscofins = linhasDe(await gerar(nfseExemplo({ retencoesFederais: true })));
    expect(piscofins).toContain('PIS/COFINS/CSLL Retidos');
  });

  it('informações complementares na ordem da NT, separadas por pipes, com a linha fixa dos totais aproximados sempre por último', async () => {
    const completo = await gerar(nfseExemplo({ todosOsComplementos: true, infComp: 'Pagamento em 30 dias.' }));
    expect(informacoes(completo)).toBe(
      'Inf. Cont.: Pagamento em 30 dias. | NFS-e Subst.: 51052592211222333000181000000000009926100987654321 | Doc. Ref.: Contrato 2026/118 | Cod. Obra: CNO-90.123.45678/90 | '
      + 'Insc. Imob.: 01.02.003.0045.001 | Cod. Evt.: EVT-2026-33 | Doc. Tec.: ART 1420260012345 | Núm. Ped.: PO-2026-0457 | Item Ped.: 1, 2, 5 | '
      + `Inf. A. T. Mun.: Alvará municipal 2026/4412 | ${TOTAIS_PADRAO}`,
    );
    expect(informacoes(await gerar(nfseExemplo({ tributosAproximados: 'percentual' })))).toContain('Federais: 13,45%; Estaduais: 0,00%; Municipais: 2,00%');
    expect(informacoes(await gerar(nfseExemplo({ tributosAproximados: 'nenhum' })))).toMatch(/Federais: -; Estaduais: -; Municipais: -$/);
    expect(informacoes(await gerar(nfseExemplo({ simplesNacional: true })))).toMatch(/\| Simples Nacional \(tributos aproximados\): 6,00% \| Totais Aproximados dos Tributos cfe\. Lei nº 12\.741\/2012: Federais: -; Estaduais: -; Municipais: -$/);
    // sem nenhum item, só a linha dos totais
    const semItens = nfseExemplo().replace(/<infoCompl>[\s\S]*?<\/infoCompl>/, '');
    expect(informacoes(await gerar(semItens))).toBe(TOTAIS_PADRAO);
  });

  it('as opções numéricas do leiaute viram a descrição, cortada em 37 caracteres com reticências como no exemplo da NT, e o código desconhecido passa como está', async () => {
    const pdf = await gerar(nfseExemplo({ situacao: '102', simplesNacional: true }));
    expect(valorDe(pdf, 'SITUAÇÃO DA NFS-e')).toBe('NFS-e de Decisão Judicial ou Administ...');
    expect(valorDe(pdf, 'Simples Nacional na Data de Competência')).toBe('Optante - Microempresa ou Empresa de...');
    expect(valorDe(await gerar(nfseExemplo({ situacao: '103' })), 'SITUAÇÃO DA NFS-e')).toBe('NFS-e Avulsa');
    expect(valorDe(await gerar(nfseExemplo({ situacao: '107' })), 'SITUAÇÃO DA NFS-e')).toBe('NFS-e MEI');
    expect(valorDe(await gerar(nfseExemplo().replace('<cStat>100</cStat>', '<cStat>555</cStat>')), 'SITUAÇÃO DA NFS-e')).toBe('555');
    // tomador emitindo: a descrição do tpEmit
    expect(valorDe(await gerar(nfseExemplo().replace('<tpEmit>1</tpEmit>', '<tpEmit>3</tpEmit>')), 'EMITENTE DA NFS-e')).toBe('Intermediário');
  });

  it('tomador no exterior: NIF, cidade / estado / país e o código postal com (ext)', async () => {
    const pdf = await gerar(nfseExemplo({ tomadorExterior: true }));
    expect(valorDe(pdf, 'CNPJ / CPF / NIF', 1)).toBe('US-98-7654321');
    expect(valorDe(pdf, 'Município / Sigla UF', 1)).toBe('Chicago / Illinois / US');
    expect(valorDe(pdf, 'Código IBGE / CEP', 1)).toBe('60601 (ext)');
    expect(valorDe(pdf, 'Endereço', 1)).toBe('North Michigan Avenue, 500, Suite 1200, Loop');
    const semNif = nfseExemplo({ tomadorExterior: true }).replace('<NIF>US-98-7654321</NIF>', '<cNaoNIF>1</cNaoNIF>');
    expect(valorDe(await gerar(semNif), 'CNPJ / CPF / NIF', 1)).toBe('Dispensado do NIF');
  });

  it('segue o formulário da NT: linhas de 0,5 pt, borda de 1 pt, cinza claro de 5% nos títulos, sem rodapé nem canhoto, com a identificação do InTAX só nos metadados', async () => {
    const pdf = await gerar(nfseExemplo());
    const bruto = pdf.toString('latin1');
    expect(bruto).toContain('1 w\n');
    expect(bruto).toContain('0.5 w\n');
    expect(bruto).toMatch(/0\.949\d* 0\.949\d* 0\.949\d* scn/); // cinza de 5%
    expect(bruto).toContain('/MediaBox [0 0 595.28 841.89]'); // A4 em pé

    const t = textoDe(pdf);
    expect(t).not.toMatch(/InTAX/i);
    expect(t).not.toContain('DATA CIENTIFICAÇÃO');
    expect(t).not.toContain('IDENTIFICAÇÃO E ASSINATURA');
    expect(bruto).toContain('(InTAX)'); // Author e Creator do PDF
  });

  it('o que vem do XML não derruba o desenho: código com nome de propriedade de objeto passa como está e texto enorme num campo curto é cortado', async () => {
    const xml = nfseExemplo()
      .replace('<cStat>100</cStat>', '<cStat>constructor</cStat>')
      .replace('<tpRetISSQN>1</tpRetISSQN>', '<tpRetISSQN>__proto__</tpRetISSQN>')
      .replace(/<email>financeiro[^<]*<\/email>/g, `<email>${'a'.repeat(900_000)}</email>`)
      .replace('<serie>1</serie>', '<serie>SŐŰ</serie>');
    const pdf = await gerar(xml);
    expect(paginas(pdf)).toBe(1);
    expect(valorDe(pdf, 'SITUAÇÃO DA NFS-e')).toBe('constructor');
    expect(valorDe(pdf, 'Retenção do ISSQN')).toBe('__proto__');
    expect(valorDe(pdf, 'SÉRIE DA DPS')).toBe('S??');
    // o e-mail passa de 300 caracteres: o campo mostra só o começo, com reticências
    const email = entre(pdf, 'E-mail', 'Simples Nacional na Data de Competência', 0).replace(/ /g, '');
    expect(email.startsWith('aaaa')).toBe(true);
    expect(email.length).toBeLessThan(200);
  });

  it('com a compressão normal (a de produção) o arquivo é válido e menor', async () => {
    const comprimido = await gerarDanfse(nfseExemplo());
    const puro = await gerar(nfseExemplo());
    expect(comprimido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(comprimido.length).toBeLessThan(puro.length);
  });
});
