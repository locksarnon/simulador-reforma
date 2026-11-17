import { describe, it, expect } from "vitest";
import appFonte from "@/App.jsx?raw";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";
import {
  AREAS, MODULOS, SITUACAO, areaPorId, areasDoMenu, buscarModulos, caminhoDaArea, modulosDaArea, moduloDoCaminho, podeAbrirModulo, todosOsDestinos,
} from "./navegacao";
import { NIVEIS, TELAS, permissoesEfetivas } from "./permissoes";

const admin = { role: "admin" };
const consultor = { role: "user" };

/** O menu lateral de antes da reorganização (11/11/2026): nada disto pode sumir. */
const MENU_ANTIGO = [
  "/", CAMINHO_REPOSITORIO_XML, "/ferramentas/consulta-ncm", "/ferramentas/credito-estoque", "/base-legal", "/agenda-reforma",
  "/ferramentas/radar-reforma", "/ferramentas/noticias", "/comercial/newsletter", "/comercial/leads", "/calculadora", "/cenarios",
  "/transicao", "/catalogos", "/configuracao", "/roteiro-testes", "/manual", "/arquitetura",
];

/** As rotas do App.jsx de antes da reorganização: todas continuam existindo. */
const ROTAS_ANTIGAS = [
  "/login", "/register", "/forgot-password", "/reset-password", "/calculadora", "/simples-hibrido", "/consulta-ncm", "/validador-cadastro",
  "/", "/cockpit", "/workroom/:id", "empresas", "operacoes", "importacao-xml", "importacao-planilha", "empresas/:empresaId", "servicos",
  "historico", "validador-cadastro", "saneamento-estoque", "classificacao-servicos", "validador-nfse", "agenda", "painel", "/cenarios",
  "/transicao", "/catalogos", "/configuracao", "/ferramentas/classificacao", "/ferramentas/calculadora", "/ferramentas/art-11",
  "/base-legal/guia-art-11", "/ferramentas/noticias", "/ferramentas/radar-reforma", "/ferramentas/validador-nfse", "/ferramentas/consulta-ncm",
  "/ferramentas/credito-estoque", "/ferramentas/validador-cadastro", "/comercial/leads", "/comercial/newsletter", "/base-legal",
  "/base-legal/:chave", "/base-legal/:chave/:caminho", "/agenda-reforma", "/workroom/:id/empresas/:empresaId/repositorio-xml",
  "/roteiro-testes", "/manual", "/arquitetura", "*",
];

describe("catálogo de navegação: nada do que existia se perde", () => {
  it("todo item do menu antigo continua no menu, uma vez só", () => {
    const destinos = todosOsDestinos();
    for (const to of MENU_ANTIGO) expect(destinos.filter((d) => d === to), to).toHaveLength(1);
  });

  it("toda rota de antes continua registrada no App.jsx", () => {
    for (const rota of ROTAS_ANTIGAS) {
      const aparece = appFonte.includes(`path="${rota}"`) || appFonte.includes(`path='${rota}'`);
      expect(aparece, `rota ${rota}`).toBe(true);
    }
    // as rotas do BPO usam a constante
    expect(appFonte).toContain("path={CAMINHO_REPOSITORIO_XML}");
    expect(appFonte).toContain("path={`${CAMINHO_REPOSITORIO_XML}/:empresaId`}");
  });

  it("as rotas novas do núcleo estão registradas", () => {
    for (const rota of ["/inicio", "/area/:areaId", "/em-breve/:moduloId"]) expect(appFonte).toContain(`path="${rota}"`);
  });

  it("reúne a Consultoria sem retirar o acesso às rotas de diagnóstico e reforma", () => {
    const menu = areasDoMenu(consultor);
    const consultoria = menu.find((a) => a.titulo === "Consultoria Tributária");
    expect(consultoria?.modulos.map((m) => m.to)).toEqual(["/consultoria/carteira", "/consultoria/projetos", "/consultoria/servicos"]);
    expect(menu.find((a) => a.id === "bpo")?.modulos[0].to).toBe("/bpo/carteira");
    for (const rota of ["/diagnostico", "/diagnostico/carteira", "/diagnostico/projetos/:id", "/reforma/regimes"]) {
      expect(appFonte).toContain(`path="${rota}"`);
    }
  });
});

describe("catálogo de navegação: estrutura", () => {
  it("são 9 áreas, e cada módulo está em uma área que existe", () => {
    expect(AREAS).toHaveLength(9);
    expect(AREAS.map((a) => a.id)).toEqual(["inicio", "clientes", "bpo", "diagnostico", "reforma", "conhecimento", "comercial", "admin", "suporte"]);
    for (const m of MODULOS) expect(areaPorId(m.area), `${m.id}: área ${m.area}`).toBeTruthy();
  });

  it("ids e destinos são únicos", () => {
    const ids = MODULOS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const destinos = todosOsDestinos();
    expect(new Set(destinos).size).toBe(destinos.length);
  });

  it("no máximo 7 módulos por área, e toda área tem pelo menos um", () => {
    for (const a of AREAS) {
      const n = MODULOS.filter((m) => m.area === a.id).length;
      expect(n, a.id).toBeGreaterThan(0);
      expect(n, a.id).toBeLessThanOrEqual(7);
    }
  });

  it("todo módulo tem título, descrição e ícone; módulo em breve diz o que falta", () => {
    for (const m of MODULOS) {
      expect(m.titulo, m.id).toBeTruthy();
      expect(m.descricao, m.id).toBeTruthy();
      expect(["function", "object"], m.id).toContain(typeof m.icone);
      if (m.situacao === SITUACAO.EM_BREVE) expect(m.quando, m.id).toBeTruthy();
    }
  });
});

describe("catálogo de navegação: quem vê o quê", () => {
  it("consultor não vê módulo em breve nem os exclusivos de administrador", () => {
    const ids = areasDoMenu(consultor).flatMap((a) => a.modulos.map((m) => m.id));
    expect(ids).toContain("monitoramento");
    expect(ids).not.toContain("usuarios");
    expect(ids).not.toContain("integracoes");
    expect(ids).toContain("captura-xml");
    // Consultor: todas as telas menos a área Administração.
    expect(ids).not.toContain("configuracao");
    expect(ids.some((id) => MODULOS.find((m) => m.id === id)?.area === "admin")).toBe(false);
  });

  it("administrador vê tudo, inclusive os em breve", () => {
    const ids = areasDoMenu(admin).flatMap((a) => a.modulos.map((m) => m.id));
    expect(ids).toHaveLength(MODULOS.filter((m) => !m.oculto && !areaPorId(m.area)?.oculto).length);
    expect(ids).toContain("usuarios");
    for (const m of MODULOS.filter((x) => x.situacao === SITUACAO.EM_BREVE)) expect(modulosDaArea(m.area, admin)).toContain(m);
  });

  it("notificações e perfil ficam fora do menu, mas a busca acha e a tela sabe a que área pertence", () => {
    const ids = areasDoMenu(admin).flatMap((a) => a.modulos.map((m) => m.id));
    expect(ids).not.toContain("notificacoes");
    expect(ids).not.toContain("perfil");
    expect(buscarModulos("notificacoes", consultor)[0].id).toBe("notificacoes");
    expect(buscarModulos("senha", consultor).map((m) => m.id)).toContain("perfil");
    expect(moduloDoCaminho("/notificacoes")?.area).toBe("inicio");
    expect(moduloDoCaminho("/perfil")?.id).toBe("perfil");
  });
});

describe("catálogo de navegação: a que módulo um caminho pertence", () => {
  it.each([
    ["/", "grupos-empresas"],
    ["/inicio", "inicio"],
    ["/workroom/G1", "carteira-diagnostico"],
    ["/workroom/G1/empresas/E1/saneamento-estoque", "carteira-diagnostico"],
    ["/bpo/repositorio-xml", "captura-xml"],
    ["/bpo/repositorio-xml/E1", "captura-xml"],
    ["/base-legal", "base-legal"],
    ["/base-legal/lc214/art-1", "base-legal"],
    ["/base-legal/guia-art-11", "guia-art-11"],
    ["/ferramentas/radar-reforma", "radar"],
    ["/transicao/", "transicao"],
    ["/em-breve/monitoramento", "monitoramento"],
  ])("%s → %s", (caminho, id) => {
    expect(moduloDoCaminho(caminho)?.id).toBe(id);
  });

  it("caminho que não é de módulo não marca nada", () => {
    expect(moduloDoCaminho("/area/bpo")).toBeNull();
    expect(moduloDoCaminho("/nao-existe")).toBeNull();
  });

  it("a página de cada área fica em /area/<id>, e o Início em /inicio", () => {
    expect(caminhoDaArea("bpo")).toBe("/area/bpo");
    expect(caminhoDaArea("inicio")).toBe("/inicio");
  });
});

describe("busca de módulos", () => {
  it("acha pelo título, por palavra-chave e sem ligar para acento ou maiúscula", () => {
    expect(buscarModulos("xml", consultor)[0].id).toBe("captura-xml");
    expect(buscarModulos("REPOSITORIO", consultor)[0].id).toBe("captura-xml");
    expect(buscarModulos("calendario", consultor)[0].id).toBe("agenda-geral");
    expect(buscarModulos("honorarios", consultor).map((m) => m.id)).toContain("propostas");
  });

  it("o título vence a descrição, e texto vazio não devolve nada", () => {
    expect(buscarModulos("tarefas", consultor)[0].id).toBe("tarefas");
    expect(buscarModulos("   ", consultor)).toEqual([]);
  });

  it("respeita o papel: consultor não encontra o que é de administrador", () => {
    expect(buscarModulos("usuarios", consultor)).toEqual([]);
    expect(buscarModulos("usuarios", admin).map((m) => m.id)).toContain("usuarios");
  });
});

describe("catálogo de navegação: nível, telas e funções", () => {
  const sempreLivres = ["inicio", "notificacoes", "perfil", "manual", "calculadora-publica"];

  it("toda tela das permissões é um módulo do menu, com o mesmo título e área; só Início, Notificações, Perfil, Manual e a calculadora pública ficam fora", () => {
    for (const t of TELAS) {
      const m = MODULOS.find((x) => x.id === t.id);
      expect(m, t.id).toBeTruthy();
      expect(m.titulo, t.id).toBe(t.titulo);
      expect(m.area, t.id).toBe(t.area);
    }
    expect(MODULOS.filter((m) => !TELAS.some((t) => t.id === m.id)).map((m) => m.id).sort()).toEqual([...sempreLivres].sort());
  });

  it("o menu segue o nível: Gestor vê a Administração sem usuários, acessos, integrações e custos", () => {
    const gestor = { role: "user", nivel: "GESTOR" };
    const ids = areasDoMenu(gestor).flatMap((a) => a.modulos.map((m) => m.id));
    for (const id of ["comunicacoes", "configuracao", "parametros-rotinas", "monitoramento"]) expect(ids, id).toContain(id);
    for (const id of ["usuarios", "acessos", "integracoes", "custos"]) expect(ids, id).not.toContain(id);
  });

  it("as exceções e as permissões vindas do servidor mudam o menu, a busca e a abertura da tela", () => {
    const leitura = { role: "user", nivel: "SOMENTE_LEITURA", permissoes: permissoesEfetivas({ role: "user", nivel: "SOMENTE_LEITURA", excecoes: { telas: { monitoramento: false, custos: true } } }) };
    const ids = areasDoMenu(leitura).flatMap((a) => a.modulos.map((m) => m.id));
    expect(ids).not.toContain("monitoramento");
    expect(ids).toContain("custos");
    expect(buscarModulos("monitoramento", leitura).map((m) => m.id)).not.toContain("monitoramento");
    expect(podeAbrirModulo(moduloDoCaminho("/bpo/monitoramento/123"), leitura)).toBe(false);
    expect(podeAbrirModulo(moduloDoCaminho("/inicio"), leitura)).toBe(true);
    expect(podeAbrirModulo(moduloDoCaminho("/manual"), leitura)).toBe(true);
    // Administrador sempre vê tudo, sejam quais forem as exceções.
    expect(podeAbrirModulo(moduloDoCaminho("/admin/usuarios"), { role: "admin", permissoes: { telas: [], funcoes: [] } })).toBe(true);
  });

  it("os cinco níveis sugeridos estão na ordem do mais amplo ao mais restrito", () => {
    expect(NIVEIS.map((n) => n.id)).toEqual(["ADMINISTRADOR", "GESTOR", "CONSULTOR", "ASSISTENTE", "SOMENTE_LEITURA"]);
    for (let i = 1; i < NIVEIS.length; i++) expect(NIVEIS[i].funcoes.length).toBeLessThanOrEqual(NIVEIS[i - 1].funcoes.length);
  });
});
