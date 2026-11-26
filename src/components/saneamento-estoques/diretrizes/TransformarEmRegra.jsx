import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { chaves, san } from "../api";
import { Aviso, botaoPrimario, botaoSecundario, campoCls, Rotulo, usePodeAlterar } from "../comuns";
import { SeletorMultiplo } from "./Blocos";
import { ABRANGENCIA_TODOS, ASPECTOS, inicialDoCaso, mensagemDiretriz, ROTULO_ASPECTO } from "./logica";

/**
 * Mensagem depois de transformar: regra do projeto (abrir nas Diretrizes para ver a prévia e aplicar). Destino biblioteca: a regra-modelo
 * fica na biblioteca (sem código de item do cliente) e o projeto ganha a regra em rascunho que parte dela, com as exceções do caso.
 */
export function ResultadoTransformacao({ resultado, destino }) {
  const id = resultado?.id || resultado?.regra?.id;
  const codigo = resultado?.codigo || resultado?.regra?.codigo;
  const abrir = id && <Link className={botaoSecundario} to={`?aba=diretrizes&regra=${encodeURIComponent(id)}`}>Abrir nas Diretrizes</Link>;
  if (destino === "BIBLIOTECA") {
    return (
      <Aviso tom="ok" titulo={`Regra criada na biblioteca e ${codigo || "a regra"} em rascunho neste projeto`.replace("  ", " ")} acao={abrir}>
        A regra-modelo fica em Administração &gt; Configuração e ERPs &gt; Biblioteca de diretrizes, para todos os projetos, sem códigos de item deste cliente (exceções do caso ficam só neste projeto). Neste projeto, a regra nasce em rascunho partindo dela: nada foi reanalisado. Abra a regra para conferir, ver a prévia do impacto e só então aplicar.
      </Aviso>
    );
  }
  return (
    <Aviso tom="ok" titulo={`Regra ${codigo || ""} criada em rascunho`.replace("  ", " ")} acao={id && <Link className={botaoSecundario} to={`?aba=diretrizes&regra=${encodeURIComponent(id)}`}>Abrir nas Diretrizes</Link>}>
      Nada foi reanalisado ainda. Abra a regra para conferir, ver a prévia do impacto e só então aplicar.
    </Aviso>
  );
}

/**
 * "Transformar em regra": a partir da decisão de um caso, cria uma regra (no projeto ou na biblioteca) com aspecto, nome e grupos
 * pré-preenchidos. A decisão isolada nunca muda a regra sozinha; a regra nasce em rascunho e só é aplicada depois da prévia.
 */
export default function TransformarEmRegra({ projeto, caso, abertoInicial = false }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const { pode, razao } = usePodeAlterar();
  const [aberto, setAberto] = useState(abertoInicial);
  const grupos = useQuery({ queryKey: chaves.gruposDoCaso(projeto.id, caso.id), queryFn: () => san.gruposDoCaso(caso.id), enabled: aberto });
  const [form, setForm] = useState(null);
  const f = form || (aberto && grupos.data !== undefined ? inicialDoCaso(caso, grupos.data) : null) || inicialDoCaso(caso, null);
  const set = (parte) => setForm({ ...f, ...parte });
  const gruposDoCaso = [...new Set((grupos.data?.grupos || []).map((g) => g.grupo).filter(Boolean))];
  const opcoesGrupos = [...new Set([...gruposDoCaso, ...f.grupos])];
  const transformar = useMutation({
    mutationFn: () => san.transformarEmRegra(projeto.id, { casoId: caso.id, aspecto: f.aspecto, nome: f.nome.trim(), abrangencia: f.todos ? ABRANGENCIA_TODOS : { todos: false, grupos: f.grupos }, destino: f.destino }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: chaves.diretrizes(projeto.id) }); if (f.destino === "BIBLIOTECA") qc.invalidateQueries({ queryKey: chaves.biblioteca() }); },
  });
  const invalido = !f.nome.trim() ? "Dê um nome à regra." : !f.todos && f.grupos.length === 0 ? "Escolha os grupos ou marque Todos os grupos." : null;

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={botaoSecundario} disabled={!pode} title={razao} onClick={() => setAberto(true)}><Wand2 className="h-4 w-4" aria-hidden="true" />Transformar em regra</button>
        <span className="text-xs text-muted-foreground">Leva esta decisão para as Diretrizes, para valer nos outros itens.</span>
      </div>
    );
  }
  return (
    <section aria-label="Transformar em regra" className="space-y-3 border border-border bg-muted/20 p-3">
      <h4 className="text-sm font-semibold">Transformar em regra</h4>
      <p className="text-xs text-muted-foreground">A regra nasce em rascunho. Nada é reanalisado até você conferir a prévia do impacto e aplicar.</p>
      {transformar.isSuccess ? <ResultadoTransformacao resultado={transformar.data} destino={f.destino} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><Rotulo>Aspecto</Rotulo><select className={campoCls} value={f.aspecto} onChange={(e) => set({ aspecto: e.target.value })}>{ASPECTOS.map((a) => <option key={a} value={a}>{ROTULO_ASPECTO[a]}</option>)}</select></label>
            <label className="block"><Rotulo>Nome da regra</Rotulo><input className={campoCls} maxLength={160} value={f.nome} onChange={(e) => set({ nome: e.target.value })} /></label>
            <div className="space-y-1 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.todos} onChange={(e) => set({ todos: e.target.checked })} />Todos os grupos</label>
              {!f.todos && (opcoesGrupos.length ? <SeletorMultiplo rotulo="Grupos abrangidos" opcoes={opcoesGrupos} marcados={f.grupos} aoMudar={(g) => set({ grupos: g })} alturaMax="max-h-32" />
                : <p className="text-xs text-muted-foreground">{grupos.data === undefined && !grupos.isError ? "Carregando os grupos do caso…" : "Os itens deste caso não têm grupo: use Todos os grupos."}</p>)}
            </div>
            <div role="radiogroup" aria-label="Onde criar a regra" className="space-y-1 sm:col-span-2">
              <Rotulo>Onde criar</Rotulo>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`destino-${caso.id}`} checked={f.destino === "PROJETO"} onChange={() => set({ destino: "PROJETO" })} />Neste projeto (Diretrizes do cliente)</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`destino-${caso.id}`} disabled={!admin} checked={f.destino === "BIBLIOTECA"} onChange={() => set({ destino: "BIBLIOTECA" })} />Na biblioteca (vale como modelo para todos os projetos){!admin && <span className="text-xs text-muted-foreground"> — só o administrador</span>}</label>
            </div>
          </div>
          {transformar.isError && <Aviso tom="erro">{mensagemDiretriz(transformar.error)}</Aviso>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={botaoPrimario} disabled={!pode || !!invalido || transformar.isPending} title={razao || invalido || undefined} onClick={() => transformar.mutate()}>{transformar.isPending ? "Criando…" : "Criar a regra"}</button>
            <button type="button" className={botaoSecundario} onClick={() => { setAberto(false); setForm(null); transformar.reset(); }}>Cancelar</button>
            {invalido && <span className="text-xs text-muted-foreground">{invalido}</span>}
          </div>
        </>
      )}
      {transformar.isSuccess && <button type="button" className={botaoSecundario} onClick={() => { setAberto(false); setForm(null); transformar.reset(); }}>Fechar</button>}
    </section>
  );
}
