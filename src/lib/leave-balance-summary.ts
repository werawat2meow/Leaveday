import { ensureLeaveRightsForYear } from "@/lib/leave-rights-rollover";
import { HalfSession, countBusinessDays } from "@/lib/leave-utils";
import { prisma } from "@/lib/prisma";
import { dayBeforeUTC } from "@/lib/annual-carry-forward-buckets";

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

function yearStart(year: number) {
	return new Date(`${year}-01-01T00:00:00.000Z`);
}

function yearEnd(year: number) {
	return new Date(`${year}-12-31T23:59:59.999Z`);
}

function getReservationForYear(
	reservation: unknown,
	year: number
): { cf: number; current: number } | null {
	if (!reservation || typeof reservation !== "object") return null;
	const target = (reservation as any)[String(year)];
	if (!target || typeof target !== "object") return null;

	return {
		cf: toNum((target as any).cf),
		current: toNum((target as any).current),
	};
}

async function holidaySetForYear(year: number) {
	const holidays = await prisma.holiday.findMany({
		where: {
			date: {
				gte: new Date(`${year}-01-01`),
				lt: new Date(`${year + 1}-01-01`),
			},
		},
		select: { date: true },
	});

	return new Set(holidays.map((item) => item.date.toISOString().slice(0, 10)));
}

function overlapDaysInYear(params: {
	leaveStart: Date;
	leaveEnd: Date;
	leaveSession: HalfSession | null;
	year: number;
	holidays: Set<string>;
	weeklyHoliday?: string | null;
}) {
	const { leaveStart, leaveEnd, leaveSession, year, holidays, weeklyHoliday } = params;
	const segmentStart = leaveStart > yearStart(year) ? leaveStart : yearStart(year);
	const segmentEnd = leaveEnd < yearEnd(year) ? leaveEnd : yearEnd(year);

	if (segmentEnd < segmentStart) return 0;

	const includesOriginalStart =
		leaveStart.getFullYear() === year &&
		leaveStart.toISOString().slice(0, 10) === segmentStart.toISOString().slice(0, 10);

	return countBusinessDays(
		segmentStart,
		segmentEnd,
		includesOriginalStart ? leaveSession ?? "FULL" : "FULL",
		holidays,
		weeklyHoliday ?? undefined
	);
}

function buildCards(params: {
	annualTotal: number;
	holidayTotal: number;
	remainingByKind: Record<string, number>;
	usedApprovedOnlyByKind: Record<string, number>;
	totalRemainAnnualApprovedOnly: number;
	totalRemainHolidayApprovedOnly: number;
	holidayAvailableNowApprovedOnly: number;
}) {
	const {
		annualTotal,
		holidayTotal,
		remainingByKind,
		usedApprovedOnlyByKind,
		totalRemainAnnualApprovedOnly,
		totalRemainHolidayApprovedOnly,
		holidayAvailableNowApprovedOnly,
	} = params;

	const nonAnnualEntitled = (kind: string) =>
		Math.max(0, toNum(remainingByKind[kind]) + toNum(usedApprovedOnlyByKind[kind]));

	return [
		{
			key: "ANNUAL",
			title: "Annual",
			entitled: annualTotal,
			used: toNum(usedApprovedOnlyByKind.ANNUAL),
			remaining: totalRemainAnnualApprovedOnly,
		},
		{
			key: "ANNUAL_HOLIDAY",
			title: "Public Holiday",
			entitled: holidayTotal,
			used: toNum(usedApprovedOnlyByKind.ANNUAL_HOLIDAY),
			remaining: holidayAvailableNowApprovedOnly || totalRemainHolidayApprovedOnly,
		},
		{
			key: "SICK",
			title: "Sick",
			entitled: nonAnnualEntitled("SICK"),
			used: toNum(usedApprovedOnlyByKind.SICK),
			remaining: toNum(remainingByKind.SICK),
		},
		{
			key: "BUSINESS",
			title: "Business",
			entitled: nonAnnualEntitled("BUSINESS"),
			used: toNum(usedApprovedOnlyByKind.BUSINESS),
			remaining: toNum(remainingByKind.BUSINESS),
		},
		{
			key: "UNPAID",
			title: "Unpaid",
			entitled: nonAnnualEntitled("UNPAID"),
			used: toNum(usedApprovedOnlyByKind.UNPAID),
			remaining: toNum(remainingByKind.UNPAID),
		},
		{
			key: "BIRTHDAY",
			title: "Birthday",
			entitled: nonAnnualEntitled("BIRTHDAY"),
			used: toNum(usedApprovedOnlyByKind.BIRTHDAY),
			remaining: toNum(remainingByKind.BIRTHDAY),
		},
		{
			key: "ORDAIN",
			title: "Ordain",
			entitled: nonAnnualEntitled("ORDAIN"),
			used: toNum(usedApprovedOnlyByKind.ORDAIN),
			remaining: toNum(remainingByKind.ORDAIN),
		},
		{
			key: "MATERNITY",
			title: "Maternity",
			entitled: nonAnnualEntitled("MATERNITY"),
			used: toNum(usedApprovedOnlyByKind.MATERNITY),
			remaining: toNum(remainingByKind.MATERNITY),
		},
	];
}

export async function getEmployeeLeaveBalanceSummary(params: {
	employeeId: number;
	year: number;
}) {
	const { employeeId, year } = params;

	const employee = await prisma.employee.findUnique({
		where: { id: employeeId },
		include: { user: true },
	});

	if (!employee) {
		throw new Error("employee not found");
	}

	const leaveUserId = employee.userId ?? employee.user?.id ?? null;
	if (!leaveUserId) {
		throw new Error("employee user not found");
	}

	await ensureLeaveRightsForYear(employee.id, year);

	const rights = await prisma.leaveRights.findUnique({
		where: { employeeId_year: { employeeId: employee.id, year } },
	});

	const templateKey = employee.levelP || employee.prefix || null;
	const template = templateKey
		? await prisma.leaveRightsTemplate.findFirst({ where: { prefix: templateKey } })
		: null;

	const now = new Date();
	const todayKey = now.toISOString().slice(0, 10);
	const weeklyHoliday = employee.weeklyHoliday;
	const holidays = await holidaySetForYear(year);

	const overlapLeaves = await prisma.leave.findMany({
		where: {
			userId: leaveUserId,
			status: { in: ["APPROVED", "PENDING"] },
			AND: [{ startDate: { lte: yearEnd(year) } }, { endDate: { gte: yearStart(year) } }],
		},
		select: {
			id: true,
			kind: true,
			startDate: true,
			endDate: true,
			session: true,
			status: true,
			requestedDays: true,
			reservation: true,
		},
		orderBy: { startDate: "asc" },
	});

	const daysInThisYear = (leave: (typeof overlapLeaves)[number]) => {
		const start = new Date(leave.startDate);
		const end = new Date(leave.endDate);

		if (start.getFullYear() === year && end.getFullYear() === year) {
			const stored = toNum(leave.requestedDays);
			if (stored > 0) return stored;
		}

		return overlapDaysInYear({
			leaveStart: start,
			leaveEnd: end,
			leaveSession: (leave.session as HalfSession | null) ?? null,
			year,
			holidays,
			weeklyHoliday,
		});
	};

	const kinds = [
		"ANNUAL",
		"BUSINESS",
		"SICK",
		"BIRTHDAY",
		"ORDAIN",
		"MATERNITY",
		"UNPAID",
		"ANNUAL_HOLIDAY",
	] as const;

	const usedApprovedOnlyByKind: Record<string, number> = {};
	const usedPendingByKind: Record<string, number> = {};
	const summary: Record<string, number> = {};

	for (const kind of kinds) {
		usedApprovedOnlyByKind[kind] = 0;
		usedPendingByKind[kind] = 0;
		summary[kind] = 0;
	}

	for (const leave of overlapLeaves) {
		const days = daysInThisYear(leave);
		summary[leave.kind] = (summary[leave.kind] ?? 0) + days;
		if (leave.status === "APPROVED") usedApprovedOnlyByKind[leave.kind] += days;
		if (leave.status === "PENDING") usedPendingByKind[leave.kind] += days;
	}

	const annualBucketsRaw = await prisma.annualCarryForwardBucket.findMany({
		where: {
			employeeId: employee.id,
			remaining: { gt: 0 },
			expiresAt: { gt: now },
		},
		orderBy: [{ expiresAt: "asc" }, { originYear: "asc" }, { id: "asc" }],
		select: { id: true, originYear: true, remaining: true, expiresAt: true },
	});

	const annualBuckets = annualBucketsRaw.map((b) => ({
		id: b.id,
		originYear: b.originYear,
		remaining: toNum(b.remaining),
		expiresAt: new Date(b.expiresAt),
		expiresOn: dayBeforeUTC(new Date(b.expiresAt)),
	}));

	const cfAnnualTotal = annualBuckets.reduce((sum, b) => sum + Math.max(0, b.remaining), 0);
	const cfAnnualActiveNow = cfAnnualTotal > 0;

	const cfHolidayTotal = toNum(rights?.carryForwardHoliday ?? 0);
	const cfHolidayExpiry = rights?.carryForwardHolidayExpiry
		? new Date(rights.carryForwardHolidayExpiry)
		: null;
	const cfHolidayActiveNow = !!(cfHolidayTotal > 0 && cfHolidayExpiry && cfHolidayExpiry > now);

	const annualTotal = toNum(template?.vacationLeaveDays ?? rights?.annualLeave ?? 0) +
		(cfAnnualActiveNow ? cfAnnualTotal : 0);
	const holidayTotal = toNum(template?.holidayLeaveDays ?? 0) +
		(cfHolidayActiveNow ? cfHolidayTotal : 0);

	const annualCfRemainApprovedOnly = cfAnnualActiveNow ? cfAnnualTotal : 0;
	const annualCurrentRemainApprovedOnly = toNum(rights?.vacationLeave ?? 0);
	const holidayCfRemainApprovedOnly = cfHolidayActiveNow ? cfHolidayTotal : 0;
	const holidayCurrentRemainApprovedOnly = toNum(rights?.holidayLeave ?? 0);

	let annualCfRemainForUi = annualCfRemainApprovedOnly;
	let annualCurrentRemain = annualCurrentRemainApprovedOnly;
	let holidayCfRemainForUi = holidayCfRemainApprovedOnly;
	let holidayCurrentRemain = holidayCurrentRemainApprovedOnly;
	let annualCfPoolForReservation = annualCfRemainApprovedOnly;
	let holidayCfPoolForReservation = holidayCfRemainApprovedOnly;

	for (const leave of overlapLeaves) {
		if (leave.status !== "PENDING") continue;
		if (leave.kind !== "ANNUAL" && leave.kind !== "ANNUAL_HOLIDAY") continue;

		const leaveDays = daysInThisYear(leave);
		if (leaveDays <= 0) continue;

		const existing = getReservationForYear(leave.reservation, year);
		if (existing) {
			if (leave.kind === "ANNUAL") {
				annualCurrentRemain -= Math.max(0, existing.current);
				if (cfAnnualActiveNow) annualCfRemainForUi -= Math.max(0, existing.cf);
			} else {
				holidayCurrentRemain -= Math.max(0, existing.current);
				if (cfHolidayActiveNow) holidayCfRemainForUi -= Math.max(0, existing.cf);
			}
			continue;
		}

		let remain = leaveDays;
		if (leave.kind === "ANNUAL") {
			const useCF = Math.min(Math.max(0, annualCfPoolForReservation), remain);
			annualCfPoolForReservation -= useCF;
			remain -= useCF;
			annualCurrentRemain -= remain;
			if (cfAnnualActiveNow) annualCfRemainForUi -= useCF;
		} else {
			const useCF = Math.min(Math.max(0, holidayCfPoolForReservation), remain);
			holidayCfPoolForReservation -= useCF;
			remain -= useCF;
			holidayCurrentRemain -= remain;
			if (cfHolidayActiveNow) holidayCfRemainForUi -= useCF;
		}
	}

	const remainCarryForwardAnnualApprovedOnly = cfAnnualActiveNow
		? Math.max(0, annualCfRemainApprovedOnly)
		: 0;
	const remainVacationLeaveApprovedOnly = Math.max(0, annualCurrentRemainApprovedOnly);
	const remainCarryForwardHolidayApprovedOnly = cfHolidayActiveNow
		? Math.max(0, holidayCfRemainApprovedOnly)
		: 0;
	const remainHolidayLeaveApprovedOnly = Math.max(0, holidayCurrentRemainApprovedOnly);
	const totalRemainAnnualApprovedOnly =
		remainCarryForwardAnnualApprovedOnly + remainVacationLeaveApprovedOnly;
	const totalRemainHolidayApprovedOnly =
		remainCarryForwardHolidayApprovedOnly + remainHolidayLeaveApprovedOnly;

	const remainCarryForwardAnnual = cfAnnualActiveNow ? Math.max(0, annualCfRemainForUi) : 0;
	const remainVacationLeave = Math.max(0, annualCurrentRemain);
	const remainCarryForwardHoliday = cfHolidayActiveNow ? Math.max(0, holidayCfRemainForUi) : 0;
	const remainHolidayLeave = Math.max(0, holidayCurrentRemain);

	const entitledVacation = toNum(template?.vacationLeaveDays ?? rights?.annualLeave ?? 0);
	const entitledHoliday = toNum(template?.holidayLeaveDays ?? 0);
	const usedAnnualApprovedOnly = Math.max(0, entitledVacation - remainVacationLeaveApprovedOnly);
	const usedHolidayApprovedOnly = Math.max(0, entitledHoliday - remainHolidayLeaveApprovedOnly);
	usedApprovedOnlyByKind.ANNUAL = usedAnnualApprovedOnly;
	usedApprovedOnlyByKind.ANNUAL_HOLIDAY = usedHolidayApprovedOnly;

	const passedHolidayCount = Array.from(holidays).filter((day) => day <= todayKey).length;
	const holidayAccruedThisYear = Math.min(entitledHoliday, passedHolidayCount);
	const usedHolidayApprovedFromCurrent = Math.max(
		0,
		entitledHoliday - remainHolidayLeaveApprovedOnly
	);
	const holidayCurrentAccruedRemainApprovedOnly = Math.max(
		0,
		Math.min(
			remainHolidayLeaveApprovedOnly,
			holidayAccruedThisYear - usedHolidayApprovedFromCurrent
		)
	);
	const holidayAvailableNowApprovedOnly =
		Math.max(0, remainCarryForwardHolidayApprovedOnly) + holidayCurrentAccruedRemainApprovedOnly;

	const remainingByKind = {
		SICK: toNum((rights as any)?.sickLeave ?? 0),
		BUSINESS: toNum((rights as any)?.businessLeave ?? 0),
		UNPAID: toNum((rights as any)?.unpaidLeave ?? 0),
		BIRTHDAY: toNum((rights as any)?.birthdayLeave ?? 0),
		ORDAIN: toNum((rights as any)?.ordainLeave ?? 0),
		MATERNITY: toNum((rights as any)?.maternityLeave ?? 0),
	};

	return {
		year,
		employee: {
			id: employee.id,
			empNo: employee.empNo,
			firstName: employee.firstName,
			lastName: employee.lastName,
			org: employee.org ?? null,
			department: employee.department ?? null,
			division: employee.division ?? null,
			unit: employee.unit ?? null,
			levelP: employee.levelP ?? null,
			photoUrl: employee.photoUrl ?? null,
		},
		cards: buildCards({
			annualTotal,
			holidayTotal,
			remainingByKind,
			usedApprovedOnlyByKind,
			totalRemainAnnualApprovedOnly,
			totalRemainHolidayApprovedOnly,
			holidayAvailableNowApprovedOnly,
		}),
		carryForwardAnnual: cfAnnualTotal,
		carryForwardAnnualExpiry: null,
		carryForwardAnnualBuckets: annualBuckets.map((b) => ({
			originYear: b.originYear,
			remaining: b.remaining,
			expiresAt: b.expiresAt.toISOString(),
			expiresOn: b.expiresOn.toISOString(),
		})),
		carryForwardHoliday: cfHolidayTotal,
		carryForwardHolidayExpiry: cfHolidayExpiry ? cfHolidayExpiry.toISOString() : null,
		metrics: {
			summary,
			usedApprovedOnlyByKind,
			usedPendingByKind,
			remainingByKind,
			remainCarryForwardAnnual,
			remainVacationLeave,
			remainCarryForwardHoliday,
			remainHolidayLeave,
			totalRemainAnnualApprovedOnly,
			totalRemainHolidayApprovedOnly,
			holidayAvailableNowApprovedOnly,
		},
	};
}
