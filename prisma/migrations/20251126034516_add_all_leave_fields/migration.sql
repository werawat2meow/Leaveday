/*
  Warnings:

  - Added the required column `birthdayLeaveDays` to the `LeaveRightsTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `businessLeaveDays` to the `LeaveRightsTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sickLeaveDays` to the `LeaveRightsTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unpaidLeaveDays` to the `LeaveRightsTemplate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vacationLeaveDays` to the `LeaveRightsTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LeaveRights" ADD COLUMN     "birthdayLeave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "businessLeave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maternityLeave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ordainLeave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sickLeave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unpaidLeave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vacationLeave" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LeaveRightsTemplate" ADD COLUMN     "birthdayLeaveDays" INTEGER NOT NULL,
ADD COLUMN     "businessLeaveDays" INTEGER NOT NULL,
ADD COLUMN     "sickLeaveDays" INTEGER NOT NULL,
ADD COLUMN     "unpaidLeaveDays" INTEGER NOT NULL,
ADD COLUMN     "vacationLeaveDays" INTEGER NOT NULL;
