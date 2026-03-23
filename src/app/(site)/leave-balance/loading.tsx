export default function LeaveBalanceLoading() {
	return (
		<section className="neon-card rounded-2xl p-6">
			<div className="animate-pulse space-y-4">
				<div className="h-8 w-56 rounded bg-slate-200 dark:bg-slate-700" />
				<div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-700" />
				<div className="grid gap-4 lg:grid-cols-[320px_1fr]">
					<div className="h-[520px] rounded-xl bg-slate-200 dark:bg-slate-700" />
					<div className="h-[520px] rounded-xl bg-slate-200 dark:bg-slate-700" />
				</div>
			</div>
		</section>
	);
}
