/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Approver` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Approver" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Approver_email_key" ON "Approver"("email");
