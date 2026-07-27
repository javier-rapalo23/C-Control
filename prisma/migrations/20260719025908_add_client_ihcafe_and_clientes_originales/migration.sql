-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "apellidos" TEXT,
ADD COLUMN     "claveIhcafe" TEXT,
ADD COLUMN     "nombres" TEXT;

-- CreateTable
CREATE TABLE "ClienteOriginal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "claveIhcafe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteOriginal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClienteOriginal_clientId_idx" ON "ClienteOriginal"("clientId");

-- AddForeignKey
ALTER TABLE "ClienteOriginal" ADD CONSTRAINT "ClienteOriginal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
