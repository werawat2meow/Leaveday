-- Add unique constraint for LeaveRights(employeeId, year)
-- This prevents duplicate year rows per employee, which can cause non-deterministic reads/updates.
-- CreateIndex
CREATE UNIQUE INDEX "LeaveRights_employeeId_year_key" ON "LeaveRights"("employeeId", "year");