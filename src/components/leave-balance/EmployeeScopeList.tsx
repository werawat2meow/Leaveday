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

type Props = {
	loading: boolean;
	employees: EmployeeItem[];
	selectedEmployeeId: number | null;
	onSelect: (employeeId: number) => void;
};

export default function EmployeeScopeList({
	loading,
	employees,
	selectedEmployeeId,
	onSelect,
}: Props) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
			<h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
				รายชื่อพนักงาน
			</h3>

			{loading ? (
				<div className="text-sm text-slate-500 dark:text-slate-400">กำลังโหลดรายชื่อ...</div>
			) : employees.length === 0 ? (
				<div className="text-sm text-slate-500 dark:text-slate-400">ไม่พบพนักงานในขอบเขตที่ดูได้</div>
			) : (
				<div className="max-h-[560px] space-y-2 overflow-auto">
					{employees.map((employee) => {
						const isActive = employee.id === selectedEmployeeId;
						return (
							<button
								key={employee.id}
								type="button"
								onClick={() => onSelect(employee.id)}
								className={`w-full rounded-xl border px-3 py-3 text-left transition ${
									isActive
										? "border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-500/10"
										: "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10"
								}`}
							>
								<div className="font-medium text-slate-900 dark:text-slate-100">
									{employee.firstName} {employee.lastName}
								</div>
								<div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
									{employee.empNo} • {employee.levelP || "-"}
								</div>
								<div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
									{[employee.org, employee.department, employee.division, employee.unit]
										.filter(Boolean)
										.join(" / ") || "-"}
								</div>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
