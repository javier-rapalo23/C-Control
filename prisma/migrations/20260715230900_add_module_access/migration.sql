-- CreateTable
CREATE TABLE "ModuleAccess" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "roles" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleAccess_moduleKey_key" ON "ModuleAccess"("moduleKey");
