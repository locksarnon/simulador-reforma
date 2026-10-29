import React, { useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PctInput from "@/components/ui/pct-input";
import PageHeader from "@/components/PageHeader";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { BRL, pct } from "@/lib/format";
import {
  CAMPOS_ESSENCIAIS, OPCOES_INICIAIS, colunasRepetidas, faltaIndicar, mapeamentoParaEnvio, opcoesParaEnvio, podeConferir, rotuloDoCampo,
} from "@/lib/planilhaOperacoes";

function ResumoCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-lg font-heading font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CampoColuna({ campo, valor, onChange, cabecalho, exemplos, repetida, obrigatorio, alternativa }) {
  const emUso = valor !== null && valor !== undefined && valor !== "";
  return (
    <div className={`grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 items-start py-2 border-b border-border/50 last:border-0 ${repetida ? "bg-destructive/5 -mx-2 px-2 rounded" : ""}`}>
      <div>
        <p className="text-sm font-medium">
          {campo.rotulo}{obrigatorio && <span className="text-destructive" title="Obrigatório"> *</span>}
        </p>
        <p className="text-xs text-muted-foreground">{campo.ajuda}</p>
        {alternativa && !emUso && <p className="text-xs text-muted-foreground mt-0.5">Sem coluna, use {alternativa} (nas opções abaixo).</p>}
      </div>
      <Select value={emUso ? String(valor) : "nenhuma"} onValueChange={(v) => onChange(v === "nenhuma" ? null : Number(v))}>
        <SelectTrigger className={repetida ? "border-destructive" : ""}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nenhuma">— não usar —</SelectItem>
          {cabecalho.map((h, i) => (
            <SelectItem key={i} value={String(i)}>
              {h || `Coluna ${i + 1}`}{exemplos[i] ? ` (ex.: ${String(exemplos[i]).slice(0, 28)})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ImportacaoPlanilhaPage() {
  const { id } = useParams();
  // Dentro do workspace de uma empresa, o arquivo inteiro é dela; no grupo, a planilha pode trazer a empresa em cada linha.
  const { grupo: grupoCtx, empresa: empresaTravada } = useOutletContext() || {};
  const qc = useQueryClient();
  const { data: grupo } = useQuery({
    queryKey: ["grupo", id], queryFn: () => api.entities.Grupo.get(id), enabled: !!id && !grupoCtx,
  });
  const grupoNumero = grupoCtx?.numero || grupo?.numero;
  const grupoNome = grupoCtx?.nome || grupo?.nome;
  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas", grupoNumero], queryFn: () => api.entities.Empresa.filter({ grupo: grupoNumero }), enabled: !!grupoNumero,
  });

  const entrada = useRef(null);
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [mapa, setMapa] = useState({});
  const [opcoes, setOpcoes] = useState(OPCOES_INICIAIS);
  const [conferencia, setConferencia] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [ocupado, setOcupado] = useState(null); // "lendo" | "conferindo" | "importando"
  const [erro, setErro] = useState("");

  const empresaFixa = empresaTravada?.id_empresa || "";
  const opcoesAtuais = { ...opcoes, empresaPadrao: empresaFixa || opcoes.empresaPadrao };
  const repetidas = new Set(colunasRepetidas(mapa));
  const faltam = faltaIndicar(mapa, opcoesAtuais);
  const pronto = podeConferir(mapa, opcoesAtuais);

  const mudou = () => { setConferencia(null); setResultado(null); };
  const definirColuna = (campoId, indice) => { setMapa((m) => ({ ...m, [campoId]: indice })); mudou(); };
  const definirOpcao = (chave, valor) => { setOpcoes((o) => ({ ...o, [chave]: valor })); mudou(); };

  async function escolherArquivo(file) {
    if (!file) return;
    setErro(""); mudou(); setOcupado("lendo");
    try {
      const p = await api.upload("/operacoes-planilha/ler", file);
      setArquivo(file); setPrevia(p);
      const sugerido = { ...p.mapeamentoSugerido };
      if (empresaFixa) sugerido.empresa = null;
      setMapa(sugerido);
    } catch (e) {
      setArquivo(null); setPrevia(null);
      setErro(e.message || "Não consegui ler o arquivo.");
    } finally {
      setOcupado(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  // O grupo da tela limita as empresas que o servidor aceita na importação.
  const campos = () => ({ mapeamento: mapeamentoParaEnvio(mapa), opcoes: opcoesParaEnvio({ ...opcoesAtuais, grupoId: id }) });

  async function conferir() {
    setErro(""); setResultado(null); setOcupado("conferindo");
    try {
      setConferencia(await api.upload("/operacoes-planilha/validar", arquivo, campos()));
    } catch (e) {
      setConferencia(null);
      setErro(e.message || "Não consegui conferir a planilha.");
    } finally { setOcupado(null); }
  }

  async function importar() {
    setErro(""); setOcupado("importando");
    try {
      const r = await api.upload("/operacoes-planilha/importar", arquivo, campos());
      setResultado(r); setConferencia(null);
      qc.invalidateQueries();
      toast({ title: "Planilha importada", description: `${r.importadas} operação(ões) criada(s).` });
    } catch (e) {
      setErro(e.message || "Não consegui importar a planilha.");
    } finally { setOcupado(null); }
  }

  async function baixarModelo() {
    try { await api.baixar("GET", "/operacoes-planilha/modelo", { nome: "modelo-operacoes-intax.xlsx" }); } catch (e) { setErro(e.message || "Não consegui baixar o modelo."); }
  }

  const camposDaPrevia = previa?.campos || [];
  const essenciais = CAMPOS_ESSENCIAIS.filter((c) => !(empresaFixa && c.id === "empresa"));
  const outros = camposDaPrevia.filter((c) => !CAMPOS_ESSENCIAIS.some((e) => e.id === c.id) && !(empresaFixa && c.id === "empresa"));
  const linhaDe = (c, obrigatorio, alternativa) => (
    <CampoColuna
      key={c.id} campo={c} valor={mapa[c.id]} onChange={(i) => definirColuna(c.id, i)} cabecalho={previa.cabecalho} exemplos={previa.exemplos}
      repetida={mapa[c.id] != null && repetidas.has(Number(mapa[c.id]))} obrigatorio={obrigatorio} alternativa={alternativa}
    />
  );
  const destinoOperacoes = empresaFixa ? `/workroom/${id}/empresas/${empresaTravada.id}/operacoes` : `/workroom/${id}/operacoes`;
  const ocupadoTexto = { lendo: "Lendo a planilha…", conferindo: "Conferindo as linhas…", importando: "Importando…" }[ocupado];

  return (
    <div>
      {!empresaTravada && (
        <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: grupoNome || "Grupo", to: `/workroom/${id}` }, { label: "Importar planilha" }]} />
      )}
      <div className="px-6 lg:px-8 py-6 pb-12">
        <div className="space-y-5 max-w-5xl">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-heading font-semibold text-base mb-1">
                Importar operações por planilha {empresaTravada ? `· ${empresaTravada.id_empresa}` : ""}
              </h2>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Para quem não tem o XML (MDF-e e NFS-e, que o importador de XML não lê, lançamentos de um sistema de gestão, uma simulação de 2027): envie uma planilha .xlsx ou .csv com uma linha por operação.
                Você indica qual coluna é cada campo, confere o resultado e só então importa. Enviar a mesma planilha de novo não duplica: a linha igual à já importada é ignorada, e a que você corrigiu (valor, data, descrição, documento, CFOP, NCM/NBS, UF ou quantidade) entra como nova, então apague a antiga em Operações. Percentual ou classificação corrigidos numa linha já importada não alteram a operação gravada (a conferência avisa): edite a operação ou apague e importe de novo.
                {empresaFixa && <> Planilha com várias empresas? <Link className="underline" to={`/workroom/${id}/importacao-planilha`}>Importe pelo grupo</Link>, com a coluna Empresa.</>}
              </p>
            </div>
            <Button variant="outline" onClick={baixarModelo} className="gap-2"><Download className="w-4 h-4" /> Baixar modelo (.xlsx)</Button>
          </div>

          {/* 1. Arquivo */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-heading font-medium text-sm mb-2">1. Escolha a planilha</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <input ref={entrada} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
              <Button onClick={() => entrada.current?.click()} disabled={!!ocupado} className="gap-2">
                {ocupado === "lendo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {arquivo ? "Trocar a planilha" : "Escolher .xlsx ou .csv"}
              </Button>
              {arquivo && previa && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" /> {arquivo.name} · {previa.total.toLocaleString("pt-BR")} linha(s) · {previa.cabecalho.length} coluna(s)
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Até 50 mil linhas por envio. A primeira linha deve ser o cabeçalho. Excel antigo (.xls) não é aceito: salve como .xlsx.</p>
          </section>

          {erro && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {previa && (
            <>
              {/* 2. Colunas */}
              <section className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-heading font-medium text-sm mb-1">2. Qual coluna é cada campo?</h3>
                <p className="text-xs text-muted-foreground mb-2">O InTAX já sugeriu pelo nome das colunas. Confira os obrigatórios (*) e ajuste o que estiver errado.</p>
                <div>
                  {essenciais.map((c) => {
                    const def = camposDaPrevia.find((x) => x.id === c.id);
                    return def ? linhaDe(def, true, c.textoAlternativa) : null;
                  })}
                </div>
                {repetidas.size > 0 && (
                  <p className="mt-2 text-xs text-destructive" role="alert">A mesma coluna da planilha está em mais de um campo. Deixe cada coluna em um só campo.</p>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">Outros campos (tributos, classificação, crédito presumido, combustível...)</summary>
                  <div className="mt-2">{outros.map((c) => linhaDe(c, false))}</div>
                </details>
              </section>

              {/* 3. Opções */}
              <section className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-heading font-medium text-sm mb-3">3. Opções da importação</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Empresa de todas as linhas</Label>
                    {empresaFixa ? (
                      <p className="mt-1 text-sm">{empresaTravada.id_empresa} — {empresaTravada.razao_social} <span className="text-xs text-muted-foreground">(a planilha toda é desta empresa)</span></p>
                    ) : (
                      <Select value={opcoes.empresaPadrao || "coluna"} onValueChange={(v) => definirOpcao("empresaPadrao", v === "coluna" ? "" : v)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="coluna">Usar a coluna Empresa da planilha</SelectItem>
                          {empresas.map((e) => <SelectItem key={e.id} value={e.id_empresa}>{e.id_empresa} — {e.razao_social}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {!empresaFixa && opcoes.empresaPadrao && (
                      <p className="mt-1 text-[11px] text-muted-foreground">Com uma empresa escolhida, a coluna Empresa da planilha não é lida (numa planilha de vendas ela costuma ser o CNPJ do cliente).</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Entrada ou Saída de todas as linhas</Label>
                    <Select value={opcoes.direcaoPadrao || "coluna"} onValueChange={(v) => definirOpcao("direcaoPadrao", v === "coluna" ? "" : v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="coluna">Usar a coluna Entrada/Saída da planilha</SelectItem>
                        <SelectItem value="Saida">Saída (vendas, receitas, serviços prestados)</SelectItem>
                        <SelectItem value="Entrada">Entrada (compras, custos, despesas)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tipo, quando a planilha não diz (e não há NBS)</Label>
                    <Select value={opcoes.tipoPadrao} onValueChange={(v) => definirOpcao("tipoPadrao", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mercadoria">Mercadoria</SelectItem>
                        <SelectItem value="Servico">Serviço</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Como os percentuais estão escritos</Label>
                    <Select value={opcoes.unidadePct} onValueChange={(v) => definirOpcao("unidadePct", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pontos">Em pontos percentuais (18 é 18%)</SelectItem>
                        <SelectItem value="fracao">Em fração (0,18 é 18%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Crédito elegível das compras, quando a planilha não traz a coluna</Label>
                    <PctInput className="mt-1" value={opcoes.creditoElegivelCompras} onChange={(v) => definirOpcao("creditoElegivelCompras", v)} />
                    <p className="text-xs text-muted-foreground mt-1">Só vale para Entrada. 100% é a regra geral do crédito de IBS/CBS (LC 214, art. 47), mas a mesma porcentagem também vale para o crédito do sistema atual. Em dúvida, informe a coluna por compra.</p>
                  </div>
                  <label className="flex items-start gap-2 text-sm cursor-pointer md:col-span-2">
                    <input type="checkbox" className="mt-1" checked={opcoes.preencherTributos} onChange={(e) => definirOpcao("preencherTributos", e.target.checked)} />
                    <span>
                      Preencher PIS, Cofins e ICMS interestadual pela tabela da legislação quando a planilha não traz
                      <span className="block text-xs text-muted-foreground">PIS/Cofins pelo regime da empresa, só nas vendas (Real 1,65% e 7,6%; Presumido 0,65% e 3%; Simples e produtor rural PF zero; o PIS/Cofins de uma compra é o do fornecedor, então a compra entra sem eles se a planilha não os trouxer) e ICMS de 12% ou 7% quando a UF de origem e a de destino são diferentes (Resolução do Senado 22/1989). O ICMS interno e o ISS você informa.</span>
                    </span>
                  </label>
                </div>
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <Button onClick={conferir} disabled={!pronto || !!ocupado} className="gap-2">
                    {ocupado === "conferindo" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Conferir a planilha
                  </Button>
                  {!pronto && repetidas.size === 0 && (
                    <p className="text-xs text-muted-foreground">Falta indicar: {faltam.map((f) => rotuloDoCampo(camposDaPrevia, f)).join(", ")}.</p>
                  )}
                  {ocupadoTexto && <span className="text-sm text-muted-foreground">{ocupadoTexto}</span>}
                </div>
              </section>
            </>
          )}

          {/* 4. Conferência */}
          {conferencia && (
            <section className="rounded-lg border border-border bg-card p-4 space-y-4">
              <h3 className="font-heading font-medium text-sm">4. Conferência</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ResumoCard label="Operações novas" value={conferencia.novas.toLocaleString("pt-BR")} icon={CheckCircle2} color="text-emerald-500" />
                <ResumoCard label="Com erro (ficam de fora)" value={conferencia.comErro.toLocaleString("pt-BR")} icon={AlertTriangle} color="text-red-500" />
                <ResumoCard label="Já importadas" value={conferencia.duplicadas.toLocaleString("pt-BR")} icon={Info} color="text-blue-500" />
                <ResumoCard label="Novas com aviso" value={conferencia.comAviso.toLocaleString("pt-BR")} icon={AlertTriangle} color="text-amber-500" />
              </div>
              {Object.keys(conferencia.porAno || {}).length > 0 && (
                <p className="text-xs text-muted-foreground">Por ano: {Object.entries(conferencia.porAno).map(([a, n]) => `${a}: ${n}`).join(" · ")}</p>
              )}
              {Object.keys(conferencia.padroes || {}).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Preenchido pela tabela da legislação: {Object.entries(conferencia.padroes).map(([k, n]) => `${k} em ${n} linha(s)`).join(" · ")}. Confira na operação o que for diferente do real.
                </p>
              )}
              {(conferencia.alertas || []).map((a) => (
                <p key={a} className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2.5" role="status">{a}</p>
              ))}

              {conferencia.amostraErros?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Linhas com erro {conferencia.comErro > conferencia.amostraErros.length ? `(as primeiras ${conferencia.amostraErros.length} de ${conferencia.comErro})` : ""}</p>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-left"><tr><th className="p-2 w-16">Linha</th><th className="p-2">O que corrigir</th></tr></thead>
                      <tbody>
                        {conferencia.amostraErros.map((l) => (
                          <tr key={l.linha} className="border-t border-border"><td className="p-2 tabular-nums">{l.linha}</td><td className="p-2">{l.erros.join(" ")}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {conferencia.amostraValidas?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Como as primeiras linhas válidas foram lidas</p>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-left">
                        <tr>
                          <th className="p-2">Linha</th><th className="p-2">Empresa</th><th className="p-2">Data</th><th className="p-2">Direção</th><th className="p-2">Tipo</th>
                          <th className="p-2 text-right">Valor</th><th className="p-2 text-right">ICMS</th><th className="p-2 text-right">PIS</th><th className="p-2 text-right">Cofins</th><th className="p-2 text-right">Crédito</th><th className="p-2">Avisos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conferencia.amostraValidas.map((l) => (
                          <tr key={l.linha} className="border-t border-border align-top">
                            <td className="p-2 tabular-nums">{l.linha}</td><td className="p-2">{l.previa.empresa}</td><td className="p-2">{l.previa.data}</td>
                            <td className="p-2">{l.previa.direcao === "Saida" ? "Saída" : l.previa.direcao}</td><td className="p-2">{l.previa.tipo}</td>
                            <td className="p-2 text-right tabular-nums">{BRL(l.previa.valor ?? 0)}</td>
                            <td className="p-2 text-right tabular-nums">{l.previa.icms == null ? "—" : pct(l.previa.icms)}</td>
                            <td className="p-2 text-right tabular-nums">{l.previa.pis == null ? "—" : pct(l.previa.pis)}</td>
                            <td className="p-2 text-right tabular-nums">{l.previa.cofins == null ? "—" : pct(l.previa.cofins)}</td>
                            <td className="p-2 text-right tabular-nums">{l.previa.credito == null ? "—" : pct(l.previa.credito)}</td>
                            <td className="p-2 text-muted-foreground">{l.duplicada ? "Já importada. " : ""}{l.avisos.join(" ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={importar} disabled={conferencia.novas === 0 || !!ocupado} className="gap-2">
                  {ocupado === "importando" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Importar {conferencia.novas.toLocaleString("pt-BR")} operação(ões)
                </Button>
                {conferencia.comErro > 0 && <p className="text-xs text-muted-foreground">As {conferencia.comErro.toLocaleString("pt-BR")} linha(s) com erro não serão importadas. Corrija na planilha e envie de novo: as linhas iguais às já importadas são ignoradas e só as corrigidas entram.</p>}
              </div>
            </section>
          )}

          {/* 5. Resultado */}
          {resultado && (
            <section className="rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-2" role="status">
              <p className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {resultado.importadas.toLocaleString("pt-BR")} operação(ões) importada(s).</p>
              <p className="text-xs text-muted-foreground">
                {resultado.jaExistiam > 0 && `${resultado.jaExistiam} já existiam e foram mantidas${resultado.jaExistiamPorXml > 0 ? ` (${resultado.jaExistiamPorXml} são notas que já entraram pelo XML)` : ""}. `}
                {resultado.comErro > 0 && `${resultado.comErro} linha(s) com erro ficaram de fora. `}
              </p>
              <p className="text-xs text-muted-foreground">
                Importou com a coluna errada? Apague as operações importadas em Operações (cada uma traz “Importado da planilha” e o código do arquivo na observação) e envie de novo.
              </p>
              {(resultado.alertas || []).map((a) => <p key={a} className="text-xs text-amber-800 dark:text-amber-300">{a}</p>)}
              <Button asChild variant="outline" size="sm"><Link to={destinoOperacoes}>Ver as operações</Link></Button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
