type Filters = {
	org: string;
	department: string;
	division: string;
	unit: string;
	q: string;
};

type Props = {
	value: Filters;
	year: string;
	options: {
		org: string[];
		department: string[];
		division: string[];
		unit: string[];
	};
	scopes: string[];
	viewerMode: "ADMIN" | "SCOPED";
	onChange: (next: Filters) => void;
	onYearChange: (next: string) => void;
};

function SelectField({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (next: string) => void;
}) {
	return (
		<label className="block">
			<span className="mb-1 block text-sm text-slate-700 dark:text-slate-300">{label}</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
			>
				<option value="">ทั้งหมด</option>
				{options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</label>
	);
}

export default function LeaveBalanceFilters({
	value,
	year,
	options,
	scopes,
	viewerMode,
	onChange,
	onYearChange,
}: Props) {
	const canShow = (scope: string) => viewerMode === "ADMIN" || scopes.includes(scope);

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
				<label className="block xl:col-span-2">
					<span className="mb-1 block text-sm text-slate-700 dark:text-slate-300">ค้นหา</span>
					<input
						value={value.q}
						onChange={(event) => onChange({ ...value, q: event.target.value })}
						placeholder="ชื่อ / EMP No. / Level P"
						className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
					/>
				</label>

				{/* <label className="block">
					<span className="mb-1 block text-sm text-slate-700 dark:text-slate-300">ปี</span>
					<input
						type="number"
						min={2000}
						max={2100}
						value={year}
						onChange={(event) => onYearChange(event.target.value)}
						className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
					/>
				</label> */}

				{canShow("org") && (
					<SelectField
						label="สังกัด"
						value={value.org}
						options={options.org}
						onChange={(next) => onChange({ ...value, org: next })}
					/>
				)}

				{canShow("department") && (
					<SelectField
						label="แผนก"
						value={value.department}
						options={options.department}
						onChange={(next) => onChange({ ...value, department: next })}
					/>
				)}

				{canShow("division") && (
					<SelectField
						label="ฝ่าย"
						value={value.division}
						options={options.division}
						onChange={(next) => onChange({ ...value, division: next })}
					/>
				)}

				{canShow("unit") && (
					<SelectField
						label="หน่วย"
						value={value.unit}
						options={options.unit}
						onChange={(next) => onChange({ ...value, unit: next })}
					/>
				)}
			</div>

			<div className="mt-3 flex justify-end">
				<button
					type="button"
					onClick={() => onChange({ org: "", department: "", division: "", unit: "", q: "" })}
					className="rounded-xl bg-red-600 border border-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 dark:bg-red-700 dark:border-red-700 dark:hover:bg-red-600"
					>
					ล้างตัวกรอง
				</button>
			</div>
		</div>
	);
}
