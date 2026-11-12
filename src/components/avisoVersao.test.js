import { describe, expect, it } from "vitest";
import { scriptPublicado } from "./AvisoVersaoNova";

describe("aviso de versão nova", () => {
  it("acha o arquivo principal anunciado no index publicado", () => {
    expect(scriptPublicado('<script type="module" crossorigin src="/assets/index-CTIQS8Ed.js"></script>')).toBe("/assets/index-CTIQS8Ed.js");
    expect(scriptPublicado("<html></html>")).toBeNull();
  });
});
