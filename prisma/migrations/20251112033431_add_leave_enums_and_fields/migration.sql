/*
  Warnings:

  - You are about to drop the column `type` on the `Leave` table. All the data in the column will be lost.
  - Added the required column `kind` to the `Leave` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LeaveKind" AS ENUM ('ANNUAL', 'SICK', 'BUSINESS', 'UNPAID', 'BIRTHDAY', 'ORDAIN', 'MATERNITY', 'SHIFT_CHANGE', 'HOLIDAY_CHANGE', 'OT');

-- CreateEnum
CREATE TYPE "LeaveSession" AS ENUM ('FULL', 'AM', 'PM');

-- AlterTable
ALTER TABLE "Leave" DROP COLUMN "type",
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "contact" TEXT,
ADD COLUMN     "handoverTo" TEXT,
ADD COLUMN     "kind" "LeaveKind" NOT NULL,
ADD COLUMN     "requestedDays" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "session" "LeaveSession";

-- CreateIndex
CREATE INDEX "Leave_kind_startDate_endDate_idx" ON "Leave"("kind", "startDate", "endDate");
