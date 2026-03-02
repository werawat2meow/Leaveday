"use client";

import LeaveHistoryModal, {
  LeaveHistoryItem,
} from "@/components/LeaveHistoryModal";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale/th";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("th", th);

type LeaveKind =
  | "ANNUAL"
  | "SICK"
  | "BUSINESS"
  | "UNPAID"
  | "BIRTHDAY"
  | "ORDAIN"
  | "MATERNITY"
  | "SHIFT_CHANGE"
  | "HOLIDAY_CHANGE"
  | "OT"
  | "ANNUAL_HOLIDAY";

// รายการปุ่มที่จะแสดงใน UI
const LEAVE_TYPES: Array<{ label: string; kind: LeaveKind }> = [
  { label: "Annual Leave", kind: "ANNUAL" },
  { label: "Sick Leave", kind: "SICK" },
  { label: "Personal Leave", kind: "BUSINESS" }, // (= Business)
  { label: "Leave without Pay", kind: "UNPAID" },
  { label: "Birthday Leave", kind: "BIRTHDAY" },
  { label: "Monkhood Leave", kind: "ORDAIN" },
  { label: "Maternity Leave", kind: "MATERNITY" },
  { label: "Public Holiday Leave", kind: "ANNUAL_HOLIDAY" }, // ลาโดยใช้วันหยุดประจำปี
  // ซ่อนไว้ก่อน - ยังไม่มีการใช้งาน
  // { label: "Shift Change",        kind: "SHIFT_CHANGE" },
  // { label: "Holiday Change",      kind: "HOLIDAY_CHANGE" },
  // { label: "OT",                  kind: "OT" },
];

type EmployeeForm = {
  Nametitle?: string;
  empNo?: string;
  name?: string;
  position?: string;
  section?: string;
  department?: string;
  division?: string; // เพิ่มฟิลด์ division
  org?: string; // เพิ่มฟิลด์ org
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
    email?: string | null;
    prefix?: string | null;
    firstName: string;
    lastName: string;
    position?: string | null;
    section?: string | null;
    department?: string | null;
    levelP?: string | null;
    idCard?: string | null;
    photoUrl?: string | null;
    startDate?: string | null;
  };
  rights: {
    levelFrom: string | null;
    entitled: {
      vacation: number;
      business: number;
      sick: number;
      ordainDays: number;
      maternity: number;
      birthday: number;
      unpaid: number;
      annualHolidays: number;
    };
    used: {
      vacation: number;
      business: number;
      sick: number;
      ordainDays: number;
      maternity: number;
      birthday: number;
      unpaid: number;
      annualHolidays: number;
    };
    remaining: {
      vacation: number;
      business: number;
      sick: number;
      ordainDays: number;
      maternity: number;
      birthday: number;
      unpaid: number;
      annualHolidays: number;
    };
  };
} | null;

export default function LeavePage() {
  function formatThaiDateDMY(input: string | Date) {
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(+d)) return String(input);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear() + 543;
    return `${day}/${month}/${year}`;
  }

  // ประกาศ state me ก่อน useEffect leaveUsed
  const [me, setMe] = useState<MeResponse>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  // เพิ่ม state สำหรับ leaveUsed
  const [leaveUsed, setLeaveUsed] = useState<any>(null);
  const [loadingLeaveUsed, setLoadingLeaveUsed] = useState(false);
  const [leaveUsedError, setLeaveUsedError] = useState<string | null>(null);

  // ดึง leave summary (ยอดใช้วันลาแต่ละประเภท)
  async function fetchLeaveUsed() {
    if (!me) return;
    setLoadingLeaveUsed(true);
    setLeaveUsedError(null);
    try {
      const res = await fetch("/api/leaves/summary", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setLeaveUsed(null);
        setLeaveUsedError(`โหลดข้อมูลการใช้วันลาไม่สำเร็จ (${res.status})`);
        return;
      }
      const raw = await res.json();
      setLeaveUsed(raw?.data ?? null);
      console.log("leaveUsed", raw?.data);
    } catch (e: any) {
      setLeaveUsed(null);
      setLeaveUsedError(
        e?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลการใช้วันลา"
      );
    } finally {
      setLoadingLeaveUsed(false);
    }
  }
  useEffect(() => {
    if (!me) return;
    fetchLeaveUsed();
  }, [me]);

  const router = useRouter();
  const [openHistory, setOpenHistory] = useState(false);
  const [history, setHistory] = useState<LeaveHistoryItem[]>([]);
  const [editingLeaveId, setEditingLeaveId] = useState<number | null>(null);
  const [loadingEditingLeave, setLoadingEditingLeave] = useState(false);

  // ...existing code...
  // กรองประเภทการลาให้เหมาะสมกับเพศและสิทธิ
  function getFilteredLeaveTypes() {
    let filtered = LEAVE_TYPES;
    if (isMale) {
      filtered = filtered.filter((t) => t.kind !== "MATERNITY");
    }
    if (isFemale) {
      filtered = filtered.filter((t) => t.kind !== "ORDAIN");
    }
    if (myLeaveRights) {
      filtered = filtered.filter((t) => {
        if (t.kind === "MATERNITY")
          return (myLeaveRights.maternityLeaveDays ?? 0) > 0;
        if (t.kind === "ORDAIN")
          return (myLeaveRights.ordainLeaveDays ?? 0) > 0;
        // ไม่กรอง ANNUAL ออก ให้แสดงปุ่มเสมอ
        if (t.kind === "SICK") return (myLeaveRights.sickLeaveDays ?? 0) > 0;
        if (t.kind === "BUSINESS")
          return (myLeaveRights.businessLeaveDays ?? 0) > 0;
        if (t.kind === "BIRTHDAY")
          return (myLeaveRights.birthdayLeaveDays ?? 0) > 0;
        if (t.kind === "UNPAID")
          return (myLeaveRights.unpaidLeaveDays ?? 0) > 0;
        if (t.kind === "ANNUAL_HOLIDAY")
          return (myLeaveRights.holidayLeaveDays ?? 0) > 0;
        return true;
      });
    }
    return filtered;
  }
  

  useEffect(() => {
    if (!openHistory) return;
    (async () => {
      try {
        console.log("🔄 Fetching leave history..."); // เพิ่ม debug

        const res = await fetch("/api/leaves", { credentials: "include" });
        const json = await res.json();

        console.log("📋 API Response:", json); // เพิ่ม debug
        console.log("📋 Is array?", Array.isArray(json.data)); // เพิ่ม debug

        if (Array.isArray(json.data)) {
          console.log("📋 Raw data:", json.data); // เพิ่ม debug

          setHistory(
            json.data.map((l: any, idx: number) => {
              console.log(`📋 Item ${idx}:`, l); // เพิ่ม debug
              return {
                id: l.id,
                no: idx + 1,
                type: l.kind,
                range: `${new Date(l.startDate).toLocaleDateString(
                  "th-TH"
                )} - ${new Date(l.endDate).toLocaleDateString("th-TH")}`,
                from: l.startDate,
                to: l.endDate,
                approverComment: l.approverComment ?? "",
                approver: l.approver?.name ?? "",
                status:
                  l.status === "APPROVED"
                    ? "approved"
                    : l.status === "REJECTED"
                    ? "rejected"
                    : l.status === "CANCELLED"
                    ? "cancelled"
                    : "pending",
                days: l.requestedDays,
              };
            })
          );
        } else {
          console.log("❌ API response is not array format"); // เพิ่ม debug
        }
      } catch (e) {
        console.error("❌ Error fetching leave history:", e); // เพิ่ม debug
        setHistory([]);
      }
    })();
  }, [openHistory]);

  async function fetchLeaveDetailForEdit(leaveId: number) {
    setLoadingEditingLeave(true);
    try {
      const res = await fetch(`/api/leaves/${leaveId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.error || `โหลดข้อมูลใบลาไม่สำเร็จ (${res.status})`
        );
      }

      const l = json.data;
      if (!l) throw new Error("ไม่พบข้อมูลใบลา");
      if (l.status !== "PENDING") {
        throw new Error("แก้ไขได้เฉพาะรายการที่เป็น PENDING เท่านั้น");
      }

      setEditingLeaveId(l.id);
      setLeave((s) => ({
        ...s,
        leaveType: l.kind,
        fromDate: (l.startDate || "").slice(0, 10),
        toDate: (l.endDate || "").slice(0, 10),
        session: l.sessionLabel || s.session,
        reason: l.reason ?? "",
        contact: l.contact ?? "",
        handoverTo: l.handoverTo ?? "",
        approverId: l.approverId ?? s.approverId,
      }));
    } finally {
      setLoadingEditingLeave(false);
    }
  }

  async function cancelPendingLeaveForAudit() {
    if (typeof editingLeaveId !== "number") return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/leaves/${editingLeaveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `ยกเลิกคำขอไม่สำเร็จ (${res.status})`);
      }

      alert("ยกเลิกคำขอเรียบร้อย");
      setEditingLeaveId(null);
      // ปล่อยให้ผู้ใช้กดเปิดประวัติอีกครั้งเพื่อดูสถานะล่าสุด

      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "ยกเลิกคำขอไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  const [emp, setEmp] = useState<EmployeeForm>({
    Nametitle: "นาย",
    email: "",
    idCard: "",
  });
  // ตรวจสอบเพศจาก Nametitle (รองรับไทย/อังกฤษ) - ต้องอยู่หลังประกาศ emp
  const nametitle = (emp?.Nametitle ?? "").trim().toLowerCase();
  const isMale = ["นาย", "mr.", "mister"].includes(nametitle);
  const isFemale = ["นาง", "นางสาว", "mrs.", "miss", "ms."].includes(nametitle);

  const [leave, setLeave] = useState<LeaveForm>({ session: "Full Day" });
  const [submitting, setSubmitting] = useState(false);
  const [agree, setAgree] = useState(false);

  const [blackoutChecking, setBlackoutChecking] = useState(false);
  const [blackoutError, setBlackoutError] = useState<string | null>(null);

  useEffect(() => {
    const kind = leave.leaveType;
    const startDate = leave.fromDate;
    const endDate = leave.toDate;

    if (!kind || !startDate || !endDate) {
      setBlackoutError(null);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(+start) || isNaN(+end) || start > end) {
      setBlackoutError(null);
      return;
    }

    const ctrl = new AbortController();
    (async () => {
      try {
        setBlackoutChecking(true);
        const res = await fetch("/api/blackouts/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ctrl.signal,
          body: JSON.stringify({ kind, startDate, endDate }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          setBlackoutError(null);
          return;
        }
        if (json.conflict) setBlackoutError(json.message || "ช่วงวันที่เลือกถูกปิดรับการลา");
        else setBlackoutError(null);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setBlackoutError(null);
      } finally {
        setBlackoutChecking(false);
      }
    })();

    return () => {
      if (!ctrl.signal.aborted) ctrl.abort();
    };
  }, [leave.leaveType, leave.fromDate, leave.toDate]);

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

  const isEditingMode = typeof editingLeaveId === "number";

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
    if (blackoutError) return blackoutError;

    // เช็คอายุงานสำหรับลาประจำปี (ANNUAL)
    if (leave.leaveType === "ANNUAL" && me && me.employee.startDate) {
      const startDate = new Date(me.employee.startDate);
      const now = new Date();
      const diffYears =
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (diffYears < 1) {
        return "อายุงานยังไม่ครบ 1 ปี ไม่สามารถลาประจำปีได้";
      }
    }

    // Annual Holiday: ใช้ได้เฉพาะยอดยก + สิทธิ์ปีนี้ที่ปลดล็อคตามวันหยุดที่ผ่านแล้ว
    if (leave.leaveType === "ANNUAL_HOLIDAY" && leaveUsed) {
      const availableNow = Number(
        leaveUsed?.holidayAvailableNow ?? leaveUsed?.totalRemainHoliday ?? 0
      );
      if (availableNow < totalDays) {
        return `Annual Holiday ใช้ได้ไม่พอ ณ ตอนนี้ (ใช้ได้ ${availableNow} วัน)`;
      }
    }

    // เช็คสิทธิวันลาคงเหลือ
    if (leave.leaveType && leaveUsed && leave.leaveType !== "ANNUAL_HOLIDAY") {
      const used = leaveUsed[leave.leaveType] ?? 0;
      const rightsField = getLeaveRightsField(leave.leaveType);
      const rights = myLeaveRights ? myLeaveRights[rightsField] ?? 0 : 0;
      if (rights - used < totalDays) {
        return "วันลาประเภทนี้หมดสิทธิ ไม่สามารถลาเกินจำนวนที่กำหนด";
      }
    }
    return "";
  }

  // ใช้สำหรับโชว์บนการ์ดสิทธิ: นับเฉพาะ APPROVED (ไม่รวม PENDING)
  function usedApprovedOnly(kind: LeaveKind) {
    const byKind = leaveUsed?.usedApprovedOnlyByKind as
      | Record<string, number>
      | undefined;

    if (kind === "ANNUAL") {
      return Number(
        leaveUsed?.usedAnnualApprovedOnly ?? byKind?.ANNUAL ?? 0
      );
    }
    if (kind === "ANNUAL_HOLIDAY") {
      return Number(
        leaveUsed?.usedHolidayApprovedOnly ?? byKind?.ANNUAL_HOLIDAY ?? 0
      );
    }
    return Number(byKind?.[kind] ?? 0);
  }

  // ใช้สำหรับโชว์ "คงเหลือ" บนการ์ด: prefer DB-backed LeaveRights (APPROVED ถูกหักแล้ว)
  function remainingFromDb(kind: LeaveKind) {
    const remaining = (leaveUsed?.remainingByKind as
      | Record<string, number>
      | undefined)?.[kind];
    return remaining === undefined ? null : Number(remaining);
  }

  function getSessionLabel(s?: LeaveForm["session"]) {
    return s || "Full Day";
  }
  async function uploadIfAny(file: File | null | undefined) {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
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
      // ถ้าแก้ไขแล้วไม่ได้เลือกไฟล์ใหม่ จะไม่ส่ง attachmentUrl ไปทับของเดิม
      const attachmentUrl = leave.attachment
        ? await uploadIfAny(leave.attachment ?? null)
        : null;

      const payload: any = {
        kind: leave.leaveType, // "ANNUAL" | "SICK" | ...
        startDate: leave.fromDate,
        endDate: leave.toDate,
        sessionLabel: getSessionLabel(leave.session), // "Full Day" | "Morning (Half)" | "Afternoon (Half)"
        reason: leave.reason ?? "",
        contact: leave.contact ?? "",
        handoverTo: leave.handoverTo ?? "",
        ...(attachmentUrl ? { attachmentUrl } : {}),
        approverId: leave.approverId,
      };

      const isEditing = typeof editingLeaveId === "number";
      const url = isEditing ? `/api/leaves/${editingLeaveId}` : "/api/leaves";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || "ส่งคำขอลาไม่สำเร็จ");

      alert(isEditing ? "อัปเดตคำขอลาสำเร็จ" : "ส่งคำขอลาสำเร็จ");
      await fetchLeaveUsed(); // อัพเดทสิทธิวันลาแบบทันที
      setLeave({ session: "Full Day" }); // เคลียร์ข้อมูลฟอร์มลา
      setEditingLeaveId(null);
      router.push("/dashboard");
    } catch (e: any) {
      alert(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  const [allRights, setAllRights] = useState<
    Array<{ level: string; vacation: number; business: number; sick: number }>
  >([]);
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
        console.log("leave-rights API raw:", raw);
        setAllRights(
          (raw?.data || []).map((r: any) => ({
            level: r.prefix ?? r.level ?? "",
            vacation:
              r.vacationLeaveDays ?? r.annualLeaveDays ?? r.vacation ?? 0,
            business: r.businessLeaveDays ?? r.business ?? 0,
            sick: r.sickLeaveDays ?? r.sick ?? 0,
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

  const [holidays, setHolidays] = useState<
    Array<{ id: number; title: string; date: string; note?: string | null }>
  >([]);
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

  // Leave rights template ตาม Level P
  const [myLeaveRights, setMyLeaveRights] = useState<any>(null);
  const [loadingMyLeaveRights, setLoadingMyLeaveRights] = useState(false);
  const [myLeaveRightsError, setMyLeaveRightsError] = useState<string | null>(
    null
  );

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

        setEmp((s) => ({
          ...s,
          Nametitle: raw.employee.prefix ?? s.Nametitle ?? "",
          empNo: raw.employee.empNo ?? s.empNo ?? "",
          name: `${raw.employee.firstName ?? ""} ${raw.employee.lastName ?? ""}`.trim(),
          org: raw.employee.org ?? s.org ?? "", // ดึงข้อมูล org
          department: raw.employee.department ?? s.department ?? "",
          division: raw.employee.division ?? s.division ?? "", // ดึงข้อมูล division
          LevelP: raw.employee.levelP ?? s.LevelP ?? "",
          email: raw.employee.email ?? s.email,
          idCard: raw.employee.idCard ?? s.idCard,
          photoUrl: raw.employee.photoUrl ?? s.photoUrl,
        }));

        setMe(raw);

        // ดึง leave rights template ตาม Level P
        if (raw.employee.levelP) {
          setLoadingMyLeaveRights(true);
          setMyLeaveRightsError(null);
          try {
            const res2 = await fetch(
              `/api/leave-rights?prefix=${raw.employee.levelP}`,
              {
                signal: ctrl.signal,
                cache: "no-store",
              }
            );
            if (!res2.ok) {
              setMyLeaveRights(null);
              setMyLeaveRightsError(`โหลดสิทธิวันลาไม่สำเร็จ (${res2.status})`);
            } else {
              const raw2 = await res2.json();
              setMyLeaveRights(raw2?.data ?? null);
            }
          } catch (e: any) {
            if (ctrl.signal.aborted || e?.name === "AbortError") return;
            setMyLeaveRights(null);
            setMyLeaveRightsError(
              e?.message || "เกิดข้อผิดพลาดในการโหลดสิทธิวันลา"
            );
          } finally {
            setLoadingMyLeaveRights(false);
          }
        }
      } catch (e: any) {
        if (ctrl.signal.aborted || e?.name === "AbortError") return;
        console.error(e);
        setMe(null);
        setMeError(e?.message || "เกิดข้อผิดพลาด");
      } finally {
        setLoadingMe(false);
      }
    })();
    return () => {
      if (!ctrl.signal.aborted) ctrl.abort();
    };
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
        // normalize + dedupe by id
        const arr = (raw?.data || []) as ApproverOption[];
        const map = new Map<number, ApproverOption>();
        for (const a of arr) {
          const id = Number(a.id);
          if (!map.has(id)) map.set(id, { ...a, id });
        }
        const list = Array.from(map.values());

        // ถ้ามีพนักงาน (me) และพนักงานมี approvers ที่ผูกไว้ ให้แสดงเฉพาะผู้อนุมัติที่ผูกไว้
        const assigned = (me?.employee as any)?.approvers ?? [];
        let visibleList = list;
        if (Array.isArray(assigned) && assigned.length > 0) {
          const assignedIds = assigned.map((a: any) => Number(a.id));
          visibleList = list.filter((p) => assignedIds.includes(Number(p.id)));
        }

        setApprovers(visibleList);

        // ถ้ายังไม่ได้เลือก approverId: ให้ตั้ง default เฉพาะเมื่อพนักงานมี assigned และ visibleList มีรายการ
        if (!leave.approverId && Array.isArray(assigned) && assigned.length > 0 && visibleList.length > 0) {
          const pick = visibleList[0];
          setLeave((s) => ({
            ...s,
            approverId: pick.id,
            handoverTo: pick.name ?? s.handoverTo,
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
  }, [me, leave.approverId]); // ให้รันเมื่อ me พร้อม หรือ approverId เปลี่ยน

  return (
    <main className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="flex justify-end gap-2">
          <a
            href="/manual/user.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="
              rounded-xl px-4 py-2 font-extrabold
              bg-rose-600 text-white
              shadow-[0_10px_28px_rgba(244,63,94,0.35)]
              hover:bg-rose-500
              hover:shadow-[0_14px_36px_rgba(244,63,94,0.45)]
              focus:outline-none focus:ring-2 focus:ring-rose-400/60
              active:translate-y-[1px]
              transition
            "
          >
            คู่มือการใช้งาน
          </a>

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

      <div className="mx-auto max-w-6xl px-2 sm:px-4 py-6 grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* ฝั่งซ้าย: ข้อมูลพนักงาน + ประเภทการลา + ช่วงวัน */}
        <section className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* ข้อมูลพนักงาน */}
          <div className="neon-card rounded-2xl p-3 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="neon-title text-base sm:text-lg font-semibold break-words">
                ข้อมูลพนักงาน
              </h2>
            </div>

            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
              <Input
                label="รหัสพนักงาน (EMP No.)"
                value={emp.empNo ?? ""}
                readOnly
              />
              <Input
                label="วันที่ยื่น (Auto)"
                value={new Date().toLocaleDateString("th-TH")}
                readOnly
              />

              {/* ✅ เพิ่มคำนำหน้าชื่อ */}
              <Input
                label="คำนำหน้าชื่อ"
                value={emp.Nametitle ?? ""}
                readOnly
              />
              <Input label="ชื่อ - สกุล" value={emp.name ?? ""} readOnly />

              <Input label="Email" value={emp.email ?? ""} readOnly />
              <Input label="เลขบัตรประชาชน" value={emp.idCard ?? ""} readOnly />

              <Input label="สังกัด" value={emp.org ?? ""} readOnly /> {/* ดึงข้อมูลจาก org */}
              <Input label="แผนก" value={emp.department ?? ""} readOnly /> {/* ดึงข้อมูลจาก department */}
              <Input label="ฝ่าย" value={emp.division ?? ""} readOnly /> {/* ดึงข้อมูลจาก division */}
              <Input label="Level P" value={emp.LevelP ?? ""} readOnly />

              {/* ถ้ามีรูปภาพ */}
              {/* <img
                src={emp.photoUrl ?? ""}
                alt="Employee Photo"
                className="h-16 w-16 rounded-lg object-cover border border-white/10"
              /> */}
            </div>

            {meError && <p className="text-xs text-red-400 mt-2">{meError}</p>}
          </div>

          {/* ประเภทการลา */}
          <div className="neon-card rounded-2xl p-3 sm:p-5">
            <h2 className="neon-title mb-3 text-base sm:text-lg font-semibold break-words leading-tight">
              ประเภทการลา
            </h2>
            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
              {getFilteredLeaveTypes().map((t) => (
                <label
                  key={t.kind}
                  className={`rounded-xl border border-white/10 p-3 cursor-pointer transition ${
                    leave.leaveType === t.kind
                      ? "bg-[var(--input)] ring-2 ring-[var(--cyan)]"
                      : "bg-transparent hover:bg-white/5"
                  }`}
                >
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
            className="neon-card rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4"
          >
            <h2 className="neon-title mb-1 text-base sm:text-lg font-semibold break-words leading-tight">
              รายละเอียดการลา
            </h2>

            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
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

            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3">
              {["Full Day", "Morning (Half)", "Afternoon (Half)"].map((s) => (
                <label
                  key={s}
                  className={`rounded-xl border border-white/10 p-2 sm:p-3 cursor-pointer text-sm sm:text-base ${
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

            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
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
                      const selected =
                        approvers.find((a) => a.id === id) || null;
                      setLeave((s) => ({
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

            {blackoutError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/25 dark:text-rose-200">
                {blackoutError}
              </div>
            ) : blackoutChecking ? (
              <div className="text-sm text-[var(--muted)]">กำลังตรวจสอบวันปิด…</div>
            ) : null}

            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-xl px-4 py-2 bg-amber-500 text-[#001418] shadow-[0_10px_28px_rgba(250,204,21,0.18)] hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60 text-sm sm:text-base order-2 sm:order-1"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submitting || !leave.leaveType || blackoutChecking || !!blackoutError}
                className="rounded-xl px-4 sm:px-5 py-2 font-semibold bg-[var(--cyan)] text-[#001418] shadow-[0_10px_28px_var(--cyan-soft)] disabled:opacity-50 text-sm sm:text-base order-1 sm:order-2 whitespace-nowrap"
              >
                {submitting
                  ? "กำลังส่ง..."
                  : isEditingMode
                  ? "อัปเดตคำขอลา"
                  : "ส่งคำขอลา"}
              </button>

              {isEditingMode ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={cancelPendingLeaveForAudit}
                  className="rounded-xl px-4 py-2 bg-rose-600 text-white hover:bg-rose-500 shadow-[0_10px_28px_rgba(244,63,94,0.35)] focus:outline-none focus:ring-2 focus:ring-rose-400/60 text-sm sm:text-base order-3"
                >
                  ยกเลิกคำขอลา
                </button>
              ) : null}
            </div>
          </form>
        </section>

        {/* ฝั่งขวา: สิทธิวันลา + วันหยุดประจำปี */}
        <aside className="space-y-4 sm:space-y-6">
          <div className="neon-card rounded-2xl p-5">
            <h2 className="neon-title mb-3 text-lg font-semibold">
              สิทธิวันลา (ทุกระดับ)
            </h2>
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
                    {[...allRights]
                      .sort((a, b) => {
                        // สมมติ level เป็น P2, P3, ... P7
                        // เอาเลขหลัง P มาเทียบ (มากสุดก่อน)
                        const numA =
                          parseInt(
                            (a.level ?? "P0").replace(/[^0-9]/g, ""),
                            10
                          ) || 0;
                        const numB =
                          parseInt(
                            (b.level ?? "P0").replace(/[^0-9]/g, ""),
                            10
                          ) || 0;
                        return numB - numA;
                      })
                      .map((r) => (
                        <tr
                          key={r.level}
                          className="odd:bg-gray-50 even:bg-white dark:odd:bg-white/5 dark:even:bg-white/0"
                        >
                          <td className="px-3 py-2">
                            <span translate="no">{`P${r.level.replace(
                              /[^0-9]/g,
                              ""
                            )}`}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.vacation}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.business}
                          </td>
                          <td className="px-3 py-2 text-center">{r.sick}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* สิทธิวันลาของฉัน (ปี xxxx) */}
          {me && (
            <div className="neon-card rounded-2xl p-5">
              <h2 className="neon-title mb-3 text-lg font-semibold">
                สิทธิวันลาของฉัน (ปี {new Date().getFullYear() + 543})
              </h2>

              {loadingMyLeaveRights || loadingLeaveUsed ? (
                <p className="text-sm text-[var(--muted)]">
                  กำลังโหลดสิทธิวันลา...
                </p>
              ) : myLeaveRightsError ? (
                <p className="text-sm text-red-400">{myLeaveRightsError}</p>
              ) : leaveUsedError ? (
                <p className="text-sm text-red-400">{leaveUsedError}</p>
              ) : myLeaveRights ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <EntBox
                      title="Sick"
                      data={{
                        entitled: {
                          vacation: 0,
                          business: 0,
                          sick: myLeaveRights.sickLeaveDays ?? 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        used: {
                          vacation: 0,
                          business: 0,
                          sick: usedApprovedOnly("SICK"),
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        remaining: {
                          vacation: 0,
                          business: 0,
                          sick:
                            remainingFromDb("SICK") ??
                            (myLeaveRights.sickLeaveDays ?? 0) -
                              usedApprovedOnly("SICK"),
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                      }}
                      k="sick"
                    />

                    <EntBox
                      title="Business"
                      data={{
                        entitled: {
                          vacation: 0,
                          business: myLeaveRights.businessLeaveDays ?? 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        used: {
                          vacation: 0,
                          business: usedApprovedOnly("BUSINESS"),
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        remaining: {
                          vacation: 0,
                          business:
                            remainingFromDb("BUSINESS") ??
                            (myLeaveRights.businessLeaveDays ?? 0) -
                              usedApprovedOnly("BUSINESS"),
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                      }}
                      k="business"
                    />

                    <EntBox
                      title="Annual"
                      data={{
                        entitled: {
                          vacation: myLeaveRights.vacationLeaveDays ?? 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        used: {
                          vacation: usedApprovedOnly("ANNUAL"),
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        remaining: {
                          vacation:
                            (myLeaveRights.vacationLeaveDays ?? 0) -
                            usedApprovedOnly("ANNUAL"),
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                      }}
                      k="vacation"
                    />

                    <EntBox
                      title="Holidays"
                      data={{
                        entitled: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: myLeaveRights.holidayLeaveDays ?? 0,
                        },
                        used: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays: usedApprovedOnly("ANNUAL_HOLIDAY"),
                        },
                        remaining: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: 0,
                          annualHolidays:
                            leaveUsed?.holidayAvailableNowApprovedOnly ??
                            leaveUsed?.remainHolidayLeaveApprovedOnly ??
                            (myLeaveRights.holidayLeaveDays ?? 0) -
                            (leaveUsed?.ANNUAL_HOLIDAY ?? 0),
                        },
                      }}
                      k="annualHolidays"
                    />

                    <EntBox
                      title="Unpaid"
                      data={{
                        entitled: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: myLeaveRights.unpaidLeaveDays ?? 0,
                          annualHolidays: 0,
                        },
                        used: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid: usedApprovedOnly("UNPAID"),
                          annualHolidays: 0,
                        },
                        remaining: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: 0,
                          unpaid:
                            remainingFromDb("UNPAID") ??
                            (myLeaveRights.unpaidLeaveDays ?? 0) -
                              usedApprovedOnly("UNPAID"),
                          annualHolidays: 0,
                        },
                      }}
                      k="unpaid"
                    />

                    <EntBox
                      title="Birthday"
                      data={{
                        entitled: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: myLeaveRights.birthdayLeaveDays ?? 0,
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        used: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday: usedApprovedOnly("BIRTHDAY"),
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                        remaining: {
                          vacation: 0,
                          business: 0,
                          sick: 0,
                          ordainDays: 0,
                          maternity: 0,
                          birthday:
                            remainingFromDb("BIRTHDAY") ??
                            (myLeaveRights.birthdayLeaveDays ?? 0) -
                              usedApprovedOnly("BIRTHDAY"),
                          unpaid: 0,
                          annualHolidays: 0,
                        },
                      }}
                      k="birthday"
                    />

                    {isMale && (
                      <EntBox
                        title="Ordain"
                        data={{
                          entitled: {
                            vacation: 0,
                            business: 0,
                            sick: 0,
                            ordainDays: myLeaveRights.ordainLeaveDays ?? 0,
                            maternity: 0,
                            birthday: 0,
                            unpaid: 0,
                            annualHolidays: 0,
                          },
                          used: {
                            vacation: 0,
                            business: 0,
                            sick: 0,
                            ordainDays: usedApprovedOnly("ORDAIN"),
                            maternity: 0,
                            birthday: 0,
                            unpaid: 0,
                            annualHolidays: 0,
                          },
                          remaining: {
                            vacation: 0,
                            business: 0,
                            sick: 0,
                            ordainDays:
                              remainingFromDb("ORDAIN") ??
                              (myLeaveRights.ordainLeaveDays ?? 0) -
                                usedApprovedOnly("ORDAIN"),
                            maternity: 0,
                            birthday: 0,
                            unpaid: 0,
                            annualHolidays: 0,
                          },
                        }}
                        k="ordainDays"
                      />
                    )}

                    {isFemale && (
                      <EntBox
                        title="Maternity"
                        data={{
                          entitled: {
                            vacation: 0,
                            business: 0,
                            sick: 0,
                            ordainDays: 0,
                            maternity: myLeaveRights.maternityLeaveDays ?? 0,
                            birthday: 0,
                            unpaid: 0,
                            annualHolidays: 0,
                          },
                          used: {
                            vacation: 0,
                            business: 0,
                            sick: 0,
                            ordainDays: 0,
                            maternity: usedApprovedOnly("MATERNITY"),
                            birthday: 0,
                            unpaid: 0,
                            annualHolidays: 0,
                          },
                          remaining: {
                            vacation: 0,
                            business: 0,
                            sick: 0,
                            ordainDays: 0,
                            maternity:
                              remainingFromDb("MATERNITY") ??
                              (myLeaveRights.maternityLeaveDays ?? 0) -
                                usedApprovedOnly("MATERNITY"),
                            birthday: 0,
                            unpaid: 0,
                            annualHolidays: 0,
                          },
                        }}
                        k="maternity"
                      />
                    )}
                  </div>
                  {leaveUsed?.carryForwardAnnual > 0 && (
                    <div className="mt-2 text-xs text-yellow-400">
                      ยอดยกลาพักร้อนจากปีที่แล้ว: {leaveUsed.carryForwardAnnual}{" "}
                      วัน
                      {leaveUsed.carryForwardAnnualExpiry && (
                        <>
                          {" "}
                          (หมดอายุ:{" "}
                          {formatThaiDateDMY(leaveUsed.carryForwardAnnualExpiry)}
                          )
                        </>
                      )}
                    </div>
                  )}
                  {leaveUsed?.carryForwardHoliday > 0 && (
                    <div className="mt-2 text-xs text-yellow-400">
                      ยอดยกวันหยุดพิเศษจากปีที่แล้ว:{" "}
                      {leaveUsed.carryForwardHoliday} วัน
                      {leaveUsed.carryForwardHolidayExpiry && (
                        <>
                          {" "}
                          (หมดอายุ:{" "}
                          {formatThaiDateDMY(leaveUsed.carryForwardHolidayExpiry)}
                          )
                        </>
                      )}
                    </div>
                  )}
                  {/* แสดงยอดคงเหลือรวมตาม business logic ใหม่ */}
                  <div className="mt-2 text-sm text-cyan-400">
                    พักร้อนคงเหลือ: {leaveUsed?.totalRemainAnnual !== undefined
                      ? Number(leaveUsed.totalRemainAnnual).toFixed(1)
                      : "-"} วัน
                    {leaveUsed?.remainCarryForwardAnnual > 0
                      ? " (ยอดยก)"
                      : leaveUsed?.remainVacationLeave > 0
                      ? " (สิทธิ์ปีนี้)"
                      : ""}
                  </div>
                  <div className="mt-2 text-sm text-cyan-400">
                    วันหยุดพิเศษคงเหลือ: {leaveUsed?.holidayAvailableNow !== undefined
                      ? Number(leaveUsed.holidayAvailableNow).toFixed(1)
                      : leaveUsed?.totalRemainHoliday !== undefined
                      ? Number(leaveUsed.totalRemainHoliday).toFixed(1)
                      : "-"} วัน
                    {leaveUsed?.remainCarryForwardHoliday > 0
                      ? " (ยอดยก)"
                      : leaveUsed?.holidayCurrentAccruedRemain > 0
                      ? " (ปลดล็อคแล้วปีนี้)"
                      : ""}
                  </div>

                  {leaveUsed?.holidayAccruedThisYear !== undefined && (
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      Holiday ปีนี้ปลดล็อคแล้ว: {leaveUsed.holidayAccruedThisYear} วัน (จากวันหยุดที่ประกาศผ่านมาแล้ว)
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  ไม่พบสิทธิวันลาตามระดับของคุณ
                </p>
              )}

              {me.employee.levelP && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  อิงสิทธิ์จากระดับ (Level P): <b>{me.employee.levelP}</b>
                </p>
              )}
            </div>
          )}

          {/* ตารางวันหยุดประจำปี */}
          <div className="neon-card rounded-2xl p-5">
            <h2 className="neon-title mb-3 text-lg font-semibold">
              วันหยุดประจำปี (Public Holidays)
            </h2>
            {loadingHolidays ? (
              <p className="text-sm text-[var(--muted)]">กำลังโหลดวันหยุด...</p>
            ) : holidaysError ? (
              <p className="text-sm text-red-400">{holidaysError}</p>
            ) : holidays.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">ไม่มีข้อมูลวันหยุด</p>
            ) : (
              <div className="overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">ชื่อวันหยุด</th>
                      <th className="px-3 py-2 text-left">วันที่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.map((h, idx) => (
                      <tr key={h.id} className="odd:bg-white/0 even:bg-white/5">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{h.title}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const d = new Date(h.date);
                            if (isNaN(+d)) return h.date;
                            const day = d.getDate().toString().padStart(2, "0");
                            const month = (d.getMonth() + 1)
                              .toString()
                              .padStart(2, "0");
                            const year = d.getFullYear() + 543;
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
        onSelectPending={async (item) => {
          if (!item?.id) return;
          await fetchLeaveDetailForEdit(item.id);
          setOpenHistory(false);
        }}
      />
    </main>
  );
}

function getLeaveRightsField(leaveType: string) {
  switch (leaveType) {
    case "ANNUAL":
      return "vacationLeaveDays";
    case "SICK":
      return "sickLeaveDays";
    case "BUSINESS":
      return "businessLeaveDays";
    case "UNPAID":
      return "unpaidLeaveDays";
    case "BIRTHDAY":
      return "birthdayLeaveDays";
    case "ORDAIN":
      return "ordainLeaveDays";
    case "MATERNITY":
      return "maternityLeaveDays";
    case "ANNUAL_HOLIDAY":
      return "holidayLeaveDays";
    default:
      return "";
  }
}

/* ---------- Reusable Input ---------- */
function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  readOnly,
  lang,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  lang?: string;
}) {
  if (type === "date") {
    const selected = value ? parseISO(value as string) : null;
    return (
      <label className="block">
        <span className="mb-1 block text-sm">
          {label}
          {required && <span className="text-red-400"> *</span>}
        </span>
        <DatePicker
          selected={selected}
          onChange={(d: Date | null) =>
            onChange?.(d ? format(d, "yyyy-MM-dd") : "")
          }
          dateFormat="dd/MM/yyyy"
          locale="th"
          placeholderText="dd/MM/yyyy"
          wrapperClassName="w-full"
          className={`neon-input w-full rounded-xl p-3 ${
            readOnly ? "opacity-70" : ""
          }`}
          disabled={readOnly}
        />
      </label>
    );
  }

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
        lang={lang}
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
    entitled: {
      vacation: number;
      business: number;
      sick: number;
      ordainDays: number;
      maternity: number;
      birthday: number;
      unpaid: number;
      annualHolidays: number;
    };
    used: {
      vacation: number;
      business: number;
      sick: number;
      ordainDays: number;
      maternity: number;
      birthday: number;
      unpaid: number;
      annualHolidays: number;
    };
    remaining: {
      vacation: number;
      business: number;
      sick: number;
      ordainDays: number;
      maternity: number;
      birthday: number;
      unpaid: number;
      annualHolidays: number;
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
  const used = data.used[k] ?? 0;
  const left = data.remaining[k] ?? Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div className="rounded-xl border border-white/10 p-2 sm:p-3">
      <div
        className="mb-1 text-xs sm:text-sm opacity-80 truncate"
        title={title}
      >
        {title}
      </div>
      <div className="flex items-baseline gap-1 sm:gap-2">
        <span className="text-lg sm:text-2xl font-bold">{left}</span>
      </div>
      <div className="mt-2 h-1.5 sm:h-2 w-full rounded bg-gray-100 dark:bg-white/10">
        <div
          className="h-1.5 sm:h-2 rounded bg-cyan-500 dark:bg-[var(--cyan)] transition-all"
          style={{ width: `${pct}%` }}
          aria-label={`${pct}% used`}
        />
      </div>
      <div className="mt-2 text-xs text-[var(--muted)]">ใช้ไป {used}</div>
    </div>
  );
}
