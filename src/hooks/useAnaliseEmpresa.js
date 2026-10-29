import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
export function useAnaliseEmpresa(servico, restaurar) {
  const { empresaId } = useParams();
  const [params] = useSearchParams();
  const id = params.get('analise');
  const qc = useQueryClient();
  const [mensagem, setMensagem] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!empresaId || !id) return;
    let ativo = true;
    setOcupado(true);
    api.get('/empresas/' + empresaId + '/analises/' + id).then(r => { if (ativo) { if (r.servico !== servico) throw new Error('Análise de outro serviço.'); restaurar(r.dados); } }).catch(e => { if (ativo) setMensagem(e.message); }).finally(() => { if (ativo) setOcupado(false); });
    return () => { ativo = false; };
    // restaurar é uma função de aplicação do estado da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, id, servico]);
  const salvar = async (dados, titulo) => {
    if (!empresaId || ocupado) return;
    setOcupado(true); setMensagem('');
    try { await api.post('/empresas/' + empresaId + '/analises', { servico, titulo, dados }); setMensagem('Análise salva no histórico desta empresa.'); qc.invalidateQueries({ queryKey: ['analises-empresa', empresaId] }); }
    catch(e) { setMensagem('Não foi possível salvar: ' + e.message); }
    finally { setOcupado(false); }
  };
  return { salvar, ocupado, mensagem };
}
