import { describe, expect, it } from 'vitest';
import { comprovanteDosDados, lerCndt, linksDosDados } from './infosimples.service';

describe('comprovante das certidões da Infosimples', () => {
  it('acha o link do comprovante dentro dos dados, PDF primeiro', () => {
    const d = { certidao: 'Certidão Negativa', site_receipt: 'https://storage.infosimples.com/r/abc.html', arquivos: [{ url: 'https://storage.infosimples.com/r/abc.pdf' }], outro: 'http://inseguro' };
    expect(linksDosDados(d)).toEqual(['https://storage.infosimples.com/r/abc.pdf', 'https://storage.infosimples.com/r/abc.html']);
  });

  it('sem arquivo do portal, guarda os dados oficiais em HTML (a certidão não se perde)', () => {
    const l = lerCndt({ conseguiu_emitir_certidao_negativa: true, certidao: 'Certidão Negativa de Débitos Trabalhistas', validade_data: '10/05/2027', certidao_codigo: '123<b>' });
    const c = comprovanteDosDados('tribunal/tst/cndt', '58509112000152', l);
    expect(c.extensao).toBe('html');
    const html = c.buffer.toString('utf8');
    expect(html).toContain('Certidão Negativa de Débitos Trabalhistas');
    expect(html).toContain('10/05/2027');
    expect(html).toContain('123&lt;b&gt;');
  });
});
