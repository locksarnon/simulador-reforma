-- Anexo XII da LC 214/2025 (dispositivos médicos, alíquota zero): códigos que a lei EXCLUI do item e que estavam como inclusão.
--   Item 1.3: "Aparelhos de eletrodiagnóstico, exceto os produtos classificados nos códigos 9018.11.00, 9018.12.10, 9018.12.90,
--             9018.13.00, 9018.14.10, 9018.14.20, 9018.14.90, 9018.19.10 e 9018.19.20" (só 9018.19.80 fica no item).
--             9018.11.00, 9018.12.x e 9018.13.00 continuam amparados por outros itens do anexo; 9018.14.x e 9018.19.10/20 não têm item.
--   Item 11:  "...exceto os produtos classificados nos códigos 9022.21.10 e 9022.21.20" (só 9022.21.90 fica no item).
UPDATE "CorrelacaoNcm" SET "excecao" = true, "fonte" = 'LC 214/2025 — corrigido em 18/11/2026 (código excluído pelo texto do item)', "updatedAt" = now()
 WHERE "anexo" = 'XII' AND "c_class_trib" = '200004' AND (
       ("item_lei" = 1  AND "ncm" IN ('9018.14.10', '9018.14.20', '9018.14.90', '9018.19.10', '9018.19.20'))
    OR ("item_lei" = 11 AND "ncm" IN ('9022.21.10', '9022.21.20')));

-- Anexo XV, item 2: a lei cita "07.02.00.00" (um código de 8 dígitos); o InTAX tinha o prefixo 07.02.00.
UPDATE "CorrelacaoNcm" SET "ncm" = '0702.00.00', "updatedAt" = now() WHERE "anexo" = 'XV' AND "item_lei" = 2 AND "ncm" = '07.02.00';
