type SummaryCard = {
	key: string;
	title: string;
	entitled: number;
	used: number;
	remaining: number;
};

type SummaryPayload = {
	year: number;
	employee: {
		id: number;
		empNo: string;
		firstName: string;
		lastName: string;
		org?: string | null;
		department?: string | null;
		division?: string | null;
		unit?: string | null;
		levelP?: string | null;
		photoUrl?: string | null;
	};
	cards: SummaryCard[];
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
	loading: boolean;
	data: SummaryPayload | null;
};

function fmtNumber(value: number) {
	return Number.isFinite(value) ? value.toFixed(1).replace(/\.0$/, "") : "0";
}

function fmtDate(value?: string | null) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
}

export default function EmployeeLeaveBalanceSummary({ loading, data }: Props) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
			<h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
				สรุปสิทธิ์วันลา
			</h3>

			{loading ? (
				<div className="mt-3 text-sm text-slate-500 dark:text-slate-400">กำลังโหลดข้อมูลสิทธิ์...</div>
			) : !data ? (
				<div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
					เลือกพนักงานจากรายการด้านซ้ายเพื่อดูสิทธิ์วันลาคงเหลือ
				</div>
			) : (
				<div className="mt-4 space-y-4">
					<div className="grid gap-3 sm:grid-cols-[84px_1fr] sm:items-start">
						<div className="h-20 w-20 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
							{data.employee.photoUrl ? (
								<img
									src={data.employee.photoUrl}
									alt={`${data.employee.firstName} ${data.employee.lastName}`}
									className="h-full w-full object-cover"
								/>
							) : null}
						</div>

						<div>
							<div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
								{data.employee.firstName} {data.employee.lastName}
							</div>
							<div className="text-sm text-slate-500 dark:text-slate-400">
								{data.employee.empNo} • {data.employee.levelP || "-"}
							</div>
							<div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
								{[data.employee.org, data.employee.department, data.employee.division, data.employee.unit]
									.filter(Boolean)
									.join(" / ") || "-"}
							</div>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						{data.cards.map((card) => (
							<div
								key={card.key}
								className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-900/30"
							>
								<div className="text-sm font-medium text-slate-900 dark:text-slate-100">
									{card.title}
								</div>
								<div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
									<div>สิทธิ์รวม: {fmtNumber(card.entitled)}</div>
									<div>ใช้ไปแล้ว: {fmtNumber(card.used)}</div>
									<div className="font-semibold text-emerald-700 dark:text-emerald-600">
										คงเหลือ: {fmtNumber(card.remaining)}
									</div>
								</div>
							</div>
						))}
					</div>

					<div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-300">
						<div className="font-medium text-slate-900 dark:text-slate-100">ยอดยกสิทธิ์</div>
						{Array.isArray(data.carryForwardAnnualBuckets) && data.carryForwardAnnualBuckets.length > 0 ? (
							<div className="mt-2 space-y-1">
								<div>ลาพักร้อนยกมา (แยกตามปีสิทธิ์):</div>
								{data.carryForwardAnnualBuckets.map((b, idx) => (
									<div key={idx}>
										ปี {Number(b.originYear) + 543}: {fmtNumber(Number(b.remaining || 0))} วัน (หมดอายุ: {fmtDate(b.expiresOn ?? b.expiresAt)})
									</div>
								))}
							</div>
						) : (
							<>
								<div className="mt-2">ลาพักร้อนยกมา: {fmtNumber(data.carryForwardAnnual)} วัน</div>
								<div>หมดอายุลาพักร้อนยกมา: {fmtDate(data.carryForwardAnnualExpiry)}</div>
							</>
						)}
						<div className="mt-2">วันหยุดพิเศษยกมา: {fmtNumber(data.carryForwardHoliday)} วัน</div>
						<div>หมดอายุวันหยุดพิเศษยกมา: {fmtDate(data.carryForwardHolidayExpiry)}</div>
						<div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
							ข้อมูลปี {data.year}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
