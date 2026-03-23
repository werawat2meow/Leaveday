import { prisma } from "../src/lib/prisma";
import { computeAnnualCarryForwardBucketExpiresAt } from "../src/lib/annual-carry-forward-buckets";

function toNum(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (value && typeof value === "object" && typeof (value as any).toNumber === "function") {
		const parsed = (value as any).toNumber();
		return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
	const batchSize = 500;
	let cursor: number | null = null;
	let employeesProcessed = 0;
	let bucketsUpserted = 0;
	let bucketsSkippedNoStartDate = 0;

	for (;;) {
		const employees: Array<{ id: number; startDate: Date | null }> = await prisma.employee.findMany({
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
			take: batchSize,
			select: { id: true, startDate: true },
			orderBy: { id: "asc" },
		});

		if (employees.length === 0) break;
		cursor = employees[employees.length - 1]!.id;

		for (const employee of employees) {
			employeesProcessed += 1;

			const rightsRows: Array<{ year: number; carryForwardAnnual: unknown }> =
				await prisma.leaveRights.findMany({
				where: {
					employeeId: employee.id,
					carryForwardAnnual: { gt: 0 },
				},
				select: { year: true, carryForwardAnnual: true },
				orderBy: { year: "asc" },
			});

			if (rightsRows.length === 0) continue;
			if (!employee.startDate) {
				bucketsSkippedNoStartDate += rightsRows.length;
				continue;
			}

			for (const row of rightsRows) {
				const remaining = Math.max(0, toNum(row.carryForwardAnnual));
				if (!(remaining > 0)) continue;

				const originYear = row.year - 1;
				const expiresAt = computeAnnualCarryForwardBucketExpiresAt(employee.startDate, originYear);
				if (!expiresAt) continue;

				await (prisma as any).annualCarryForwardBucket.upsert({
					where: { employeeId_originYear: { employeeId: employee.id, originYear } },
					create: {
						employeeId: employee.id,
						originYear,
						remaining,
						expiresAt,
					},
					update: {
						remaining,
						expiresAt,
					},
				});

				bucketsUpserted += 1;
			}
		}

		console.log(
			`Processed ${employeesProcessed} employees... (buckets upserted=${bucketsUpserted}, skippedNoStartDate=${bucketsSkippedNoStartDate})`
		);
	}

	console.log("Done.");
	console.log({ employeesProcessed, bucketsUpserted, bucketsSkippedNoStartDate });
}

main()
	.then(() => prisma.$disconnect())
	.catch(async (err) => {
		console.error(err);
		await prisma.$disconnect();
		process.exit(1);
	});
