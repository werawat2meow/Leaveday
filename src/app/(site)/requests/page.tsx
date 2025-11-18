"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import LeaveHistoryModal, {
  LeaveHistoryItem,
} from "@/components/LeaveHistoryModal";

type LeaveKind =
  | "ANNUAL" | "SICK" | "BUSINESS" | "UNPAID"
  | "BIRTHDAY" | "ORDAIN" | "MATERNITY"
  | "SHIFT_CHANGE" | "HOLIDAY_CHANGE" | "OT";

// รายการปุ่มที่จะแสดงใน UI
const LEAVE_TYPES: Array<{ label: string; kind: LeaveKind }> = [
  { label: "Annual Leave",        kind: "ANNUAL" },
  { label: "Sick Leave",          kind: "SICK" },
  { label: "Personal Leave",      kind: "BUSINESS" },  // (= Business)
  { label: "Leave without Pay",   kind: "UNPAID" },
  { label: "Birthday Leave",      kind: "BIRTHDAY" },
  { label: "Monkhood Leave",      kind: "ORDAIN" },
  { label: "Maternity Leave",     kind: "MATERNITY" },
  { label: "Shift Change",        kind: "SHIFT_CHANGE" },
  { label: "Holiday Change",      kind: "HOLIDAY_CHANGE" },
  { label: "OT",                  kind: "OT" },
];

type EmployeeForm = {
  Nametitle?: string;
  empNo?: string;
  name?: string;
  position?: string;
  section?: string;
  department?: string;
  LevelP?: string;
  email: string;
  idCard: string;
  photoUrl?: string;
};

type LeaveForm = {
  leaveType?: LeaveKind; // ← เดิมเป็น LeaveType ภาษาไทย
  fromDate?: string;
  toDate?: string;
  session?: "Full Day" | "Morning (Half)" | "Afternoon (Half)";
  reason?: string;
  attachment?: File | null;
  contact?: string;
  handoverTo?: string;
  approverId?: number | null;
};

  type ApproverOption = {
    id: number;
    label: string;
    name: string;
    empNo: string;
    department?: string | null;
    division?: string | null;
    unit?: string | null;
    level?: string | null;
    email?: string | null;
  };

type MeResponse = {
  employee: {
    empNo: string;
    email?: string|null;
    prefix?: string|null;
    firstName: string;
    lastName: string;
    position?: string|null;
    section?: string|null;
    department?: string|null;
    levelP?: string|null;
    idCard?: string|null;
    photoUrl?: string|null;
  };
    rights: {
      levelFrom: string | null;
      entitled: {
        vacation:number; business:number; sick:number;
        ordainDays:number; maternity:number; birthday:number; unpaid:number;
        annualHolidays:number;
      };
      used: {
        vacation:number; business:number; sick:number;
        ordainDays:number; maternity:number; birthday:number; unpaid:number;
        annualHolidays:number;
      };
      remaining: {
        vacation:number; business:number; sick:number;
        ordainDays:number; maternity:number; birthday:number; unpaid:number;
        annualHolidays:number;
      };
    };
  } | null;



export default function LeavePage() {

  const router = useRouter();
  const [openHistory, setOpenHistory] = useState(false);
  const [history, setHistory] = useState<LeaveHistoryItem[]>([]);

  useEffect(() => {
    if (!openHistory) return;
    (async () => {
      try {
        const res = await fetch("/api/leaves", { credentials: "include" });
        const json = await res.json();
        if (Array.isArray(json.data)) {
          setHistory(
            json.data.map((l: any, idx: number) => ({
              no: idx + 1,
              type: l.kind,
              range: `${new Date(l.startDate).toLocaleDateString()} - ${new Date(l.endDate).toLocaleDateString()}`,
              from: l.startDate,
              to: l.endDate,
              approverComment: l.approverComment ?? "",
              approver: l.approver?.name ?? "",
              status:
                l.status === "APPROVED"
                  ? "approved"
                  : l.status === "REJECTED"
                  ? "rejected"
                  : "pending",
            }))
          );
        }
      } catch (e) {
        setHistory([]);
      }
    })();
  }, [openHistory]);

  const [emp, setEmp] = useState<EmployeeForm>({
    Nametitle: "นาย",
    email: "",   // ใส่ค่าเริ่มต้น
    idCard: "",  // ใส่ค่าเริ่มต้น
  });
  const [leave, setLeave] = useState<LeaveForm>({ session: "Full Day" });
  const [submitting, setSubmitting] = useState(false);
  const [agree, setAgree] = useState(false);

  // คำนวณจำนวนวันลาแบบง่าย (รวมเสาร์อาทิตย์ไว้ก่อน)
  const totalDays = useMemo(() => {
    if (!leave.fromDate || !leave.toDate) return 0;
    const a = new Date(leave.fromDate);
    const b = new Date(leave.toDate);
    if (isNaN(+a) || isNaN(+b) || a > b) return 0;
    const diff = Math.round((+b - +a) / (1000 * 60 * 60 * 24)) + 1;
    if (leave.session?.includes("Half")) return Math.max(diff - 1 + 0.5, 0.5);
    return diff;
  }, [leave.fromDate, leave.toDate, leave.session]);

  function onChangeEmp<K extends keyof EmployeeForm>(k: K, v: EmployeeForm[K]) {
    setEmp((s) => ({ ...s, [k]: v }));
  }
  function onChangeLeave<K extends keyof LeaveForm>(k: K, v: LeaveForm[K]) {
    setLeave((s) => ({ ...s, [k]: v }));
  }

  function validate() {
    if (!emp.empNo || !emp.name) return "กรอกข้อมูลพนักงาน (รหัส/ชื่อ)";
    if (!leave.leaveType) return "เลือกประเภทการลา";
    if (!leave.fromDate || !leave.toDate) return "ระบุช่วงวันที่ลา";
    return "";
  }

  function getSessionLabel(s?: LeaveForm["session"]) {
  return s || "Full Day";
    }
    async function uploadIfAny(file: File | null | undefined) {
      if (!file) return null;
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd, credentials: "include" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "อัปโหลดไฟล์ไม่สำเร็จ");
      return j?.url || j?.data?.url || null;
    }

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  const err = validate();
  if (err) return alert(err);
  if (!agree) return alert("กรุณายืนยันว่าข้อมูลถูกต้อง");

  try {
    setSubmitting(true);
    const attachmentUrl = await uploadIfAny(leave.attachment ?? null);

    const payload = {
      kind: leave.leaveType,                    // "ANNUAL" | "SICK" | ...
      startDate: leave.fromDate,
      endDate: leave.toDate,
      sessionLabel: getSessionLabel(leave.session), // "Full Day" | "Morning (Half)" | "Afternoon (Half)"
      reason: leave.reason ?? "",
      contact: leave.contact ?? "",
      handoverTo: leave.handoverTo ?? "",
      attachmentUrl,
    };

    const res = await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || "ส่งคำขอลาไม่สำเร็จ");

    alert("ส่งคำขอลาสำเร็จ");
    router.push("/dashboard");
  } catch (e: any) {
    alert(e?.message || "เกิดข้อผิดพลาด");
  } finally {
    setSubmitting(false);
  }
}

  const [allRights, setAllRights] = useState<Array<{level:string; vacation:number; business:number; sick:number}>>([]);
  const [loadingAllRights, setLoadingAllRights] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        setLoadingAllRights(true);

        const res = await fetch(`/api/leave-rights`, {
          signal: ctrl.signal,
          cache: "no-store", // กัน cache ตอน dev ด้วย
        });

        const raw = await res.json();
        setAllRights(
          (raw?.data || []).map((r: any) => ({
            level: r.level,
            vacation: r.vacation,
            business: r.business,
            sick: r.sick,
          }))
        );
      } catch (e: any) {
        // 👇 เพิ่มเช็คนี้
        if (e?.name === "AbortError") return;
        console.error(e);
        setAllRights([]);
      } finally {
        setLoadingAllRights(false);
      }
    })();
    // ✅ cleanup ปลอดภัย ไม่โยน warning
    return () => {
      if (!ctrl.signal.aborted) ctrl.abort();
    };
  }, []);

  const [holidays, setHolidays] = useState<Array<{ id: number; title: string; date: string; note?: string | null }>>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [holidaysError, setHolidaysError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        setLoadingHolidays(true);
        setHolidaysError(null);

        const res = await fetch(`/api/holidays`, {
          signal: ctrl.signal,
          cache: "no-store",
          credentials: "include",
        });

        if (!res.ok) {
          setHolidays([]);
          setHolidaysError(`โหลดวันหยุดไม่สำเร็จ (${res.status})`);
          return;
        }

        const raw = await res.json();
        const list = (Array.isArray(raw) ? raw : raw?.data) || [];

        setHolidays(
          list.map((h: any) => ({
            id: h.id,
            title: h.title,
            date: h.date,
            note: h.note ?? null,
          }))
        );
      } catch (e: any) {
        // ⬇️ ถ้าถูกยกเลิกเอง ไม่ต้อง log
        if (ctrl.signal.aborted || e?.name === "AbortError") return;
        console.error(e);
        setHolidays([]);
        setHolidaysError(e?.message || "เกิดข้อผิดพลาดในการโหลดวันหยุด");
      } finally {
        setLoadingHolidays(false);
      }
    })();

    // ✅ cleanup: ไม่ส่ง reason จะไม่เด้ง "unmounted"
    return () => {
      if (!ctrl.signal.aborted) ctrl.abort();
    };
  }, []);

const [me, setMe] = useState<MeResponse>(null);
const [loadingMe, setLoadingMe] = useState(false);
const [meError, setMeError] = useState<string|null>(null);


useEffect(() => {
  const ctrl = new AbortController();
  (async () => {
    try {
      setLoadingMe(true);
      setMeError(null);
      const res = await fetch("/api/employees/me", {
        signal: ctrl.signal,
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setMe(null);
        setMeError(`โหลดข้อมูลพนักงานไม่สำเร็จ (${res.status})`);
        return;
      }
      const raw = await res.json();
      console.log("ME API ->", raw);

      // เซ็ตฟอร์มพนักงานให้พร้อมกรอกลา (คงโครงสร้างเดิมของคุณ)
      setEmp(s => ({
      ...s,
      Nametitle: raw.employee.prefix ?? s.Nametitle ?? "",
      empNo:     raw.employee.empNo   ?? s.empNo     ?? "",
      name:      `${raw.employee.firstName ?? ""} ${raw.employee.lastName ?? ""}`.trim(),
      position:  raw.employee.position  ?? s.position   ?? "",
      section:   raw.employee.section   ?? s.section    ?? "",   // <-- section
      department:raw.employee.department?? s.department ?? "",
      LevelP:    raw.employee.levelP    ?? s.LevelP     ?? "",
      email:     raw.employee.email     ?? s.email,
      idCard:    raw.employee.idCard    ?? s.idCard,
      photoUrl:  raw.employee.photoUrl  ?? s.photoUrl,
    }));

      setMe(raw);
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === "AbortError") return;
      console.error(e);
      setMe(null);
      setMeError(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoadingMe(false);
    }
  })();
  return () => { if (!ctrl.signal.aborted) ctrl.abort(); };
}, []);

  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [loadingApprovers, setLoadingApprovers] = useState(false);
  const [approverError, setApproverError] = useState<string | null>(null);
  
 useEffect(() => {
  // ถ้ายังไม่มี me (ยังโหลดข้อมูลพนักงานไม่เสร็จ) ก็ยังไม่ต้องเรียก API นี้
  if (!me) return;

  const ctrl = new AbortController();

  (async () => {
    try {
      setLoadingApprovers(true);
      setApproverError(null);

      const res = await fetch("/api/approvers/available", {
        signal: ctrl.signal,
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Approvers API error:", res.status, txt);
        setApprovers([]);
        setApproverError(`โหลดรายชื่อผู้อนุมัติไม่สำเร็จ (${res.status})`);
        return;
      }

      const raw = await res.json();
      const list = (raw?.data || []) as ApproverOption[];

      setApprovers(list);

      // ถ้ายังไม่ได้เลือก approverId และมีรายชื่อ → set default เป็นคนแรก
      if (!leave.approverId && list.length > 0) {
        setLeave(s => ({
          ...s,
          approverId: list[0].id,
          handoverTo: list[0].name,   // ชื่อผู้อนุมัติ เผื่อใช้ส่งไปเก็บเป็น text
        }));
      }
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === "AbortError") return;
      console.error(e);
      setApprovers([]);
      setApproverError(e?.message || "เกิดข้อผิดพลาดในการโหลดผู้อนุมัติ");
    } finally {
      setLoadingApprovers(false);
    }
  })();

  return () => {
    if (!ctrl.signal.aborted) ctrl.abort();
  };
}, [me, leave.approverId]);  // ให้รันเมื่อ me พร้อม หรือ approverId เปลี่ยน


  return (
    <main className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="flex justify-end">
          <button
            onClick={() => setOpenHistory(true)}
            className="rounded-xl px-4 py-2 font-extrabold
             bg-[var(--cyan)] text-[#001418]
             shadow-[0_10px_28px_var(--cyan-soft)]
             hover:shadow-[0_14px_36px_var(--cyan-soft)]
             focus:outline-none focus:ring-2 focus:ring-[var(--cyan)]/50
             active:translate-y-[1px] transition"
          >
            ประวัติการลา
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6 lg:grid-cols-3">
        {/* ฝั่งซ้าย: ข้อมูลพนักงาน + ประเภทการลา + ช่วงวัน */}
        <section className="lg:col-span-2 space-y-6">
          {/* ข้อมูลพนักงาน */}
          <div className="neon-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="neon-title text-lg font-semibold">ข้อมูลพนักงาน</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Input label="รหัสพนักงาน (EMP No.)" value={emp.empNo ?? ""} readOnly />
              <Input
                label="วันที่ยื่น (Auto)"
                value={new Date().toLocaleDateString("th-TH")}
                readOnly
              />

              {/* ✅ เพิ่มคำนำหน้าชื่อ */}
              <Input label="คำนำหน้าชื่อ" value={emp.Nametitle ?? ""} readOnly />
              <Input label="ชื่อ - สกุล" value={emp.name ?? ""} readOnly />

              <Input label="Email" value={emp.email ?? ""} readOnly />
              <Input label="เลขบัตรประชาชน" value={emp.idCard ?? ""} readOnly />

              <Input label="ตำแหน่ง" value={emp.position ?? ""} readOnly />
              <Input label="Department" value={emp.department ?? ""} readOnly />

              <Input label="Section" value={emp.section ?? ""} readOnly />
              <Input label="Level P" value={emp.LevelP ?? ""} readOnly />

              {/* ถ้ามีรูปภาพ */}
              {/* <img
                src={emp.photoUrl ?? ""}
                alt="Employee Photo"
                className="h-16 w-16 rounded-lg object-cover border border-white/10"
              /> */}
            </div>

            {meError && (
              <p className="text-xs text-red-400 mt-2">{meError}</p>
            )}
          </div>

          {/* ประเภทการลา */}
          <div className="neon-card rounded-2xl p-5">
            <h2 className="neon-title mb-3 text-lg font-semibold">
              ประเภทการลา
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {LEAVE_TYPES.map((t) => (
                <label key={t.kind}
                  className={`rounded-xl border border-white/10 p-3 cursor-pointer transition ${
                    leave.leaveType === t.kind ? "bg-[var(--input)] ring-2 ring-[var(--cyan)]" : "bg-transparent hover:bg-white/5"
                  }`}>
                  <input
                    type="radio"
                    name="leaveType"
                    className="mr-2 accent-[var(--cyan)]"
                    checked={leave.leaveType === t.kind}
                    onChange={() => onChangeLeave("leaveType", t.kind)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* ช่วงวัน/เหตุผล/แนบไฟล์ */}
          <form
            onSubmit={onSubmit}
            className="neon-card rounded-2xl p-5 space-y-4"
          >
            <h2 className="neon-title mb-1 text-lg font-semibold">
              รายละเอียดการลา
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                required
                label="ตั้งแต่วันที่"
                type="date"
                value={leave.fromDate ?? ""}
                onChange={(v) => onChangeLeave("fromDate", v)}
              />
              <Input
                required
                label="ถึงวันที่"
                type="date"
                value={leave.toDate ?? ""}
                onChange={(v) => onChangeLeave("toDate", v)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {["Full Day", "Morning (Half)", "Afternoon (Half)"].map((s) => (
                <label
                  key={s}
                  className={`rounded-xl border border-white/10 p-3 cursor-pointer ${
                    leave.session === s
                      ? "bg-[var(--input)] ring-2 ring-[var(--cyan)]"
                      : "hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="session"
                    className="mr-2 accent-[var(--cyan)]"
                    checked={leave.session === s}
                    onChange={() =>
                      onChangeLeave("session", s as LeaveForm["session"])
                    }
                  />
                  {s}
                </label>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm">ผู้อนุมัติ</span>

                {loadingApprovers ? (
                  <div className="neon-input w-full rounded-xl p-3 text-sm text-[var(--muted)]">
                    กำลังโหลดรายชื่อผู้อนุมัติ...
                  </div>
                ) : approverError ? (
                  <div className="neon-input w-full rounded-xl p-3 text-sm text-red-400">
                    {approverError}
                  </div>
                ) : approvers.length === 0 ? (
                  <div className="neon-input w-full rounded-xl p-3 text-sm text-[var(--muted)]">
                    ไม่พบรายชื่อผู้อนุมัติในสังกัดของคุณ
                  </div>
                ) : (
                  <select
                    className="neon-input w-full rounded-xl p-3 bg-transparent"
                    value={leave.approverId ? String(leave.approverId) : ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const selected = approvers.find(a => a.id === id) || null;
                      setLeave(s => ({
                        ...s,
                        approverId: id,
                        handoverTo: selected?.name ?? s.handoverTo,
                      }));
                    }}
                  >
                    <option value="">-- เลือกผู้อนุมัติ --</option>
                    {approvers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <Input
                label="ช่องทางติดต่อระหว่างลา"
                value={leave.contact ?? ""}
                onChange={(v) => onChangeLeave("contact", v)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">เหตุผลการลา</label>
              <textarea
                className="neon-input w-full rounded-xl p-3"
                rows={3}
                value={leave.reason ?? ""}
                onChange={(e) => onChangeLeave("reason", e.target.value)}
                placeholder="เช่น ป่วย, ธุระจำเป็น, ลาคลอด, เปลี่ยนกะ, ฯลฯ"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                แนบไฟล์ประกอบ (ถ้ามี)
              </label>
              <input
                type="file"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--cyan)] file:px-3 file:py-2 file:font-semibold file:text-[#001418]"
                onChange={(e) =>
                  onChangeLeave("attachment", e.target.files?.[0] ?? null)
                }
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-[var(--muted)]">
                รวมวันลา (ประมาณ):{" "}
                <span className="font-semibold text-[var(--text)]">
                  {totalDays}
                </span>{" "}
                วัน
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--cyan)]"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                ยืนยันว่าข้อมูลถูกต้อง
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-xl px-4 py-2 border border-white/10 hover:bg-white/5"
              >
                ยกเลิก
              </button>
              <button
                  type="submit"
                  disabled={submitting || !leave.leaveType}   // 👈 เพิ่มเงื่อนไขนี้
                  className="rounded-xl px-5 py-2 font-semibold bg-[var(--cyan)] text-[#001418] shadow-[0_10px_28px_var(--cyan-soft)] disabled:opacity-50"
                >
                  {submitting ? "กำลังส่ง..." : "ส่งคำขอลา"}
                </button>
            </div>
          </form>
        </section>

        {/* ฝั่งขวา: สิทธิวันลา + วันหยุดประจำปี */}
        <aside className="space-y-6">
          <div className="neon-card rounded-2xl p-5">
            <h2 className="neon-title mb-3 text-lg font-semibold">สิทธิวันลา (ทุกระดับ)</h2>
            {loadingAllRights ? (
              <p className="text-sm text-[var(--muted)]">กำลังโหลด...</p>
            ) : allRights.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">ไม่มีข้อมูล</p>
            ) : (
              <div className="overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-3 py-2 text-left">Level</th>
                      <th className="px-3 py-2 text-right">Annual</th>
                      <th className="px-3 py-2 text-right">Business</th>
                      <th className="px-3 py-2 text-right">Sick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRights.map((r) => (
                      <tr key={r.level} className="odd:bg-white/0 even:bg-white/5">
                        <td className="px-3 py-2">{r.level}</td>
                        <td className="px-3 py-2 text-center">{r.vacation}</td>
                        <td className="px-3 py-2 text-center">{r.business}</td>
                        <td className="px-3 py-2 text-center">{r.sick}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )} 
          </div>
          {me && (
              <div className="neon-card rounded-2xl p-5">
                <h2 className="neon-title mb-3 text-lg font-semibold">
                  สิทธิวันลาของฉัน (ปี {new Date().getFullYear() + 543})
                </h2>

                <div className="grid gap-3 md:grid-cols-3">
                  <EntBox title="Sick"            data={me.rights} k="sick" />
                  <EntBox title="Business"        data={me.rights} k="business" />
                  <EntBox title="Annual"          data={me.rights} k="vacation" />
                  <EntBox title="Holidays"        data={me.rights} k="annualHolidays" />
                  <EntBox title="Unpaid"          data={me.rights} k="unpaid" />
                  <EntBox title="Birthday"        data={me.rights} k="birthday" />
                  <EntBox title="Ordain"          data={me.rights} k="ordainDays" />
                  <EntBox title="Maternity"       data={me.rights} k="maternity" />
                </div>

                {me.rights.levelFrom && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    อิงสิทธิ์จากระดับ (Level P): <b>{me.rights.levelFrom}</b>
                  </p>
                )}
              </div>
            )}

          <div className="neon-card rounded-2xl p-5">
            <h2 className="neon-title mb-3 text-lg font-semibold">
              วันหยุดประจำปี (Public Holidays)
            </h2>

            {loadingHolidays ? (
              <p className="text-sm text-[var(--muted)]">กำลังโหลดวันหยุด...</p>
            ) : holidaysError ? (
              <p className="text-sm text-red-400">{holidaysError}</p>
            ) : holidays.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">ยังไม่มีข้อมูลวันหยุด</p>
            ) : (
              <div className="max-h-[360px] overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-3 py-2 text-left w-12">#</th>
                      <th className="px-3 py-2 text-left">ชื่อวันหยุด</th>
                      <th className="px-3 py-2 text-left">วันที่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.map((h, idx) => (
                      <tr key={h.id} className="odd:bg-white/0 even:bg-white/5">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {h.title}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const d = new Date(h.date);
                            if (isNaN(+d)) return h.date; // ถ้า parse ไม่ได้ ให้โชว์ข้อมูลดิบไปก่อน
                            const day = d.getDate().toString().padStart(2, "0");
                            const month = (d.getMonth() + 1).toString().padStart(2, "0");
                            const year = d.getFullYear() + 543; // แปลงเป็น พ.ศ.
                            return `${day}/${month}/${year}`;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-2 text-xs text-[var(--muted)]">
              * ข้อมูลดึงจากฐานข้อมูลจริง (Holiday)
            </p>
          </div>
        </aside>
      </div>
      <LeaveHistoryModal
        open={openHistory}
        onClose={() => setOpenHistory(false)}
        items={history}
      />
    </main>
  );
}

/* ---------- Reusable Input ---------- */
function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        required={required}
        className={`neon-input w-full rounded-xl p-3 ${
          readOnly ? "opacity-70" : ""
        }`}
      />
    </label>
  );
}
  function EntBox({
    title,
    data,
    k,
  }: {
    title: string;
    data: {
      entitled:  {
        vacation:number; business:number; sick:number;
        ordainDays:number; maternity:number; birthday:number; unpaid:number;
        annualHolidays:number;
      };
      used:      {
        vacation:number; business:number; sick:number;
        ordainDays:number; maternity:number; birthday:number; unpaid:number;
        annualHolidays:number;
      };
      remaining: {
        vacation:number; business:number; sick:number;
        ordainDays:number; maternity:number; birthday:number; unpaid:number;
        annualHolidays:number;
      };
    };
    k:
      | "vacation"
      | "business"
      | "sick"
      | "ordainDays"
      | "maternity"
      | "birthday"
      | "unpaid"
      | "annualHolidays";
  }) {
      const total = data.entitled[k] ?? 0;
      const used  = data.used[k] ?? 0;
      const left  = data.remaining[k] ?? Math.max(0, total - used);
      const pct   = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

      return (
        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-1 text-sm opacity-80">{title}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{left}</span>
            {/* <span className="text-xs text-[var(--muted)]">เหลือ / ทั้งหมด {total}</span> */}
          </div>
          <div className="mt-2 h-2 w-full rounded bg-white/10">
            <div
              className="h-2 rounded bg-[var(--cyan)]"
              style={{ width: `${pct}%` }}
              aria-label={`${pct}% used`}
            />
          </div>
          <div className="mt-2 text-xs text-[var(--muted)]">ใช้ไป {used}</div>
        </div>
      );
    }

