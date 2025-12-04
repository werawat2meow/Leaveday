-- CreateTable
CREATE TABLE "LeaveRights" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "annualLeave" INTEGER NOT NULL,
    "carryForwardAnnual" INTEGER NOT NULL DEFAULT 0,
    "carryForwardAnnualExpiry" TIMESTAMP(3),
    "holidayLeave" INTEGER NOT NULL,
    "carryForwardHoliday" INTEGER NOT NULL DEFAULT 0,
    "carryForwardHolidayExpiry" TIMESTAMP(3),

    CONSTRAINT "LeaveRights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRightsTemplate" (
    "id" SERIAL NOT NULL,
    "prefix" TEXT NOT NULL,
    "maternityLeaveDays" INTEGER NOT NULL,
    "ordainLeaveDays" INTEGER NOT NULL,
    "annualLeaveDays" INTEGER NOT NULL,
    "holidayLeaveDays" INTEGER NOT NULL,

    CONSTRAINT "LeaveRightsTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LeaveRights" ADD CONSTRAINT "LeaveRights_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
