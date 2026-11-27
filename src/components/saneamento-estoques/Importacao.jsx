import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import CampoArquivo from "@/components/ui/CampoArquivo";
import { semFuncao } from "@/lib/permissoes";
import { ConsultasErp, usePerfilErp } from "@/components/erps/erps";
import { colunasDoExportDoPerfil } from "@/lib/erps";
import { san, chaves, atualizarTudo } from "./api";
import { Aviso, botaoPrimario, botaoSecundario, Carregar, campoCls, secaoCls, Tag, tituloSecaoCls } from "./comuns";
import {
  alternarIncorporar, camposObrigatoriosSemColuna, colunasDoArquivo, corpoIncorporar, corrigirMapeamento, ehReimportacao, fmtDataHora, itensIncorporaveis,
  linhasDeMapeamento, mapeamentoMudou, mensagemDeErro, MODOS_INCORPORAR, quantosIncorporar, resumirRelatorio, ROTULO_CERTEZA, rotuloDoCampo, textoDoValor,
} from "./logica";
import { escalaAplicada, escalaDetectada, exemplosDaColuna, fmtNumero, seloDoMapeamento, textoEscalaAplicada, textoEscalaSaldo } from "./importacaoTela";
import BuscaNaTabela from "@/components/BuscaNaTabela";

const ROTULO_LINHA = { ACEITA: "Aceita", REJEITADA: "Rejeitada", PENDENTE: "Pendente" };

function Numero({ rotulo, valor, tom }) {
  return (
    <div className={`border p-3 ${tom === "erro" ? "border-destructive/50" : tom === "alerta" ? "border-amber-600/50" : "border-border"} bg-card`}>
      <div className="text-2xl font-semibold tabular-nums">{Number(valor || 0).toLocaleString("pt-BR")}</div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
    </div>
  );
}

/** Motivos agrupados (rejeição ou pendência), com até 3 exemplos cada. */
export function MotivosAgrupados({ titulo, grupos }) {
  if (!grupos?.length) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{titulo}</h4>
      <ul className="space-y-1 text-sm">
        {grupos.map((g, n) => (
          <li key={`${n}-${g.texto}`} className="border border-border bg-background p-2">
            <span className="font-medium tabular-nums">{Number(g.quantidade).toLocaleString("pt-BR")}×</span> {g.texto}
            {g.exemplos?.length > 0 && (
              <span className="block text-xs text-muted-foreground">Exemplos: {g.exemplos.map((e) => `linha ${e.linha}${e.codigo ? ` (${e.codigo})` : ""}`).join("; ")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Certeza da sugestão; some quando o consultor troca a coluna. */
function Selo({ selo }) {
  if (selo === "ALTA" || selo === "MEDIA") return <Tag tom={selo === "ALTA" ? "ok" : "alerta"}>{ROTULO_CERTEZA[selo]}</Tag>;
  if (selo === "RECONHECIDA") return <Tag>Reconhecida</Tag>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

/** Saldo que parece exportado sem a vírgula das casas decimais: o consultor escolhe dividir (nada é automático). */
export function EscalaDoSaldo({ relatorio, aoEscolher, carregando }) {
  const e = escalaDetectada(relatorio);
  if (!e) return null;
  const dividido = escalaAplicada(relatorio) > 1;
  return (
    <Aviso tom="alerta" titulo="Saldos muito altos">
      <p>{textoEscalaSaldo(e)}</p>
      <label className="mt-2 flex items-center gap-2 font-medium">
        <input type="checkbox" checked={dividido} disabled={carregando} onChange={() => aoEscolher(dividido ? 1 : Number(e.detectada))} />
        Dividir os saldos por {fmtNumero(e.detectada)}
      </label>
      {carregando && <p className="mt-1 text-xs">Atualizando a prévia…</p>}
    </Aviso>
  );
}

export function Mapeamento({ previa, mapeamento, aoCorrigir, aoAtualizar, carregando }) {
  const colunas = colunasDoArquivo(previa);
  const linhas = linhasDeMapeamento(previa, mapeamento);
  const faltam = camposObrigatoriosSemColuna(mapeamento ?? previa.mapeamento);
  const mudou = mapeamentoMudou(mapeamento ?? previa.mapeamento, previa.mapeamento);
  return (
    <section aria-labelledby="san-imp-map" className={`space-y-2 ${secaoCls}`}>
      <h3 id="san-imp-map" className={tituloSecaoCls}>Colunas do arquivo</h3>
      <p className="text-sm text-muted-foreground">O sistema sugeriu o que cada coluna significa. Confira e corrija o que estiver errado; código e descrição são obrigatórios.</p>
      <BuscaNaTabela />
      <table className="w-full text-sm" aria-label="Mapeamento de colunas">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-1">Campo do sistema</th><th scope="col">Coluna do arquivo</th><th scope="col">Exemplos</th><th scope="col">Certeza</th></tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.campo} className="border-b border-border/60">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal">{l.rotulo}{l.obrigatorio && <span className="text-destructive" aria-label="obrigatório"> *</span>}</th>
              <td className="pr-2">
                {colunas.length ? (
                  <select className={`${campoCls} max-w-xs`} value={l.coluna} aria-label={`Coluna de ${l.rotulo}`} onChange={(e) => aoCorrigir(corrigirMapeamento(mapeamento ?? previa.mapeamento, l.campo, e.target.value))}>
                    <option value="">— sem coluna —</option>
                    {colunas.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input className={`${campoCls} max-w-xs`} value={l.coluna} aria-label={`Coluna de ${l.rotulo}`} onChange={(e) => aoCorrigir(corrigirMapeamento(mapeamento ?? previa.mapeamento, l.campo, e.target.value))} />
                )}
              </td>
              <td className="max-w-[16rem] truncate pr-2 text-xs text-muted-foreground" title={exemplosDaColuna(previa, l.coluna).join(" · ")}>{exemplosDaColuna(previa, l.coluna).join(" · ") || "—"}</td>
              <td><Selo selo={seloDoMapeamento(previa, l.campo, l.coluna)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {faltam.length > 0 && <Aviso tom="alerta">Escolha a coluna de: {faltam.join(", ")}.</Aviso>}
      {mudou && <button type="button" className={botaoSecundario} onClick={aoAtualizar} disabled={carregando || faltam.length > 0}>Atualizar a prévia com este mapeamento</button>}
    </section>
  );
}

function Amostra({ previa }) {
  const linhas = previa.amostra || [];
  if (!linhas.length && !previa.amostraNovos?.length) return null;
  return (
    <section aria-labelledby="san-imp-am" className="space-y-1">
      <h3 id="san-imp-am" className="text-sm font-semibold">{linhas.length ? "As 10 primeiras linhas" : "Primeiros itens novos"}</h3>
      <BuscaNaTabela />
      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full text-xs" aria-label="Amostra da prévia">
          <thead><tr className="bg-muted/50 text-left text-muted-foreground"><th scope="col" className="px-2 py-1">{linhas.length ? "Linha" : "#"}</th><th scope="col">Código</th><th scope="col">Descrição</th>{linhas.length > 0 && <><th scope="col">Situação</th><th scope="col">Observação</th></>}</tr></thead>
          <tbody>
            {linhas.length > 0 ? linhas.map((l) => (
              <tr key={l.linhaOrigem} className="border-t border-border/60">
                <td className="px-2 py-1 tabular-nums">{l.linhaOrigem}</td><td>{l.item?.codigo ?? l.referencia?.codigo}</td><td className="max-w-md truncate">{l.item?.descricao ?? l.referencia?.descricao}</td>
                <td><Tag tom={l.situacao === "ACEITA" ? "ok" : l.situacao === "REJEITADA" ? "alerta" : "info"}>{ROTULO_LINHA[l.situacao] || l.situacao}</Tag></td>
                <td>{(l.ocorrencias || []).map((o) => o.texto).join("; ")}</td>
              </tr>
            )) : previa.amostraNovos.map((i, n) => (
              <tr key={`${i.codigo}-${i.estabelecimento}`} className="border-t border-border/60"><td className="px-2 py-1 tabular-nums">{n + 1}</td><td>{i.codigo}</td><td className="max-w-md truncate">{i.descricao}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Reimportacao({ previa, escolhidos, aoMudar, modo, aoMudarModo, aoPaginar, paginando }) {
  const diferencas = previa.diferencas || [];
  const possiveis = itensIncorporaveis(diferencas);
  const t = previa.totais || {};
  const pag = previa.paginaDiferencas || { pagina: 1, paginas: 1, total: diferencas.length, filtro: "TODAS" };
  return (
    <section aria-labelledby="san-imp-re" className={`space-y-3 ${secaoCls}`}>
      <h3 id="san-imp-re" className={tituloSecaoCls}>Reimportação: o que mudou desde a última importação</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Numero rotulo="Novos" valor={previa.novos} /><Numero rotulo="Alterados" valor={previa.alterados} tom={previa.alterados ? "alerta" : undefined} />
        <Numero rotulo="Com campo protegido" valor={t.alteradosComProtegido} /><Numero rotulo="Inalterados" valor={previa.inalterados} /><Numero rotulo="Ausentes do arquivo" valor={previa.ausentesDoArquivo} />
      </div>
      <p className="text-sm text-muted-foreground">Itens novos entram sozinhos. Itens ausentes do arquivo nunca são removidos. Nas alterações, escolha o que trazer para a base de trabalho: os campos <strong>protegidos</strong> já têm decisão e não são sobrescritos. Os totais valem para o arquivo inteiro.</p>
      {Number(previa.alterados) > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">O que incorporar</legend>
          {Object.entries(MODOS_INCORPORAR).map(([k, rotulo]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="san-imp-modo" value={k} checked={modo === k} onChange={() => aoMudarModo(k)} />{rotulo}</label>
          ))}
          {(modo === "ALTERADOS" || modo === "ALTERADOS_SEM_PROTEGIDO") && <p className="text-xs text-muted-foreground">Vale para todas as diferenças do arquivo, não só para a página abaixo: {quantosIncorporar(previa, modo, escolhidos).toLocaleString("pt-BR")} item(ns).</p>}
        </fieldset>
      )}
      {Number(previa.alterados) > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">Mostrar
            <select className={`${campoCls} w-auto`} value={pag.filtro} disabled={paginando} onChange={(e) => aoPaginar({ pagina: 1, filtro: e.target.value })} aria-label="Filtrar as diferenças">
              <option value="TODAS">todas as diferenças</option><option value="COM_PROTEGIDO">só itens com campo protegido</option><option value="SEM_PROTEGIDO">só itens sem campo protegido</option>
            </select>
          </label>
          <button type="button" className={botaoSecundario} disabled={paginando || pag.pagina <= 1} onClick={() => aoPaginar({ pagina: pag.pagina - 1, filtro: pag.filtro })}>Anterior</button>
          <span className="tabular-nums text-muted-foreground" role="status">Página {pag.pagina} de {pag.paginas} ({Number(pag.total).toLocaleString("pt-BR")} item(ns))</span>
          <button type="button" className={botaoSecundario} disabled={paginando || pag.pagina >= pag.paginas} onClick={() => aoPaginar({ pagina: pag.pagina + 1, filtro: pag.filtro })}>Próxima</button>
        </div>
      )}
      {diferencas.length > 0 && (
        <>
          {modo === "ITENS" && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={botaoSecundario} onClick={() => aoMudar(new Set([...escolhidos, ...possiveis]))}>Marcar os desta página com diferença aplicável</button>
              <button type="button" className={botaoSecundario} onClick={() => aoMudar(new Set())}>Limpar</button>
              <span className="text-sm text-muted-foreground">{escolhidos.size.toLocaleString("pt-BR")} item(ns) marcados (em todas as páginas)</span>
            </div>
          )}
          <BuscaNaTabela />
          <div className="max-h-96 overflow-auto border border-border">
            <table className="w-full text-xs" aria-label="Diferenças por item">
              <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th scope="col" className="w-8 px-2 py-1">Trazer</th><th scope="col">Código</th><th scope="col">Estabelecimento</th><th scope="col">Campos alterados (antes → depois)</th></tr></thead>
              <tbody>
                {diferencas.map((d) => {
                  const aplicavel = d.campos.some((c) => !c.protegido);
                  return (
                    <tr key={d.itemId} className="border-t border-border/60 align-top">
                      <td className="px-2 py-1"><input type="checkbox" disabled={!aplicavel || modo !== "ITENS"} checked={modo === "ITENS" ? escolhidos.has(d.itemId) : modo !== "NENHUM" && (modo === "ALTERADOS" ? aplicavel : !d.campos.some((c) => c.protegido))} onChange={() => aoMudar(alternarIncorporar(escolhidos, d.itemId))} aria-label={`Trazer as diferenças do item ${d.codigo}`} /></td>
                      <td className="py-1 tabular-nums">{d.codigo}</td><td>{d.estabelecimento || "—"}</td>
                      <td className="py-1">
                        <ul className="space-y-0.5">
                          {d.campos.map((c) => (
                            <li key={`${d.itemId}-${c.campo}`}><span className="font-medium">{rotuloDoCampo(c.campo)}:</span> {textoDoValor(c.antes)} → {textoDoValor(c.depois)} {c.protegido && <Tag tom="alerta">Protegido (decisão)</Tag>}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** Reimportação: o separador decimal de uma coluna numérica mudou desde a última importação (os saldos mudam só por isso). Fica perto do botão de confirmar. */
export function AvisosDeSeparador({ relatorio }) {
  const lista = relatorio?.separadorMudou || [];
  if (!lista.length) return null;
  return lista.map((a, n) => <Aviso key={`${n}-${a}`} tom="erro" titulo="Separador decimal mudou">{a}</Aviso>);
}

export function Resultado({ r, aoIrParaDiretrizes }) {
  const rel = resumirRelatorio(r);
  const escala = textoEscalaAplicada(r.escalaSaldo);
  return (
    <section aria-labelledby="san-imp-res" className="space-y-3 border border-emerald-600/50 bg-emerald-600/5 p-4">
      <h3 id="san-imp-res" className="font-semibold">Relatório da importação</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Numero rotulo="Linhas aceitas" valor={rel.aceitas} /><Numero rotulo="Rejeitadas" valor={rel.rejeitadas} tom={rel.rejeitadas ? "erro" : undefined} /><Numero rotulo="Pendentes" valor={rel.pendentes} tom={rel.pendentes ? "alerta" : undefined} />
        <Numero rotulo="Itens novos" valor={r.novos} /><Numero rotulo="Incorporados" valor={r.incorporados} /><Numero rotulo="Alterados no arquivo" valor={r.alterados} />
      </div>
      {(r.totalIgnorados ?? r.ignorados?.length ?? 0) > 0 && <Aviso tom="alerta">{Number(r.totalIgnorados ?? r.ignorados.length).toLocaleString("pt-BR")} campo(s) protegido(s) por decisão foram mantidos como estavam.</Aviso>}
      <MotivosAgrupados titulo="Linhas rejeitadas" grupos={rel.motivosRejeicao} />
      <MotivosAgrupados titulo="Linhas pendentes (aceitas com dado faltando)" grupos={rel.motivosPendencia} />
      {escala && <p className="text-sm">{escala}</p>}
      {rel.avisos.map((a, n) => <Aviso key={`${n}-${a}`} tom="alerta">{a}</Aviso>)}
      {aoIrParaDiretrizes && <button type="button" className={botaoPrimario} onClick={aoIrParaDiretrizes}>Ir para Diretrizes</button>}
    </section>
  );
}

function Historico({ projetoId }) {
  const q = useQuery({ queryKey: chaves.importacoes(projetoId), queryFn: () => san.importacoes(projetoId) });
  return (
    <section aria-labelledby="san-imp-hist" className="space-y-1">
      <h3 id="san-imp-hist" className="text-sm font-semibold">Importações anteriores</h3>
      <Carregar consulta={q} textoErro="Não foi possível carregar as importações." vazio={(d) => (d.length ? null : "Nenhuma importação feita ainda.")}>
        {(lista) => (<>
          <BuscaNaTabela />
          <div className="overflow-x-auto border border-border bg-card">
            <table className="w-full text-xs" aria-label="Importações anteriores">
              <thead><tr className="bg-muted/50 text-left text-muted-foreground"><th scope="col" className="px-2 py-1">Quando</th><th scope="col">Arquivo</th><th scope="col">Usuário</th><th scope="col" className="text-right">Aceitas</th><th scope="col" className="text-right">Rejeitadas</th><th scope="col" className="pr-2 text-right">Pendentes</th></tr></thead>
              <tbody>{lista.map((i) => <tr key={i.id} className="border-t border-border/60"><td className="px-2 py-1">{fmtDataHora(i.createdAt)}</td><td>{i.arquivo}</td><td>{i.usuario}</td><td className="text-right tabular-nums">{i.aceitas}</td><td className="text-right tabular-nums">{i.rejeitadas}</td><td className="pr-2 text-right tabular-nums">{i.pendentes}</td></tr>)}</tbody>
            </table>
          </div>
        </>)}
      </Carregar>
    </section>
  );
}

/** Importação: arquivo → mapeamento → prévia → (reimportação: o que incorporar) → confirmação → relatório. Sem trava: a importação nunca depende das atividades. */
export default function Importacao({ projeto, podeImportar = true, aoIrParaDiretrizes }) {
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState(null);
  const perfilErp = usePerfilErp(projeto.erp_id).data;
  const [previa, setPrevia] = useState(null);
  const [mapeamento, setMapeamento] = useState(null);
  const [escolhidos, setEscolhidos] = useState(() => new Set());
  const [modo, setModo] = useState("ITENS");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [chaveArquivo, setChaveArquivo] = useState(0);

  // `m`: mapeamento corrigido (null = o sugerido); `escala`: divisor do saldo escolhido (1 = como veio).
  const ler = useMutation({
    mutationFn: ({ m, escala = 1 }) => san.previaImportacao(projeto.id, arquivo, m || undefined, escala > 1 ? { escalaSaldo: escala } : undefined),
    onSuccess: (p, { m }) => { setPrevia(p); setMapeamento(m ?? null); setEscolhidos(new Set()); setModo("ITENS"); setResultado(null); setErro(null); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  // Outra página (ou outro filtro) das diferenças: relê o mesmo arquivo com o mesmo mapeamento; as marcações continuam.
  const paginar = useMutation({
    mutationFn: (opcoes) => san.previaImportacao(projeto.id, arquivo, previa.mapeamento, { ...opcoes, ...(escalaAplicada(previa.relatorio) > 1 ? { escalaSaldo: escalaAplicada(previa.relatorio) } : {}) }),
    onSuccess: (p) => { setPrevia(p); setErro(null); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const confirmar = useMutation({
    mutationFn: () => san.importar(projeto.id, arquivo, mapeamento ?? previa.mapeamento, corpoIncorporar(modo, escolhidos), escalaAplicada(previa.relatorio)),
    onSuccess: (r) => { setResultado(r); setPrevia(null); setArquivo(null); setChaveArquivo((k) => k + 1); setErro(null); atualizarTudo(qc, projeto.id); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const efetivo = mapeamento ?? previa?.mapeamento;
  const faltam = previa ? camposObrigatoriosSemColuna(efetivo) : [];
  const rel = previa ? resumirRelatorio(previa.relatorio) : null;
  const mapeamentoPendente = previa && mapeamentoMudou(efetivo, previa.mapeamento);
  const reimport = ehReimportacao(previa);

  return (
    <div className="space-y-5">
      {!podeImportar && <Aviso tom="alerta">{semFuncao("importar")}</Aviso>}
      <section aria-labelledby="san-imp-arq" className={`space-y-2 ${secaoCls}`}>
        <h2 id="san-imp-arq" className={tituloSecaoCls}>1. Arquivo do cadastro de itens</h2>
        <p className="text-sm text-muted-foreground">Planilha (.xlsx) ou CSV exportado do ERP. Códigos e NCM são lidos como texto, preservando os zeros à esquerda. Nada é gravado até você confirmar.</p>
        {colunasDoExportDoPerfil(perfilErp).length > 0 && <p className="text-sm">ERP do projeto: <b>{perfilErp.nome}</b>. As colunas do export dele ({colunasDoExportDoPerfil(perfilErp).map((i) => i.campo_erp).join(", ")}) já chegam mapeadas; confira na prévia.</p>}
        <ConsultasErp perfil={perfilErp} />
        <div className="flex flex-wrap items-center gap-2">
          <CampoArquivo key={chaveArquivo} accept=".xlsx,.xls,.csv" icone={FileSpreadsheet} arquivo={arquivo} rotulo="Arquivo do cadastro de itens" dica="Excel (.xlsx, .xls) ou CSV" className="w-full sm:w-auto sm:min-w-[22rem]"
            aoEscolher={([f]) => { setArquivo(f || null); setPrevia(null); setMapeamento(null); setResultado(null); setErro(null); }} />
          <button type="button" className={botaoPrimario} disabled={!arquivo || ler.isPending || confirmar.isPending} onClick={() => ler.mutate({ m: null })}>{ler.isPending ? "Lendo…" : "Ler e mostrar a prévia"}</button>
        </div>
      </section>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado && <Resultado r={resultado} aoIrParaDiretrizes={aoIrParaDiretrizes} />}

      {previa && (
        <>
          <Mapeamento previa={previa} mapeamento={mapeamento} aoCorrigir={setMapeamento} aoAtualizar={() => ler.mutate({ m: mapeamento, escala: escalaAplicada(previa.relatorio) })} carregando={ler.isPending} />
          <section aria-labelledby="san-imp-prev" className={`space-y-3 ${secaoCls}`}>
            <h2 id="san-imp-prev" className={tituloSecaoCls}>2. Prévia</h2>
            <div className="grid grid-cols-3 gap-2"><Numero rotulo="Linhas aceitas" valor={rel.aceitas} /><Numero rotulo="Rejeitadas" valor={rel.rejeitadas} tom={rel.rejeitadas ? "erro" : undefined} /><Numero rotulo="Pendentes" valor={rel.pendentes} tom={rel.pendentes ? "alerta" : undefined} /></div>
            <MotivosAgrupados titulo="Motivos de rejeição" grupos={rel.motivosRejeicao} />
            <MotivosAgrupados titulo="Pendências (aceitas com dado faltando)" grupos={rel.motivosPendencia} />
            <EscalaDoSaldo relatorio={previa.relatorio} carregando={ler.isPending} aoEscolher={(escala) => ler.mutate({ m: mapeamento ?? previa.mapeamento, escala })} />
            {rel.avisos.map((a, n) => <Aviso key={`${n}-${a}`} tom="alerta">{a}</Aviso>)}
            <Amostra previa={previa} />
          </section>
          {reimport && <Reimportacao previa={previa} escolhidos={escolhidos} aoMudar={setEscolhidos} modo={modo} aoMudarModo={setModo} aoPaginar={(o) => paginar.mutate(o)} paginando={paginar.isPending} />}
          <section aria-labelledby="san-imp-conf" className={`space-y-2 ${secaoCls}`}>
            <h2 id="san-imp-conf" className={tituloSecaoCls}>3. Confirmar</h2>
            {mapeamentoPendente && <Aviso tom="alerta">O mapeamento foi corrigido: atualize a prévia antes de confirmar.</Aviso>}
            <AvisosDeSeparador relatorio={previa.relatorio} />
            <button type="button" className={botaoPrimario} disabled={!podeImportar || confirmar.isPending || paginar.isPending || faltam.length > 0 || mapeamentoPendente || rel.aceitas + rel.pendentes === 0} onClick={() => confirmar.mutate()}>
              {confirmar.isPending ? "Importando…" : reimport ? `Confirmar (${quantosIncorporar(previa, modo, escolhidos).toLocaleString("pt-BR")} item(ns) com diferenças incorporadas)` : "Confirmar importação"}
            </button>
          </section>
        </>
      )}
      <Historico projetoId={projeto.id} />
    </div>
  );
}
