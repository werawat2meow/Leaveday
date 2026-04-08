export type AnnualCarryForwardBucket = {
	id: number;
	employeeId: number;
	originYear: number;
	remaining: number;
	expiresAt: Date; // exclusive instant (usable while leaveStart < expiresAt)
};

function clampAnniversaryUTC(params: { employeeStartDate: Date; year: number }) {
	const { employeeStartDate, year } = params;
	const month0 = employeeStartDate.getUTCMonth();
	const day = employeeStartDate.getUTCDate();
	const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
	const safeDay = Math.min(day, lastDay);
	return new Date(Date.UTC(year, month0, safeDay, 0, 0, 0, 0));
}

function addDaysUTC(date: Date, days: number) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

export function dayBeforeUTC(date: Date) {
	return addDaysUTC(date, -1);
}

/**
 * Policy: Annual carry-forward earned in originYear remains usable through the employee's
 * work-anniversary in (originYear + 2), inclusive.
 *
 * We store `expiresAt` as an *exclusive* timestamp at 00:00Z of the next day,
 * so checks like `expiresAt > now` and `leaveStart < expiresAt` treat the last usable
 * date as inclusive.
 */
export function computeAnnualCarryForwardBucketExpiresAt(
	employeeStartDate: Date | null | undefined,
	originYear: number
) {
	if (!employeeStartDate) return null;
	const lastUsableDay = clampAnniversaryUTC({ employeeStartDate, year: originYear + 2 });
	return addDaysUTC(lastUsableDay, 1);
}

/**
 * Policy: Annual leave earned in originYear becomes usable starting the employee's
 * work-anniversary in (originYear + 1), inclusive.
 */
export function computeAnnualCarryForwardBucketStartsAt(
	employeeStartDate: Date | null | undefined,
	originYear: number
) {
	if (!employeeStartDate) return null;
	return clampAnniversaryUTC({ employeeStartDate, year: originYear + 1 });
}

export function isBucketUsable(params: {
	bucket: Pick<AnnualCarryForwardBucket, "remaining" | "expiresAt" | "originYear">;
	employeeStartDate?: Date | null;
	now: Date;
	leaveStart: Date;
}) {
	const { bucket, employeeStartDate, now, leaveStart } = params;
	if (!(bucket.remaining > 0)) return false;
	if (!(bucket.expiresAt instanceof Date) || Number.isNaN(+bucket.expiresAt)) return false;

	const startsAt = computeAnnualCarryForwardBucketStartsAt(employeeStartDate, bucket.originYear);
	if (startsAt && leaveStart < startsAt) return false;

	return bucket.expiresAt > now && leaveStart < bucket.expiresAt;
}

export function sortBucketsForFifo<T extends Pick<AnnualCarryForwardBucket, "expiresAt" | "originYear" | "id">>(
	buckets: T[]
) {
	return [...buckets].sort((a, b) => {
		const ax = +a.expiresAt;
		const bx = +b.expiresAt;
		if (ax !== bx) return ax - bx;
		if (a.originYear !== b.originYear) return a.originYear - b.originYear;
		return a.id - b.id;
	});
}

export function allocateFromBuckets<T extends AnnualCarryForwardBucket>(params: {
	buckets: T[];
	employeeStartDate?: Date | null;
	now: Date;
	leaveStart: Date;
	days: number;
}) {
	const { employeeStartDate, now, leaveStart } = params;
	let remainingDays = Math.max(0, Number(params.days || 0));
	const allocations: Array<{ bucketId: number; originYear: number; use: number }> = [];

	if (!(remainingDays > 0)) return { used: 0, allocations };

	const fifo = sortBucketsForFifo(params.buckets);

	for (const bucket of fifo) {
		if (remainingDays <= 0) break;
		if (!isBucketUsable({ bucket, employeeStartDate, now, leaveStart })) continue;

		const canUse = Math.min(remainingDays, Math.max(0, bucket.remaining));
		if (!(canUse > 0)) continue;

		bucket.remaining -= canUse;
		remainingDays -= canUse;
		allocations.push({ bucketId: bucket.id, originYear: bucket.originYear, use: canUse });
	}

	return { used: Math.max(0, Number(params.days || 0)) - remainingDays, allocations };
}
