/*
  Warnings:

  - You are about to drop the column `annualHolidays` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `birthdayDays` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `businessDays` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `maternityDays` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `ordainDays` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `sickDays` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `unpaidDays` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `vacationDays` on the `Employee` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "annualHolidays",
DROP COLUMN "birthdayDays",
DROP COLUMN "businessDays",
DROP COLUMN "maternityDays",
DROP COLUMN "ordainDays",
DROP COLUMN "sickDays",
DROP COLUMN "unpaidDays",
DROP COLUMN "vacationDays";
