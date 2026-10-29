-- Modelagem do que faltava na Reforma (LC 214/2025). Só acrescenta colunas com valor padrão e uma tabela nova;
-- nenhuma linha existente é alterada.
--
-- 1) Redutor das compras governamentais (arts. 349, III, 370 e 472): fração por ano, 0 = sem redutor cadastrado.
ALTER TABLE "TransicaoAno" ADD COLUMN "redutor_compra_gov" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 2) Imposto Seletivo informado na operação (arts. 409 a 438) e combustível do regime específico (arts. 172 a 180).
ALTER TABLE "Operacao" ADD COLUMN "is_pct" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN "combustivel_produto" TEXT;

-- 3) Alíquotas específicas (por unidade) dos combustíveis, uma linha por produto e ano.
CREATE TABLE "AliquotaCombustivel" (
    "id" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "cbs_por_unidade" DOUBLE PRECISION,
    "ibs_por_unidade" DOUBLE PRECISION,
    "fonte" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Oficial',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AliquotaCombustivel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AliquotaCombustivel_produto_ano_key" ON "AliquotaCombustivel"("produto", "ano");
CREATE INDEX "AliquotaCombustivel_ano_idx" ON "AliquotaCombustivel"("ano");

-- Carga inicial: CBS de 2027, Anexo da Portaria MF nº 3.074, de 9/10/2026 (DOU 192-B, seção 1 extra B, p. 2),
-- editada com base no Decreto nº 13.133/2026 e na Portaria Conjunta MF/CGIBS nº 14/2026. O IBS por unidade
-- (a partir de 2029) será divulgado pelo Comitê Gestor e fica em branco até lá.
INSERT INTO "AliquotaCombustivel" ("id", "produto", "descricao", "unidade", "ano", "cbs_por_unidade", "ibs_por_unidade", "fonte", "status", "observacao") VALUES
  ('comb_gasolina_2027', 'gasolina', 'Gasolina e suas correntes', 'litro', 2027, 0.7925, NULL, 'Portaria MF nº 3.074/2026, Anexo, item I (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Base de cálculo: volume convertido a 20 °C. IBS por litro ainda não divulgado pelo CGIBS.'),
  ('comb_eac_2027', 'eac', 'Etanol anidro combustível (EAC)', 'litro', 2027, 0.1922, NULL, 'Portaria MF nº 3.074/2026, Anexo, item II (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Base de cálculo: volume convertido a 20 °C. IBS por litro ainda não divulgado pelo CGIBS.'),
  ('comb_diesel_2027', 'diesel', 'Óleo diesel e suas correntes', 'litro', 2027, 0.3515, NULL, 'Portaria MF nº 3.074/2026, Anexo, item III (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Base de cálculo: volume convertido a 20 °C. IBS por litro ainda não divulgado pelo CGIBS.'),
  ('comb_b100_2027', 'b100', 'Biodiesel (B100), exceto matéria-prima da agricultura familiar', 'litro', 2027, 0.1480, NULL, 'Portaria MF nº 3.074/2026, Anexo, item IV (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Base de cálculo: volume convertido a 20 °C. O B100 com matéria-prima da agricultura familiar pode ter alíquota menor por ato do Executivo (LC 214, art. 175, §6º). IBS por litro ainda não divulgado pelo CGIBS.'),
  ('comb_glp_2027', 'glp', 'GLP (inclusive GLGN), exceto uso doméstico em recipientes de até 13 kg', 'kg', 2027, 0.1677, NULL, 'Portaria MF nº 3.074/2026, Anexo, item V (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Unidade: quilograma. IBS por quilograma ainda não divulgado pelo CGIBS.'),
  ('comb_ehc_2027', 'ehc', 'Etanol hidratado combustível (EHC)', 'litro', 2027, 0.1922, NULL, 'Portaria MF nº 3.074/2026, Anexo, item VI (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Base de cálculo: volume convertido a 20 °C. IBS por litro ainda não divulgado pelo CGIBS.'),
  ('comb_qav_2027', 'qav', 'Querosene de aviação (QAV)', 'litro', 2027, 0.0712, NULL, 'Portaria MF nº 3.074/2026, Anexo, item VII (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Base de cálculo: volume convertido a 20 °C. IBS por litro ainda não divulgado pelo CGIBS.'),
  ('comb_oleo_combustivel_2027', 'oleo_combustivel', 'Óleo combustível', 'kg', 2027, 0.3403, NULL, 'Portaria MF nº 3.074/2026, Anexo, item VIII (DOU 09/10/2026)', 'Oficial', 'Efeitos a partir de 08/01/2027. Unidade: quilograma. IBS por quilograma ainda não divulgado pelo CGIBS.')
ON CONFLICT ("produto", "ano") DO NOTHING;
