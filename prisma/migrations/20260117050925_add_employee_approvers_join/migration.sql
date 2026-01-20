-- AlterTable
ALTER TABLE "Approver" ADD COLUMN     "allowCrossOrg" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "_EmployeeApprovers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_EmployeeApprovers_AB_unique" ON "_EmployeeApprovers"("A", "B");

-- CreateIndex
CREATE INDEX "_EmployeeApprovers_B_index" ON "_EmployeeApprovers"("B");

-- AddForeignKey
ALTER TABLE "_EmployeeApprovers" ADD CONSTRAINT "_EmployeeApprovers_A_fkey" FOREIGN KEY ("A") REFERENCES "Approver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeApprovers" ADD CONSTRAINT "_EmployeeApprovers_B_fkey" FOREIGN KEY ("B") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
