"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const WEEK_DAYS = [
    "",
    "จันทร์",
    "อังคาร",
    "พุธ",
    "พฤหัสบดี",
    "ศุกร์",
    "เสาร์",
    "อาทิตย์",
];

export default function MePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [employee, setEmployee] = useState<{ weeklyHoliday?: string }>({});
    const [holiday, setHoliday] = useState("");
    const [holidayMsg, setHolidayMsg] = useState<string | null>(null);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isAuthed = status === "authenticated";

    const messageTone = useMemo(() => {
        if (!message) return "neutral";
        return message.includes("สำเร็จ") ? "success" : "error";
    }, [message]);

    useEffect(() => {
        console.log("[client] useSession →", { status, session });
    }, [status, session]);

    useEffect(() => {
        // โหลดข้อมูล employee เพื่อเอา weeklyHoliday มาแสดง
        if (isAuthed) {
            fetch("/api/employees/me")
                .then((r) => r.json())
                .then((d) => {
                    setEmployee(d.employee || {});
                    setHoliday(d.employee?.weeklyHoliday || "");
                });
        }
    }, [isAuthed]);

    async function onChangePassword(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);

        if (!isAuthed) {
            setMessage("กรุณาเข้าสู่ระบบก่อน");
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage("รหัสใหม่กับยืนยันรหัสไม่ตรงกัน");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/me/password", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(data?.error ?? "เปลี่ยนรหัสไม่สำเร็จ");
                return;
            }

            setMessage("เปลี่ยนรหัสผ่านสำเร็จ — กำลังออกจากระบบ...");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");

            // บังคับออกจากระบบเพื่อให้ login ใหม่ด้วยรหัสล่าสุด
            setTimeout(() => {
                signOut({ callbackUrl: "/login" });
            }, 700);
        } finally {
            setSubmitting(false);
        }
    }

    async function onSaveHoliday() {

        const ok = window.confirm("คุณแน่ใจต้องการเปลี่ยนวันหยุดใช่หรือไม้?");
        if (!ok) return;

        setHolidayMsg(null);
        if (!isAuthed) {
            setHolidayMsg("กรุณาเข้าสู่ระบบก่อน");
            return;
        }

        const res = await fetch("/api/employees/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weeklyHoliday: holiday || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setHolidayMsg(data?.error ?? "บันทึกไม่สำเร็จ");
            return;
        }
        setHolidayMsg("บันทึกสำเร็จ");
        setEmployee((e) => ({ ...e, weeklyHoliday: holiday }));
    }

    const handleBack = () => router.back();

    return (
        <main className="min-h-[calc(100vh-80px)] text-yellow-500 dark:text-white">
            <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
                <header className="mb-6 flex items-center gap-4">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="shrink-0 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border border-white/15 bg-white/5 hover:bg-white/10 transition text-gray-900 dark:text-white"
                    >
                        ← ย้อนกลับ
                    </button>

                    <div>
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">My Account</h1>
                        <p className="text-sm text-gray-700 dark:text-white/70">จัดการข้อมูลบัญชี และเปลี่ยนรหัสผ่าน</p>
                    </div>
                </header>

                <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Session card */}
                    <div className="neon-card rounded-2xl p-5 lg:col-span-1 border border-white/10 bg-white/5 backdrop-blur">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold">Session</h2>
                                <p className="text-xs text-gray-700 dark:text-white/70 mt-1">สถานะการเข้าสู่ระบบ</p>
                            </div>
                            <span
                                className={[
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                                    isAuthed ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/20" : "bg-amber-500/15 text-amber-200 border border-amber-500/20",
                                ].join(" ")}
                            >
                                {status}
                            </span>
                        </div>

                        <div className="mt-4 space-y-2 text-sm">
                            <div className="flex justify-between gap-3">
                                <span className="text-gray-700 dark:text-white/60">User</span>
                                <span className="truncate max-w-[65%] text-right">
                                    {session?.user?.name ?? session?.user?.email ?? "-"}
                                </span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span className="text-gray-700 dark:text-white/60">Email</span>
                                <span className="truncate max-w-[65%] text-right">{session?.user?.email ?? "-"}</span>
                            </div>
                        </div>
                        <div className="mt-6">
                            <label className="block text-sm font-medium text-yellow-500 dark:text-white/90 mb-1">
                                วันหยุดประจำสัปดาห์
                            </label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={holiday}
                                    onChange={(e) => setHoliday(e.target.value)}
                                    className="rounded-xl px-3 py-2 bg-black/20 border border-white/15 text-rose-500 dark:text-white
                                               dark:bg-gray-700 dark:border-gray-600
                                               placeholder-gray-500 dark:placeholder-gray-400 w-full"
                                >
                                    {WEEK_DAYS.map((d) => (
                                        <option key={d} value={d}>
                                            {d || "- เลือก -"}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={onSaveHoliday}
                                    className="px-4 py-2 bg-orange-500 text-white rounded-xl disabled:opacity-60"
                                    disabled={!holiday}
                                >
                                    บันทึก
                                </button>
                            </div>
                            {holidayMsg && (
                                <p
                                    className={`text-xs mt-1 ${
                                        holidayMsg.includes("สำเร็จ") ? "text-emerald-300" : "text-rose-300"
                                    }`}
                                >
                                    {holidayMsg}
                                </p>
                            )}
                        </div>
                        <p className="mt-4 text-xs text-gray-600 dark:text-white/60 leading-relaxed">
                            แนะนำ: หลังเปลี่ยนรหัสผ่าน อาจต้องออกจากระบบและเข้าใหม่
                        </p>
                    </div>

                    {/* Change Password Card*/}
                    <div className="neon-card rounded-2xl p-5 lg:col-span-2 border border-white/10 bg-white/5 backdrop-blur">
                        <div className="mb-4">
                            <h2 className="text-base font-semibold">Change Password</h2>
                            <p className="text-xs text-gray-700 dark:text-white/70 mt-1">กรอกรหัสปัจจุบันและตั้งรหัสใหม่</p>
                        </div>

                        <form onSubmit={onChangePassword} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-900 dark:text-white/90 mb-1">
                                        รหัสผ่านปัจจุบัน
                                    </label>
                                    <input
                                        className="w-full rounded-xl px-3 py-2 bg-black/20 border border-white/15 outline-none
                                                   focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                        type="password"
                                        placeholder="กรอกรหัสผ่านปัจจุบัน"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        autoComplete="current-password"
                                        disabled={submitting || !isAuthed}
                                    />
                                </div>
                                <div className="relative">
                                    <input
                                        className="w-full rounded-xl px-3 py-2 bg-black/20 border border-white/15 outline-none
                                                focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                        type={showNew ? "text" : "password"}
                                        placeholder="อย่างน้อย 8 ตัวอักษร"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                        disabled={submitting || !isAuthed}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew((v) => !v)}
                                        className="absolute inset-y-3 right-2 flex items-center text-gray-400 hover:text-gray-200"
                                        tabIndex={-1} /* ไม่ย้ายโฟกัส */
                                    >
                                        {showNew ? "🙈" : "👁️"}
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        className="w-full rounded-xl px-3 py-2 bg-black/20 border border-white/15 outline-none
                                                focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                        type={showConfirm ? "text" : "password"}
                                        placeholder="พิมพ์ซ้ำให้ตรงกัน"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        autoComplete="new-password"
                                        disabled={submitting || !isAuthed}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm((v) => !v)}
                                        className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-200"
                                        tabIndex={-1}
                                    >
                                        {showConfirm ? "🙈" : "👁️"}
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                                <p className="text-xs text-gray-600 dark:text-white/60">
                                    ระบบจะตรวจรหัสปัจจุบันก่อน และบันทึกเป็น <span className="text-gray-700 dark:text-white/80">passwordHash</span>
                                </p>

                                <div className="flex w-full sm:w-auto gap-3">
                                    <button
                                        type="button"
                                        onClick={handleBack}
                                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-4 py-2
                                                    border border-white/15 bg-white/5 hover:bg-white/10 transition
                                                    disabled:opacity-60 disabled:cursor-not-allowed"
                                        disabled={submitting}
                                    >
                                        กลับ
                                    </button>

                                    <button
                                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-4 py-2
                                                    border border-transparent bg-amber-400 text-gray-900 hover:bg-amber-500 shadow-md
                                                    transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-amber-300/40
                                                    disabled:opacity-60 disabled:cursor-not-allowed"
                                        type="submit"
                                        disabled={submitting || !isAuthed}
                                    >
                                        {submitting ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
                                    </button>
                                </div>
                            </div>
                            {message && (
                                <div
                                    className={[
                                        "rounded-xl px-3 py-2 text-sm border",
                                        messageTone === "success"
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
                                            : "bg-rose-500/10 border-rose-500/20 text-rose-200",
                                    ].join(" ")}
                                >
                                    {message}
                                </div>
                            )}
                        </form>
                    </div>
                </section>
            </div>
        </main>
    );
}