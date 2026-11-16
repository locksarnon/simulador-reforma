import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/api/client";
import TabelaPadrao from "@/components/TabelaPadrao";
import FiltroMultiplo from "@/components/FiltroMultiplo";
import BotoesDocumento from "@/components/documentos/BotoesDocumento";
import EnvioDocumentos from "@/components/monitoramento/EnvioDocumentos";
import CartaoServico, { documentosDaConsulta, SeloNivel } from "@/components/monitoramento/CartaoServico";
import { NIVEIS, quandoConsultou, SEM_CONSULTA } from "@/lib/monitoramento";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ORIGEM = { MANUAL: "Na tela", ROTINA: "Rotina automática", LOTE: "Atualização em lote" };

/** Nome do documento na coluna: o rótulo do serviço sem o prefixo do sistema ("DCTFWeb: recibo…" → "Recibo…"). */
export const rotuloDoDocumento = (s) => { const r = String(s.rotulo || "").replace(/^[^:]+:\s*/, ""); return r.charAt(0).toUpperCase() + r.slice(1); };

/** Competência a partir dos parâmetros da consulta: AAAAMM → AAAA-MM; AAAA → AAAA; nº de apuração → "Apuração N". */
export function competenciaDaConsulta(parametros = {}) {
  const v = Object.values(parametros || {}).map(String);
  const mes = v.find((x) => /^\d{6}$/.test(x));
  if (mes) return `${mes.slice(0, 4)}-${mes.slice(4)}`;
  const ano = v.find((x) => /^\d{4}$/.test(x));
  if (ano) return ano;
  const id = parametros?.id;
  return id ? `Apuração ${id}` : "";
}
const competenciaTexto = (c) => (/^\d{4}-\d{2}$/.test(c) ? `${MESES[Number(c.slice(5)) - 1]}/${c.slice(0, 4)}` : /^\d{4}$/.test(c) ? `Ano ${c}` : c || "—");

/**
 * Tudo de um assunto numa tabela só (ex.: DCTFWeb, MIT): cada consulta é uma linha, a coluna Documento diz o que é (recibo, declaração,
 * XML, DARF, apuração…), com filtros de várias seleções (Documento, Ano, Situação), Ver e Baixar no fim da linha e ZIP ou e-mail dos
 * marcados. "Nova consulta" abre o cartão do documento escolhido, com os campos dele.
 */
export default function PainelUnificado({ id, titulo, servicos, ultimas = {}, base, desligado, documentosIniciais = [] }) {
  const [documentos, setDocumentos] = useState(documentosIniciais);
  const [anos, setAnos] = useState([]);
  const [situacoes, setSituacoes] = useState([]);
  const [marcadas, setMarcadas] = useState(new Set());
  const [novo, setNovo] = useState("");
  const historicos = useQueries({
    queries: servicos.map((s) => ({ queryKey: ["monitoramento", "historico", base, s.chave], queryFn: () => api.get(`${base}/historico/${s.chave}`) })),
  });
  const carregando = historicos.some((h) => h.isLoading);
  const linhas = servicos.flatMap((s, i) => (historicos[i]?.data || []).map((h) => {
    const docs = documentosDaConsulta(h, s.rotulo).filter((d) => d.formato === "PDF");
    const competencia = competenciaDaConsulta(h.parametros);
    return {
      id: h.id, chave: s.chave, documento: rotuloDoDocumento(s), competencia, ano: (competencia.match(/^\d{4}/) || [""])[0],
      nivel: h.nivel, resultado: h.resumo?.titulo || "", createdAt: h.createdAt, feita_por: h.solicitado_por || "", origem: ORIGEM[h.origem] || h.origem || "", docs,
    };
  }));
  const opcoesDocumento = servicos.map((s) => ({ valor: s.chave, rotulo: rotuloDoDocumento(s) }));
  const opcoesAno = [...new Set(linhas.map((l) => l.ano).filter(Boolean))].sort().reverse().map((a) => ({ valor: a, rotulo: a }));
  const opcoesSituacao = [...Object.entries(NIVEIS).map(([valor, n]) => ({ valor, rotulo: n.rotulo })), { valor: "", rotulo: SEM_CONSULTA.rotulo }];
  const filtradas = linhas.filter((l) => (!documentos.length || documentos.includes(l.chave)) && (!anos.length || anos.includes(l.ano)) && (!situacoes.length || situacoes.includes(l.nivel || "")));
  const colunas = [
    { chave: "documento", rotulo: "Documento", render: (l) => <span className="font-medium">{l.documento}</span> },
    { chave: "competencia", rotulo: "Competência", valor: (l) => l.competencia, render: (l) => competenciaTexto(l.competencia) },
    { chave: "nivel", rotulo: "Situação", valor: (l) => (NIVEIS[l.nivel] || SEM_CONSULTA).rotulo, render: (l) => <SeloNivel nivel={l.nivel} /> },
    { chave: "resultado", rotulo: "Resultado", quebrar: true },
    { chave: "createdAt", rotulo: "Consultado em", tipo: "data", render: (l) => quandoConsultou(l.createdAt) },
    { chave: "feita_por", rotulo: "Feita por" },
    { chave: "origem", rotulo: "Origem" },
  ];
  const marcados = filtradas.filter((l) => marcadas.has(l.id)).flatMap((l) => l.docs.map((d) => ({ item: d.item, nome: d.nome, tamanho: d.tamanho })));
  const servicoNovo = servicos.find((s) => s.chave === novo);
  return (
    <section className="space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
        <label className="flex items-center gap-2"><span className="text-muted-foreground">Nova consulta:</span>
          <select value={novo} onChange={(e) => setNovo(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm" aria-label={`Documento para consultar: ${titulo}`}>
            <option value="">Escolha o documento…</option>
            {servicos.map((s) => <option key={s.chave} value={s.chave}>{rotuloDoDocumento(s)}</option>)}
          </select>
        </label>
        {servicoNovo && <button type="button" onClick={() => setNovo("")} className="text-xs text-primary hover:underline">Fechar</button>}
      </div>
      {servicoNovo && <CartaoServico key={servicoNovo.chave} servico={servicoNovo} ultima={ultimas[servicoNovo.chave]} base={base} desligado={desligado} />}
      <TabelaPadrao
        id={`monit:unificado:${id}`} ariaLabel={titulo} colunas={colunas} linhas={filtradas} ordemInicial={{ chave: "createdAt", dir: -1 }} tamanhoInicial={25}
        vazio={carregando ? "Carregando…" : linhas.length ? "Nada com esses filtros." : "Nenhuma consulta ainda: use Nova consulta."}
        filtrosExtras={(
          <>
            <FiltroMultiplo rotulo="Documento" opcoes={opcoesDocumento} marcados={documentos} mudar={setDocumentos} />
            {opcoesAno.length > 0 && <FiltroMultiplo rotulo="Ano" opcoes={opcoesAno} marcados={anos} mudar={setAnos} />}
            <FiltroMultiplo rotulo="Situação" opcoes={opcoesSituacao} marcados={situacoes} mudar={setSituacoes} />
          </>
        )}
        selecao={base.includes("/empresas/") ? { marcadas, aoMudar: setMarcadas } : undefined}
        acoes={base.includes("/empresas/") ? <EnvioDocumentos base={base} marcados={marcados} aoConcluir={() => setMarcadas(new Set())} /> : null}
        documentos={(l) => (l.docs.length ? (
          <span className="inline-flex items-center gap-2">
            {l.docs.map((d) => <span key={d.id} className="inline-flex items-center gap-1"><span className="text-[11px] text-muted-foreground">{/^Relatório/.test(d.documento) ? "Relatório" : "Oficial"}</span><BotoesDocumento url={d.url} nome={d.nome} ver={d.ver} rotulo={d.documento} /></span>)}
          </span>
        ) : <span className="text-[11px] text-muted-foreground">—</span>)}
      />
    </section>
  );
}
