import { createHash } from 'crypto';
import { zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { caminhoObjeto, decidirRegistro, IMPORTAVEL, RepositorioXmlService } from './repositorio-xml.service';

const CH = '51261112345678000195550010000001231000000010';

const completo = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${CH}" versao="4.00">
  <ide><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-05T10:15:00-03:00</dhEmi></ide>
  <emit><CNPJ>12345678000195</CNPJ><xNome>FORNECEDOR</xNome></emit><dest><CNPJ>98765432000110</CNPJ></dest>
  <total><ICMSTot><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe>
  <protNFe><infProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
const resumo = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${CH}</chNFe><CNPJ>12345678000195</CNPJ>
  <xNome>FORNECEDOR</xNome><dhEmi>2026-11-05T10:15:00-03:00</dhEmi><vNF>100.00</vNF><cSitNFe>1</cSitNFe></resNFe>`;
const cancelamento = `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento><infEvento Id="ID1">
  <CNPJ>12345678000195</CNPJ><chNFe>${CH}</chNFe><dhEvento>2026-11-06T09:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento>
  </infEvento></evento><retEvento><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>`;

function montar() {
  const linhas: Record<string, unknown>[] = [];
  const casa = (l: Record<string, unknown>, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => l[k] === v);
  const prisma = {
    empresa: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, cnpj_cpf: '12.345.678/0001-95', grupo: '001' }) },
    documentoXml: {
      findUnique: async ({ where }: { where: { empresa_id_tipo_chave_evento_tipo_sequencia: Record<string, unknown> } }) =>
        linhas.find((l) => casa(l, where.empresa_id_tipo_chave_evento_tipo_sequencia)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const r = { id: `d${linhas.length + 1}`, ...data }; linhas.push(r); return r; },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { Object.assign(linhas.find((l) => l.id === where.id)!, data); },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const alvo = linhas.filter((l) => casa(l, where)); alvo.forEach((a) => Object.assign(a, data)); return { count: alvo.length };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => linhas.find((l) => casa(l, where)) ?? null,
    },
  };
  const storage = { guardar: vi.fn(async () => undefined), removeObject: vi.fn(async () => undefined) };
  const service = new RepositorioXmlService(prisma as never, storage as never, {} as never);
  return { service, linhas, storage };
}

describe('decidirRegistro e caminhoObjeto', () => {
  it('só o resumo é substituído pelo completo', () => {
    expect(decidirRegistro(null, { conteudo: 'RESUMO' })).toBe('CRIAR');
    expect(decidirRegistro({ conteudo: 'RESUMO' }, { conteudo: 'COMPLETO' })).toBe('ATUALIZAR');
    expect(decidirRegistro({ conteudo: 'COMPLETO' }, { conteudo: 'RESUMO' })).toBe('DUPLICADO');
    expect(decidirRegistro({ conteudo: 'COMPLETO' }, { conteudo: 'COMPLETO' })).toBe('DUPLICADO');
  });
  it('caminho por empresa, origem, ano e mês da chave', () => {
    const base = { chave: CH, tipo: 'NFE' as const, eventoTipo: '', sequencia: 0, conteudo: 'COMPLETO' as const };
    expect(caminhoObjeto('E1', 'UPLOAD', base)).toBe(`repositorio/E1/importacao/2026/11/${CH}.xml`);
    expect(caminhoObjeto('E1', 'CAPTURA', { ...base, conteudo: 'RESUMO' })).toBe(`repositorio/E1/captura/2026/11/resumo-${CH}.xml`);
    expect(caminhoObjeto('E1', 'CAPTURA', { ...base, tipo: 'EVENTO', eventoTipo: '110111', sequencia: 1 })).toBe(`repositorio/E1/captura/2026/11/evento-110111-1-${CH}.xml`);
  });
});

describe('RepositorioXmlService.registrar', () => {
  it('registra, e o mesmo XML de novo é duplicado', async () => {
    const { service, linhas, storage } = montar();
    expect((await service.registrar('E1', Buffer.from(completo), { origem: 'UPLOAD' })).resultado).toBe('NOVO');
    expect((await service.registrar('E1', Buffer.from(completo), { origem: 'UPLOAD' })).resultado).toBe('DUPLICADO');
    expect(linhas).toHaveLength(1);
    expect(storage.guardar).toHaveBeenCalledTimes(1);
    expect(linhas[0]).toMatchObject({ tipo: 'NFE', chave: CH, conteudo: 'COMPLETO', situacao: 'AUTORIZADA', origem: 'UPLOAD', numero: '123' });
  });

  it('o resumo da captura é trocado pelo XML completo e o arquivo antigo é removido', async () => {
    const { service, linhas, storage } = montar();
    await service.registrar('E1', Buffer.from(resumo), { origem: 'CAPTURA', nsu: '000000000000010' });
    expect(linhas[0]).toMatchObject({ conteudo: 'RESUMO', nsu: '000000000000010' });
    const r = await service.registrar('E1', Buffer.from(completo), { origem: 'CAPTURA', nsu: '000000000000011' });
    expect(r.resultado).toBe('ATUALIZADO');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ conteudo: 'COMPLETO', nsu: '000000000000011' });
    expect(storage.removeObject).toHaveBeenCalledWith(`repositorio/E1/captura/2026/11/resumo-${CH}.xml`);
    expect((await service.registrar('E1', Buffer.from(resumo), { origem: 'CAPTURA' })).resultado).toBe('DUPLICADO');
  });

  it('cancelamento marca o documento, em qualquer ordem de chegada', async () => {
    const a = montar();
    await a.service.registrar('E1', Buffer.from(completo), { origem: 'UPLOAD' });
    await a.service.registrar('E1', Buffer.from(cancelamento), { origem: 'UPLOAD' });
    expect(a.linhas.find((l) => l.tipo === 'NFE')?.situacao).toBe('CANCELADA');

    const b = montar();
    await b.service.registrar('E1', Buffer.from(cancelamento), { origem: 'UPLOAD' });
    await b.service.registrar('E1', Buffer.from(completo), { origem: 'UPLOAD' });
    expect(b.linhas.find((l) => l.tipo === 'NFE')?.situacao).toBe('CANCELADA');
  });

  it('recusa documento de outra empresa e o que não é fiscal', async () => {
    const { service, linhas } = montar();
    expect(await service.registrar('E1', Buffer.from(completo), { origem: 'UPLOAD', raizEmpresa: '99999999' })).toMatchObject({ resultado: 'IGNORADO', motivo: expect.stringContaining('não cita o CNPJ') });
    expect(await service.registrar('E1', Buffer.from('<outro/>'), { origem: 'UPLOAD' })).toMatchObject({ resultado: 'IGNORADO' });
    expect(linhas).toHaveLength(0);
  });
});

describe('RepositorioXmlService.receberArquivos', () => {
  it('conta novos e duplicados, ignora o que não é xml e recusa outra empresa', async () => {
    const { service } = montar();
    const r = await service.receberArquivos('E1', [
      { nome: 'a.xml', buffer: Buffer.from(completo) },
      { nome: 'b.xml', buffer: Buffer.from(completo) },
      { nome: 'nota.pdf', buffer: Buffer.from('%PDF') },
      { nome: 'estranho.xml', buffer: Buffer.from('<qualquer/>') },
    ], 'fulano@fal');
    expect(r).toMatchObject({ novos: 1, duplicados: 1, atualizados: 0 });
    expect(r.ignorados.map((i) => i.nome).sort()).toEqual(['estranho.xml', 'nota.pdf']);
  });
});

describe('NFS-e Nacional no repositório', () => {
  // chave de 50 posições: município, ambiente gerador, tipo de inscrição, inscrição federal, número, AAMM, código numérico e DV
  const CH_NFSE = '5103403' + '2' + '2' + '12345678000195' + '0000000000123' + '2611' + '123456789' + '0';
  const NS = 'xmlns="http://www.sped.fazenda.gov.br/nfse"';
  const nfse = `<NFSe ${NS} versao="1.01"><infNFSe Id="NFS${CH_NFSE}"><nNFSe>123</nNFSe><cStat>100</cStat><dhProc>2026-11-05T10:20:00-03:00</dhProc>
    <emit><CNPJ>12345678000195</CNPJ><xNome>PRESTADORA AGRO</xNome></emit><valores><vLiq>980.00</vLiq></valores>
    <DPS><infDPS><dhEmi>2026-11-05T10:15:00-03:00</dhEmi><serie>1</serie><toma><CNPJ>98765432000110</CNPJ></toma></infDPS></DPS></infNFSe></NFSe>`;
  const evento = (codigo: string) => `<evento ${NS} versao="1.01"><infEvento Id="EVT${CH_NFSE}${codigo}001"><nSeqEvento>1</nSeqEvento><dhProc>2026-12-02T09:00:05-03:00</dhProc>
    <pedRegEvento><infPedReg><dhEvento>2026-12-02T09:00:00-03:00</dhEvento><CNPJAutor>12345678000195</CNPJAutor><chNFSe>${CH_NFSE}</chNFSe><e${codigo}/></infPedReg></pedRegEvento></infEvento></evento>`;
  const base = { chave: CH_NFSE, tipo: 'NFSE' as const, eventoTipo: '', sequencia: 0, conteudo: 'COMPLETO' as const };

  it('o caminho usa o ano e o mês da data de emissão, no horário de Brasília, e não a chave de 44 posições', () => {
    expect(caminhoObjeto('E1', 'CAPTURA', { ...base, dataEmissao: new Date('2026-11-05T13:15:00Z') })).toBe(`repositorio/E1/captura/2026/11/${CH_NFSE}.xml`);
    // 01/12 01:30 em UTC ainda é 30/11 em Brasília; 01/01 02:59 em UTC é 31/12
    expect(caminhoObjeto('E1', 'UPLOAD', { ...base, dataEmissao: new Date('2026-12-01T01:30:00Z') })).toBe(`repositorio/E1/importacao/2026/11/${CH_NFSE}.xml`);
    expect(caminhoObjeto('E1', 'UPLOAD', { ...base, dataEmissao: new Date('2027-01-01T02:59:00Z') })).toBe(`repositorio/E1/importacao/2026/12/${CH_NFSE}.xml`);
    expect(caminhoObjeto('E1', 'CAPTURA', { ...base, tipo: 'EVENTO', eventoTipo: '101101', sequencia: 1, dataEmissao: new Date('2026-12-02T12:00:00Z') }))
      .toBe(`repositorio/E1/captura/2026/12/evento-101101-1-${CH_NFSE}.xml`);
  });

  it('sem data de emissão no XML vale a da recepção; NF-e e CT-e seguem pela chave, mesmo com data', () => {
    expect(caminhoObjeto('E1', 'CAPTURA', { ...base, dataEmissao: null }, new Date('2026-08-15T12:00:00Z'))).toBe(`repositorio/E1/captura/2026/08/${CH_NFSE}.xml`);
    expect(caminhoObjeto('E1', 'CAPTURA', base, new Date('2026-08-15T12:00:00Z'))).toBe(`repositorio/E1/captura/2026/08/${CH_NFSE}.xml`);
    const nfe = { chave: CH, tipo: 'NFE' as const, eventoTipo: '', sequencia: 0, conteudo: 'COMPLETO' as const, dataEmissao: new Date('2020-01-01T12:00:00Z') };
    expect(caminhoObjeto('E1', 'UPLOAD', nfe)).toBe(`repositorio/E1/importacao/2026/11/${CH}.xml`);
  });

  it('registra a NFS-e com os campos do índice, e o mesmo XML de novo é duplicado', async () => {
    const { service, linhas, storage } = montar();
    expect((await service.registrar('E1', Buffer.from(nfse), { origem: 'CAPTURA', nsu: '000000000000071', nomeOriginal: 'NFSe' })).resultado).toBe('NOVO');
    expect((await service.registrar('E1', Buffer.from(nfse), { origem: 'CAPTURA', nsu: '000000000000071', nomeOriginal: 'NFSe' })).resultado).toBe('DUPLICADO');
    expect(linhas).toHaveLength(1);
    expect(storage.guardar).toHaveBeenCalledTimes(1);
    expect(linhas[0]).toMatchObject({
      tipo: 'NFSE', chave: CH_NFSE, evento_tipo: '', sequencia: 0, modelo: null, numero: '123', serie: '1', conteudo: 'COMPLETO', situacao: 'AUTORIZADA',
      emitente_doc: '12345678000195', emitente_nome: 'PRESTADORA AGRO', destinatario_doc: '98765432000110', valor_total: 980,
      origem: 'CAPTURA', nsu: '000000000000071', nome_original: 'NFSe', storage_key: `repositorio/E1/captura/2026/11/${CH_NFSE}.xml`,
    });
    expect((linhas[0].data_emissao as Date).toISOString()).toBe('2026-11-05T13:15:00.000Z');
  });

  it('qualquer um dos eventos de cancelamento marca a NFS-e como cancelada, em qualquer ordem de chegada', async () => {
    for (const codigo of ['101101', '105102', '105104', '305101']) {
      const a = montar();
      await a.service.registrar('E1', Buffer.from(nfse), { origem: 'CAPTURA' });
      await a.service.registrar('E1', Buffer.from(evento(codigo)), { origem: 'CAPTURA' });
      expect(a.linhas.find((l) => l.tipo === 'NFSE')?.situacao, `${codigo} depois da nota`).toBe('CANCELADA');
      const registrado = a.linhas.find((l) => l.tipo === 'EVENTO');
      expect(registrado, codigo).toMatchObject({ chave: CH_NFSE, evento_tipo: codigo, sequencia: 1, situacao: 'CANCELADA', storage_key: `repositorio/E1/captura/2026/12/evento-${codigo}-1-${CH_NFSE}.xml` });

      const b = montar();
      await b.service.registrar('E1', Buffer.from(evento(codigo)), { origem: 'CAPTURA' });
      await b.service.registrar('E1', Buffer.from(nfse), { origem: 'CAPTURA' });
      expect(b.linhas.find((l) => l.tipo === 'NFSE')?.situacao, `${codigo} antes da nota`).toBe('CANCELADA');
    }
  });

  it('evento que não cancela (manifestação do tomador, análise fiscal pedida) fica guardado sem mexer na situação da NFS-e', async () => {
    for (const codigo of ['203206', '101103', '305102']) {
      const a = montar();
      await a.service.registrar('E1', Buffer.from(nfse), { origem: 'CAPTURA' });
      await a.service.registrar('E1', Buffer.from(evento(codigo)), { origem: 'CAPTURA' });
      expect(a.linhas.find((l) => l.tipo === 'NFSE')?.situacao, codigo).toBe('AUTORIZADA');
      expect(a.linhas.find((l) => l.tipo === 'EVENTO'), codigo).toMatchObject({ evento_tipo: codigo, situacao: null });

      const b = montar();
      await b.service.registrar('E1', Buffer.from(evento(codigo)), { origem: 'CAPTURA' });
      await b.service.registrar('E1', Buffer.from(nfse), { origem: 'CAPTURA' });
      expect(b.linhas.find((l) => l.tipo === 'NFSE')?.situacao, codigo).toBe('AUTORIZADA');
    }
  });

  it('o cancelamento da NFS-e não confunde documentos de outro tipo nem de outra chave', async () => {
    const { service, linhas } = montar();
    await service.registrar('E1', Buffer.from(completo), { origem: 'UPLOAD' });
    await service.registrar('E1', Buffer.from(nfse), { origem: 'UPLOAD' });
    await service.registrar('E1', Buffer.from(evento('101101')), { origem: 'UPLOAD' });
    expect(linhas.find((l) => l.tipo === 'NFE')?.situacao).toBe('AUTORIZADA');
    expect(linhas.find((l) => l.tipo === 'NFSE')?.situacao).toBe('CANCELADA');
  });

  it('o envio de arquivos reconhece a NFS-e, e a que não cita o CNPJ da empresa é recusada', async () => {
    const { service, linhas } = montar();
    const r = await service.receberArquivos('E1', [
      { nome: 'nfse.xml', buffer: Buffer.from(nfse) },
      { nome: 'nfe.xml', buffer: Buffer.from(completo) },
      { nome: 'abrasf.xml', buffer: Buffer.from('<Nfse xmlns="http://www.abrasf.org.br/nfse.xsd"><InfNfse><Numero>1</Numero></InfNfse></Nfse>') },
    ], 'fulano@fal');
    expect(r).toMatchObject({ novos: 2, duplicados: 0 });
    expect(r.ignorados).toEqual([{ nome: 'abrasf.xml', motivo: 'não reconhecido como NF-e, CT-e, MDF-e, NFS-e ou evento' }]);
    expect(linhas.map((l) => l.tipo).sort()).toEqual(['NFE', 'NFSE']);

    const outra = montar();
    expect(await outra.service.registrar('E1', Buffer.from(nfse), { origem: 'UPLOAD', raizEmpresa: '99999999' })).toMatchObject({ resultado: 'IGNORADO', motivo: expect.stringContaining('não cita o CNPJ') });
    expect(outra.linhas).toHaveLength(0);
  });
});

describe('o que vai ao importador de XML', () => {
  type Linha = Record<string, unknown>;
  // Avaliador mínimo do que o filtro usa: OR, AND, NOT, igualdade (campo ausente = null), "in", "notIn" e "not".
  const casa = (l: Linha, w: Linha): boolean => Object.entries(w).every(([k, v]) => {
    if (k === 'OR') return (v as Linha[]).some((x) => casa(l, x));
    if (k === 'AND') return (v as Linha[]).every((x) => casa(l, x));
    if (k === 'NOT') return !casa(l, v as Linha);
    const valor = l[k] === undefined ? null : l[k];
    if (v && typeof v === 'object' && 'in' in (v as object)) return ((v as { in: unknown[] }).in).includes(valor);
    if (v && typeof v === 'object' && 'notIn' in (v as object)) return valor !== null && !((v as { notIn: unknown[] }).notIn).includes(valor);
    if (v && typeof v === 'object' && 'not' in (v as object)) return valor !== (v as { not: unknown }).not;
    return valor === v;
  });
  const doc = (tipo: string, modelo: string | null, extra: Linha = {}): Linha => ({ tipo, modelo, conteudo: 'COMPLETO', ...extra });

  it('NF-e, NFC-e e CT-e com os eventos deles vão; NFS-e, MDF-e e os eventos deles não', () => {
    const vai = (l: Linha) => casa(l, IMPORTAVEL as Linha);
    expect(vai(doc('NFE', '55'))).toBe(true);
    expect(vai(doc('NFE', '65'))).toBe(true);
    expect(vai(doc('CTE', '57'))).toBe(true);
    expect(vai(doc('CTE', '67'))).toBe(true);
    expect(vai(doc('EVENTO', '55'))).toBe(true);
    expect(vai(doc('EVENTO', '65'))).toBe(true);
    expect(vai(doc('EVENTO', '57'))).toBe(true);
    expect(vai(doc('EVENTO', '67'))).toBe(true);
    expect(vai(doc('NFSE', null))).toBe(false);
    expect(vai(doc('EVENTO', null))).toBe(false); // evento da NFS-e: sem modelo
    expect(vai(doc('MDFE', '58'))).toBe(false);
    expect(vai(doc('EVENTO', '58'))).toBe(false); // evento do MDF-e
  });

  function montarImportacao(docs: Linha[]) {
    const wheres: Linha[] = [];
    const takes: (number | undefined)[] = [];
    const prisma = {
      empresa: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, cnpj_cpf: '12.345.678/0001-95', grupo: '001' }) },
      grupo: { findFirst: async () => ({ id: 'G1' }) },
      documentoXml: {
        count: async ({ where }: { where: Linha }) => { wheres.push(where); return docs.filter((d) => casa(d, where)).length; },
        findMany: async ({ where, take }: { where: Linha; take?: number }) => { wheres.push(where); takes.push(take); return docs.filter((d) => casa(d, where)); },
        updateMany: async () => ({ count: 0 }),
        groupBy: async () => [],
        findFirst: async () => null,
      },
    };
    const importacao = { receberLote: vi.fn(async () => ({ lote_id: 'L1', status: 'ok' })) };
    const storage = { getPresignedUrl: vi.fn(async (k: string) => `https://armazenamento/${k}`) };
    const service = new RepositorioXmlService(prisma as never, storage as never, importacao as never);
    return { service, wheres, takes, importacao };
  }
  const pendente = (id: string, tipo: string, modelo: string | null): Linha => ({
    id, empresa_id: 'E1', tipo, modelo, conteudo: 'COMPLETO', storage_key: `k/${id}.xml`, lote_importacao_id: null, nome_original: `${id}.xml`, tamanho_bytes: 10, sha256: id,
  });

  it('o envio sem ids leva só o que o importador lê, e o que sobra não conta como pendente', async () => {
    const t = montarImportacao([pendente('a', 'NFE', '55'), pendente('b', 'NFSE', null), pendente('c', 'MDFE', '58'), pendente('d', 'EVENTO', '57'), pendente('e', 'EVENTO', null)]);
    const numeros = await t.service.resumo('E1');
    expect(numeros.nao_enviados_ao_importador).toBe(2);
    expect(numeros.resumos_e_eventos).toBe(2); // os dois eventos (o do CT-e e o da NFS-e)
    expect(numeros.so_resumo).toBe(0); // nenhum documento está só em resumo
    const r = await t.service.enviarParaImportacao('E1');
    expect(r.arquivos).toBe(2);
    expect(t.importacao.receberLote).toHaveBeenCalledWith(expect.objectContaining({ arquivos: [expect.objectContaining({ nome: 'a.xml' }), expect.objectContaining({ nome: 'd.xml' })] }));
  });

  it('CT-e em que o cliente não é o tomador (e os eventos dele) não vão ao importador, salvo pedido; CT-e sem tomador lido vai', async () => {
    const cte = (id: string, tomador: string | null, chave: string): Linha => ({ ...pendente(id, 'CTE', '57'), tomador_doc: tomador, chave });
    const docs = [
      cte('tomado', '12345678000195', 'K1'),
      cte('outro', '99888777000166', 'K2'),
      { ...pendente('evento-outro', 'EVENTO', '57'), chave: 'K2' },
      cte('sem-leitura', null, 'K3'),
    ];
    const t = montarImportacao(docs);
    expect((await t.service.resumo('E1')).cte_nao_tomados).toBe(1);
    const r = await t.service.enviarParaImportacao('E1');
    expect(r.arquivos).toBe(2);
    const nomes = (t.importacao.receberLote.mock.calls[0] as unknown as [{ arquivos: { nome: string }[] }])[0].arquivos.map((a) => a.nome);
    expect(nomes.sort()).toEqual(['sem-leitura.xml', 'tomado.xml']);
    const todos = montarImportacao(docs);
    expect((await todos.service.enviarParaImportacao('E1', undefined, true)).arquivos).toBe(4);
  });

  it('com ids de NFS-e ou MDF-e, a mensagem explica por que nada vai', async () => {
    const t = montarImportacao([pendente('b', 'NFSE', null), pendente('c', 'MDFE', '58')]);
    await expect(t.service.enviarParaImportacao('E1', ['b', 'c'])).rejects.toThrow(/NFS-e e MDF-e ainda não são lidos/);
    await expect(t.service.enviarParaImportacao('E1')).rejects.toThrow(/Não há XML completo pendente/);
    expect(t.importacao.receberLote).not.toHaveBeenCalled();
  });

  it('o filtro "só os que faltam enviar" também deixa de fora o que o importador não lê', async () => {
    const t = montarImportacao([pendente('a', 'NFE', '55'), pendente('b', 'NFSE', null)]);
    const r = await t.service.listar('E1', { pendentes: true });
    expect(t.wheres.some((w) => (w.AND as Linha[] | undefined)?.includes(IMPORTAVEL as Linha))).toBe(true);
    expect(r.total).toBe(1);
  });

  it('a lista entrega até 500 linhas por pedido (a tela mostra 10, 50, 100, 500 ou todas, e "todas" vem em partes de 500)', async () => {
    const t = montarImportacao([]);
    const casos: [number | undefined, number][] = [[undefined, 50], [0, 50], [10, 10], [100, 100], [500, 500], [9999, 500], [-5, 1]];
    for (const [pedido, esperado] of casos) {
      await t.service.listar('E1', { limit: pedido });
      expect(t.takes.at(-1), `limit ${pedido}`).toBe(esperado);
    }
  });
});

describe('registro: origem do resumo, bytes originais e ZIP', () => {
  it('o resumo da captura substitui o resumo enviado por arquivo (só o da SEFAZ vale para a Ciência), mas o contrário não', async () => {
    const a = montar();
    await a.service.registrar('E1', Buffer.from(resumo), { origem: 'UPLOAD' });
    expect(a.linhas[0].origem).toBe('UPLOAD');
    const r = await a.service.registrar('E1', Buffer.from(resumo), { origem: 'CAPTURA', nsu: '000000000000010' });
    expect(r.resultado).toBe('ATUALIZADO');
    expect(a.linhas).toHaveLength(1);
    expect(a.linhas[0]).toMatchObject({ origem: 'CAPTURA', nsu: '000000000000010', conteudo: 'RESUMO' });
    expect(a.storage.removeObject).toHaveBeenCalledWith(`repositorio/E1/importacao/2026/11/resumo-${CH}.xml`);
    // o resumo de arquivo não desfaz o que a captura já trouxe
    expect((await a.service.registrar('E1', Buffer.from(resumo), { origem: 'UPLOAD' })).resultado).toBe('DUPLICADO');
    expect(a.linhas[0].origem).toBe('CAPTURA');
  });

  it('guarda o arquivo exatamente como chegou: mesmos bytes e mesmo hash, inclusive com BOM e acentos', async () => {
    const { service, linhas, storage } = montar();
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(completo.replace('FORNECEDOR', 'FORNECEDOR AÇÃO'), 'utf8')]);
    await service.registrar('E1', original, { origem: 'UPLOAD' });
    expect((storage.guardar.mock.calls[0] as unknown[])[1]).toBe(original);
    expect(linhas[0].sha256).toBe(createHash('sha256').update(original).digest('hex'));
    expect(linhas[0].tamanho_bytes).toBe(original.length);
    expect(linhas[0].emitente_nome).toBe('FORNECEDOR AÇÃO');
  });

  it('ZIP com um arquivo acima do limite não trava o envio: ele é ignorado com o motivo e os demais entram', async () => {
    const { service, linhas } = montar();
    const zip = Buffer.from(zipSync({ 'pasta/nfe.xml': new Uint8Array(Buffer.from(completo)), 'pasta/gigante.xml': new Uint8Array(Buffer.alloc(3 * 1024 * 1024, 0x20)) }));
    const r = await service.receberArquivos('E1', [{ nome: 'lote.zip', buffer: zip }], 'fulano@fal');
    expect(r).toMatchObject({ novos: 1, xml_lidos: 1 });
    expect(r.ignorados).toEqual([{ nome: 'gigante.xml', motivo: 'maior que 2 MB' }]);
    expect(linhas).toHaveLength(1);
  });

  it('ZIP quebrado é recusado inteiro, com a mensagem de sempre, sem derrubar o resto do envio', async () => {
    const { service, linhas } = montar();
    const r = await service.receberArquivos('E1', [{ nome: 'ruim.zip', buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60, 7)]) }, { nome: 'ok.xml', buffer: Buffer.from(completo) }], 'fulano@fal');
    expect(r.novos).toBe(1);
    expect(r.ignorados).toEqual([{ nome: 'ruim.zip', motivo: 'ZIP inválido ou grande demais (limite de 5.000 arquivos e 200 MB descompactados)' }]);
    expect(linhas).toHaveLength(1);
  });
});
