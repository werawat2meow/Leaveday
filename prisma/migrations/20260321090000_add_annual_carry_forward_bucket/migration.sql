-- CreateTable
CREATE TABLE "AnnualCarryForwardBucket" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "originYear" INTEGER NOT NULL,
    "remaining" DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualCarryForwardBucket_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AnnualCarryForwardBucket" ADD CONSTRAINT "AnnualCarryForwardBucket_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "AnnualCarryForwardBucket_employeeId_originYear_key" ON "AnnualCarryForwardBucket"("employeeId", "originYear");

-- CreateIndex
CREATE INDEX "AnnualCarryForwardBucket_employeeId_expiresAt_idx" ON "AnnualCarryForwardBucket"("employeeId", "expiresAt");

-- CreateIndex
CREATE INDEX "AnnualCarryForwardBucket_expiresAt_idx" ON "AnnualCarryForwardBucket"("expiresAt");
