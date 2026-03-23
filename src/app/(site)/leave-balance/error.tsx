"use client";

type Props = {
	error: Error & { digest?: string };
	reset: () => void;
};

export default function LeaveBalanceError({ error, reset }: Props) {
	return (
		<section className="neon-card rounded-2xl p-6">
			<h2 className="text-lg font-semibold text-rose-600 dark:text-rose-400">
				โหลดหน้าตรวจสิทธิ์ไม่สำเร็จ
			</h2>
			<p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
				{error.message || "เกิดข้อผิดพลาดที่ไม่คาดคิด"}
			</p>
			<button
				type="button"
				onClick={reset}
				className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-white hover:bg-rose-700"
			>
				ลองใหม่
			</button>
		</section>
	);
}
