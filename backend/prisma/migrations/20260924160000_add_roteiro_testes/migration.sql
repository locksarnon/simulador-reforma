-- CreateTable
CREATE TABLE "RoteiroTesteProgresso" (
    "id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "user_nome" TEXT,
    "estado" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoteiroTesteProgresso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoteiroTesteProgresso_user_email_key" ON "RoteiroTesteProgresso"("user_email");
