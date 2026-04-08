import { prisma } from "@/lib/prisma";
import {
	allocateFromBuckets,
	sortBucketsForFifo,
	type AnnualCarryForwardBucket,
	isBucketUsable,
} from "@/lib/annual-carry-forward-buckets";

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

export async function getActiveAnnualCarryForwardBuckets(params: { employeeId: number; now: Date }) {
	const { employeeId, now } = params;
	const rows: Array<{
		id: number;
		employeeId: number;
		originYear: number;
		remaining: unknown;
		expiresAt: Date;
	}> = await (prisma as any).annualCarryForwardBucket.findMany({
		where: {
			employeeId,
			remaining: { gt: 0 },
			expiresAt: { gt: now },
		},
		orderBy: [{ expiresAt: "asc" }, { originYear: "asc" }, { id: "asc" }],
		select: { id: true, employeeId: true, originYear: true, remaining: true, expiresAt: true },
	});

	return rows.map((r) => ({
		id: r.id,
		employeeId: r.employeeId,
		originYear: r.originYear,
		remaining: toNum(r.remaining),
		expiresAt: new Date(r.expiresAt),
	})) as AnnualCarryForwardBucket[];
}

export function sumUsableAnnualCarryForward(params: {
	buckets: Array<Pick<AnnualCarryForwardBucket, "remaining" | "expiresAt" | "originYear">>;
	employeeStartDate?: Date | null;
	now: Date;
	leaveStart: Date;
}) {
	const { buckets, employeeStartDate, now, leaveStart } = params;
	let sum = 0;
	for (const bucket of buckets) {
		if (isBucketUsable({ bucket, employeeStartDate, now, leaveStart })) sum += Math.max(0, bucket.remaining);
	}
	return sum;
}

/**
 * Decrement annual carry-forward buckets (FIFO by expiry) for the given leaveStart.
 * Returns how many days were actually taken.
 */
export async function takeAnnualCarryForwardDays(params: {
	employeeId: number;
	employeeStartDate?: Date | null;
	now: Date;
	leaveStart: Date;
	days: number;
	buckets?: AnnualCarryForwardBucket[]; // optional preloaded pool
}) {
	const { employeeId, employeeStartDate, now, leaveStart } = params;
	const want = Math.max(0, Number(params.days || 0));
	if (!(want > 0)) return { used: 0, allocations: [] as Array<{ bucketId: number; originYear: number; use: number }> };

	const pool = (params.buckets ? [...params.buckets] : await getActiveAnnualCarryForwardBuckets({ employeeId, now }))
		.map((b) => ({ ...b })) as AnnualCarryForwardBucket[];

	const { used, allocations } = allocateFromBuckets({ buckets: pool, employeeStartDate, now, leaveStart, days: want });
	if (!(used > 0) || allocations.length === 0) return { used: 0, allocations: [] as Array<{ bucketId: number; originYear: number; use: number }> };

	await prisma.$transaction(
		allocations.map((a) =>
			(prisma as any).annualCarryForwardBucket.update({
				where: { id: a.bucketId },
				data: { remaining: { decrement: a.use } },
			})
		)
	);

	return { used, allocations };
}

/**
 * Mutating allocator that operates on an in-memory pool (used for PENDING reservation simulation).
 */
export function reserveAnnualCarryForwardFromPool(params: {
	pool: AnnualCarryForwardBucket[];
	employeeStartDate?: Date | null;
	now: Date;
	leaveStart: Date;
	days: number;
}) {
	const { pool, employeeStartDate, now, leaveStart } = params;
	const fifo = sortBucketsForFifo(pool);
	return allocateFromBuckets({ buckets: fifo as AnnualCarryForwardBucket[], employeeStartDate, now, leaveStart, days: params.days });
}
