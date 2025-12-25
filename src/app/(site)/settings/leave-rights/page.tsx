"use client";
import { useEffect, useState } from "react";

type LeaveRow = {
  id: string;
  level: string;               // P#
  vacation: number | "";
  business: number | "";
  sick: number | "";
  ordain: number | "";
  maternity: number | "";
  unpaid: number | "";
  birthday: number | "";
  annualHoliday: number | "";
};

const makeRow = (pNumber: number): LeaveRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  level: `P${pNumber}`,
  vacation: "",
  business: "",
  sick: "",
  ordain: "",
  maternity: "",
  unpaid: "",
  birthday: "",
  annualHoliday: "",
});

// ดึงเลข P (เช่น "P12" -> 12) ป้องกัน level undefined
const getPnum = (level: string | undefined) => {
  if (!level) return NaN;
  const m = level.match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
};

// หา P ถัดไปจากรายการปัจจุบัน
const nextP = (rows: LeaveRow[]) => {
  const max = rows.reduce((mx, r) => {
    const n = getPnum(r.level);
    return isNaN(n) ? mx : Math.max(mx, n);
  }, 1);
  return max + 1;
};

// จัดเรียงตามเลข P
const sortByP = (rows: LeaveRow[]) =>
  [...rows].sort((a, b) => (getPnum(a.level) || 0) - (getPnum(b.level) || 0));

export default function LeaveRightsPage() {
  const [rows, setRows] = useState<LeaveRow[]>([makeRow(2)]); // เริ่มที่ P2
  const LS_KEY = "leave-rights-rows";
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/leave-rights", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          // map ข้อมูลจาก LeaveRightsTemplate ให้ตรงกับ LeaveRow
          const fromDb = (data?.data ?? []) as Array<{
            id: number;
            prefix: string;
            vacationLeaveDays?: number;
            businessLeaveDays?: number;
            sickLeaveDays?: number;
            ordainLeaveDays?: number;
            maternityLeaveDays?: number;
            unpaidLeaveDays?: number;
            birthdayLeaveDays?: number;
            annualLeaveDays?: number;
          }>;
          if (Array.isArray(fromDb) && fromDb.length > 0) {
            setRows(
              sortByP(
                fromDb.map((r) => ({
                  id: String(r.id), // แปลง id เป็น string
                  level: r.prefix,
                  vacation: r.vacationLeaveDays ?? "",
                  business: r.businessLeaveDays ?? "",
                  sick: r.sickLeaveDays ?? "",
                  ordain: r.ordainLeaveDays ?? "",
                  maternity: r.maternityLeaveDays ?? "",
                  unpaid: r.unpaidLeaveDays ?? "",
                  birthday: r.birthdayLeaveDays ?? "",
                  annualHoliday: r.annualLeaveDays ?? "",
                }))
              )
            );
            return;
          }
        }
      } catch {}
      // fallback localStorage
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as LeaveRow[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRows(sortByP(parsed));
          }
        } catch {}
      }
    })();
  }, []);

  const updateRow = (id: string, patch: Partial<LeaveRow>) => {
    setRows((prev) => sortByP(prev.map((r) => (r.id === id ? { ...r, ...patch } : r))));
  };

  const addRow = () =>
    setRows((prev) => {
      const np = nextP(prev);
      return sortByP([...prev, makeRow(np)]);
    });

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        id: r.id,
        level: r.level.trim(),
        vacation: r.vacation === "" ? 0 : Number(r.vacation),
        business: r.business === "" ? 0 : Number(r.business),
        sick: r.sick === "" ? 0 : Number(r.sick),
        ordain: r.ordain === "" ? 0 : Number(r.ordain),
        maternity: r.maternity === "" ? 0 : Number(r.maternity),
        unpaid: r.unpaid === "" ? 0 : Number(r.unpaid),
        birthday: r.birthday === "" ? 0 : Number(r.birthday),
        annualHoliday: r.annualHoliday === "" ? 0 : Number(r.annualHoliday),
      }));

      localStorage.setItem(LS_KEY, JSON.stringify(rows));
      localStorage.setItem("leave-rights-rows:v1", JSON.stringify(payload));

      const res = await fetch("/api/leave-rights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      if (!res.ok) throw new Error("Save failed");

      const data = await res.json();
      // map ข้อมูลกลับเข้า rows ทันทีหลังบันทึก
      if (data?.data) {
        setRows(
          sortByP(
            data.data.map((r: any) => ({
              id: String(r.id),
              level: r.prefix,
              vacation: r.vacationLeaveDays ?? "",
              business: r.businessLeaveDays ?? "",
              sick: r.sickLeaveDays ?? "",
              ordain: r.ordainLeaveDays ?? "",
              maternity: r.maternityLeaveDays ?? "",
              unpaid: r.unpaidLeaveDays ?? "",
              birthday: r.birthdayLeaveDays ?? "",
              annualHoliday: r.annualLeaveDays ?? "",
            }))
          )
        );
      }
      setToast({ type: "success", msg: data?.message || `บันทึกแล้ว ${payload.length} รายการ` });
    } catch (e) {
      console.error(e);
      setToast({ type: "error", msg: "บันทึกล้มเหลว กรุณาลองใหม่" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <section role="tabpanel" aria-label="สิทธิ์การลาตามตำแหน่ง" className="neon-card rounded-2xl p-6">
      <h2 className="neon-title text-lg font-semibold mb-4">สิทธิ์การลาตามตำแหน่ง</h2>

      <div className="mt-2 space-y-3">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 p-3 shadow-sm md:grid-cols-12 md:items-center dark:border-slate-700"
            role="group"
            aria-label={`แถวที่ ${idx + 1}`}
          >
            <div className="md:col-span-11 flex flex-col gap-2">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 md:gap-3">
                {/* ช่อง Level P (ล็อกแก้ไข) */}
                <Field
                  label="Level P"
                  placeholder=""
                  value={row.level}
                  readOnly
                  disabled
                />
                <Field label="ลาพักร้อน" type="number" placeholder="จำนวนวัน" value={row.vacation} onChange={(v) => updateRow(row.id, { vacation: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
                <Field label="ลากิจ" type="number" placeholder="จำนวนวัน" value={row.business} onChange={(v) => updateRow(row.id, { business: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
                <Field label="ลาป่วย" type="number" placeholder="จำนวนวัน" value={row.sick} onChange={(v) => updateRow(row.id, { sick: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
                <Field label="ลาบวช" type="number" placeholder="จำนวนวัน" value={row.ordain} onChange={(v) => updateRow(row.id, { ordain: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
                <Field label="ลาคลอด" type="number" placeholder="จำนวนวัน" value={row.maternity} onChange={(v) => updateRow(row.id, { maternity: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-3">
                <Field label="ลาไม่รับค่าจ้าง" type="number" placeholder="จำนวนวัน" value={row.unpaid} onChange={(v) => updateRow(row.id, { unpaid: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
                <Field label="ลาวันเกิด" type="number" placeholder="จำนวนวัน" value={row.birthday} onChange={(v) => updateRow(row.id, { birthday: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
                <Field label="วันหยุดประจำปี" type="number" placeholder="จำนวนวัน" value={row.annualHoliday} onChange={(v) => updateRow(row.id, { annualHoliday: v === "" ? "" : Number(v) })} inputProps={{ min: 0 }} />
              </div>
            </div>

            <div className="md:col-span-1 flex md:justify-end md:self-center pt-5">
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:hover:bg-rose-950/40 h-[42px] whitespace-nowrap"
                title="ลบแถว"
                aria-label="ลบแถว"
              >
                ลบ
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          className="rounded-xl px-4 py-2 font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 shadow-sm"
          onClick={addRow}
        >
          เพิ่มรายการ
        </button>
        <button type="button" className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>

      <div className="sr-only" aria-live="polite">{toast?.msg}</div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div className={`rounded-xl px-4 py-3 text-white ${toast.type === "success" ? "bg-emerald-600/90" : "bg-rose-600/90"}`}>
            {toast.msg}
            <button className="ml-3 border border-white/20 rounded px-2 text-xs" onClick={() => setToast(null)} aria-label="ปิดการแจ้งเตือน">
              ปิด
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  inputProps,
  readOnly,
  disabled,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value?: string | number | "";
  onChange?: (v: string) => void;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value as any}
        onChange={(e) => onChange?.(e.target.value)}
        className="neon-input w-full rounded-xl p-3"
        readOnly={readOnly}
        disabled={disabled}
        {...inputProps}
      />
    </label>
  );
}
