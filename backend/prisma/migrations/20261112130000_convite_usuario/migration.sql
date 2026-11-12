-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "enviadoPor" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'RESET';
