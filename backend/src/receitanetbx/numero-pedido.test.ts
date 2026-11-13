import { describe, expect, it } from 'vitest';
import { numeroDoPedido } from './sped-download.service';

describe('número do pedido no ReceitanetBX', () => {
  it('lê a resposta real do SolicitarArquivos (retornopedido) e a mensagem', () => {
    const saida = '<?xml version="1.0" encoding="utf-8"?><retornopedido id="84679558"><mensagem>O pedido número 84679558 foi registrado com sucesso.</mensagem></retornopedido>';
    expect(numeroDoPedido(saida)).toBe('84679558');
    expect(numeroDoPedido('<pedidos><pedido id="123" situacao="disponivel"/></pedidos>')).toBe('123');
    expect(numeroDoPedido('', 'O pedido número 84662660 foi registrado com sucesso.')).toBe('84662660');
    expect(numeroDoPedido('<erro/>', 'Certificado sem procuração.')).toBeNull();
  });
});
