-- CreateEnum
CREATE TYPE "BlackoutTargetType" AS ENUM ('ORG', 'DEPARTMENT', 'DIVISION', 'UNIT');

-- CreateTable
CREATE TABLE "LeaveBlackout" (
    "id" SERIAL NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allKinds" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBlackout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBlackoutTarget" (
    "id" SERIAL NOT NULL,
    "blackoutId" INTEGER NOT NULL,
    "targetType" "BlackoutTargetType" NOT NULL,
    "targetId" INTEGER NOT NULL,

    CONSTRAINT "LeaveBlackoutTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBlackoutKind" (
    "id" SERIAL NOT NULL,
    "blackoutId" INTEGER NOT NULL,
    "kind" "LeaveKind" NOT NULL,

    CONSTRAINT "LeaveBlackoutKind_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveBlackout_active_startDate_endDate_idx" ON "LeaveBlackout"("active", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_blackout_target" ON "LeaveBlackoutTarget"("blackoutId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "LeaveBlackoutTarget_blackoutId_idx" ON "LeaveBlackoutTarget"("blackoutId");

-- CreateIndex
CREATE INDEX "LeaveBlackoutTarget_targetType_targetId_idx" ON "LeaveBlackoutTarget"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_blackout_kind" ON "LeaveBlackoutKind"("blackoutId", "kind");

-- CreateIndex
CREATE INDEX "LeaveBlackoutKind_blackoutId_idx" ON "LeaveBlackoutKind"("blackoutId");

-- AddForeignKey
ALTER TABLE "LeaveBlackoutTarget" ADD CONSTRAINT "LeaveBlackoutTarget_blackoutId_fkey" FOREIGN KEY ("blackoutId") REFERENCES "LeaveBlackout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBlackoutKind" ADD CONSTRAINT "LeaveBlackoutKind_blackoutId_fkey" FOREIGN KEY ("blackoutId") REFERENCES "LeaveBlackout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
