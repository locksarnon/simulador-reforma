-- Nível de acesso e exceções por usuário (telas e funções).
ALTER TABLE "User" ADD COLUMN "nivel" TEXT NOT NULL DEFAULT 'CONSULTOR';
ALTER TABLE "User" ADD COLUMN "permissoes" JSONB;

-- Quem já é administrador fica no nível Administrador.
UPDATE "User" SET "nivel" = 'ADMINISTRADOR' WHERE "role" = 'admin';
