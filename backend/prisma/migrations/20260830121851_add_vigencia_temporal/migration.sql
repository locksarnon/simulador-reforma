/*
  Warnings:

  - The `fim_ibs` column on the `CredPres` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `fim_cbs` column on the `CredPres` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ClassTrib" ADD COLUMN     "vigencia_fim" TIMESTAMP(3),
ADD COLUMN     "vigencia_inicio" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CredPres" DROP COLUMN "fim_ibs",
ADD COLUMN     "fim_ibs" TIMESTAMP(3),
DROP COLUMN "fim_cbs",
ADD COLUMN     "fim_cbs" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CstIbsCbs" ADD COLUMN     "vigencia_fim" TIMESTAMP(3),
ADD COLUMN     "vigencia_inicio" TIMESTAMP(3);
