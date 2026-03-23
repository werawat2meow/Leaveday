"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import EmployeeLeaveBalanceSummary from "./EmployeeLeaveBalanceSummary";
import EmployeeScopeList from "./EmployeeScopeList";
import LeaveBalanceFilters from "./LeaveBalanceFilters";

type Filters = {
	org: string;
	department: string;
	division: string;
	unit: string;
	q: string;
};

type EmployeeItem = {
	id: number;
	empNo: string;
	firstName: string;
	lastName: string;
	org?: string | null;
	department?: string | null;
	division?: string | null;
	unit?: string | null;
	levelP?: string | null;
};

type SummaryPayload = {
	year: number;
	employee: EmployeeItem & { photoUrl?: string | null };
	cards: Array<{
		key: string;
		title: string;
		entitled: number;
		used: number;
		remaining: number;
	}>;
	carryForwardAnnual: number;
	carryForwardAnnualExpiry?: string | null;
	carryForwardAnnualBuckets?: Array<{
		originYear: number;
		remaining: number;
		expiresAt: string;
		expiresOn?: string;
	}>;
	carryForwardHoliday: number;
	carryForwardHolidayExpiry?: string | null;
};

type Props = {
	initialEmployeeId: string;
	initialYear: string;
	initialFilters: Filters;
	source: string;
};

export default function LeaveBalancePageClient({
	initialEmployeeId,
	initialYear,
	initialFilters,
	source,
}: Props) {
	const router = useRouter();
	const pathname = usePathname();

	const [filters, setFilters] = useState<Filters>(initialFilters);
	const [year, setYear] = useState(initialYear || String(new Date().getFullYear()));
	const [employees, setEmployees] = useState<EmployeeItem[]>([]);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
		initialEmployeeId ? Number(initialEmployeeId) : null
	);
	const [summary, setSummary] = useState<SummaryPayload | null>(null);
	const [loadingEmployees, setLoadingEmployees] = useState(true);
	const [loadingSummary, setLoadingSummary] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [viewerMode, setViewerMode] = useState<"ADMIN" | "SCOPED">("SCOPED");
	const [scopes, setScopes] = useState<string[]>([]);
	const [options, setOptions] = useState({
		org: [] as string[],
		department: [] as string[],
		division: [] as string[],
		unit: [] as string[],
	});

	useEffect(() => {
		const qs = new URLSearchParams();
		if (filters.org) qs.set("org", filters.org);
		if (filters.department) qs.set("department", filters.department);
		if (filters.division) qs.set("division", filters.division);
		if (filters.unit) qs.set("unit", filters.unit);
		if (filters.q) qs.set("q", filters.q);

		let active = true;
		setLoadingEmployees(true);
		setError(null);

		fetch(`/api/leave-balance/employees?${qs.toString()}`, { cache: "no-store" })
			.then(async (response) => {
				const body = await response.json();
				if (!response.ok) throw new Error(body?.error || "โหลดรายชื่อไม่สำเร็จ");
				if (!active) return;

				const nextEmployees = (body?.data ?? []) as EmployeeItem[];
				setEmployees(nextEmployees);
				setOptions(
					body?.options ?? { org: [], department: [], division: [], unit: [] }
				);
				setScopes(body?.scopes ?? []);
				setViewerMode(body?.viewerMode ?? "SCOPED");

				if (selectedEmployeeId) {
					const exists = nextEmployees.some((item) => item.id === selectedEmployeeId);
					if (!exists) {
						setSelectedEmployeeId(nextEmployees[0]?.id ?? null);
					}
				} else {
					setSelectedEmployeeId(nextEmployees[0]?.id ?? null);
				}
			})
			.catch((fetchError) => {
				if (!active) return;
				setError(fetchError?.message || "โหลดรายชื่อไม่สำเร็จ");
			})
			.finally(() => {
				if (active) setLoadingEmployees(false);
			});

		return () => {
			active = false;
		};
	}, [filters.org, filters.department, filters.division, filters.unit, filters.q]);

	useEffect(() => {
		if (!selectedEmployeeId) {
			setSummary(null);
			return;
		}

		let active = true;
		setLoadingSummary(true);

		fetch(`/api/leave-balance/summary?employeeId=${selectedEmployeeId}&year=${year}`, {
			cache: "no-store",
		})
			.then(async (response) => {
				const body = await response.json();
				if (!response.ok) throw new Error(body?.error || "โหลดข้อมูลสิทธิ์ไม่สำเร็จ");
				if (active) setSummary(body?.data ?? null);
			})
			.catch((fetchError) => {
				if (active) {
					setError(fetchError?.message || "โหลดข้อมูลสิทธิ์ไม่สำเร็จ");
					setSummary(null);
				}
			})
			.finally(() => {
				if (active) setLoadingSummary(false);
			});

		return () => {
			active = false;
		};
	}, [selectedEmployeeId, year]);

	useEffect(() => {
		const qs = new URLSearchParams();
		if (selectedEmployeeId) qs.set("employeeId", String(selectedEmployeeId));
		if (year) qs.set("year", year);
		if (filters.org) qs.set("org", filters.org);
		if (filters.department) qs.set("department", filters.department);
		if (filters.division) qs.set("division", filters.division);
		if (filters.unit) qs.set("unit", filters.unit);
		if (filters.q) qs.set("q", filters.q);
		if (source) qs.set("source", source);

		router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
	}, [selectedEmployeeId, year, filters, source, router, pathname]);

	return (
		<section className="neon-card rounded-2xl p-6 text-slate-900 dark:text-slate-100">
			<div className="mb-4 flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 className="neon-title text-lg font-semibold text-slate-900 dark:text-slate-100">
						ตรวจสิทธิ์วันลาคงเหลือ
					</h2>
					<p className="text-sm text-slate-600 dark:text-slate-400">
						{viewerMode === "ADMIN"
							? "แสดงทุกสังกัดและให้กรองเองได้"
							: "แสดงเฉพาะพนักงานใน scope ที่ได้รับอนุญาตและคนที่ดูแลโดยตรง"}
					</p>
				</div>
			</div>

			<LeaveBalanceFilters
				value={filters}
				year={year}
				options={options}
				scopes={scopes}
				viewerMode={viewerMode}
				onChange={setFilters}
				onYearChange={setYear}
			/>

			{error && (
				<div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-200">
					{error}
				</div>
			)}

			<div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
				<EmployeeScopeList
					loading={loadingEmployees}
					employees={employees}
					selectedEmployeeId={selectedEmployeeId}
					onSelect={setSelectedEmployeeId}
				/>

				<EmployeeLeaveBalanceSummary loading={loadingSummary} data={summary} />
			</div>
		</section>
	);
}
