"use client";
import { useEffect, useState } from "react";

type HolidayRow = {
  id?: number;       // มาจาก DB จะมี id (ตอนเพิ่มใหม่ใน client ยังไม่ต้องมี)
  title: string;
  date: string;      // YYYY-MM-DD
  note: string;
};

const makeRow = (): HolidayRow => ({ title: "", date: "", note: "" });

export default function AnnualHolidaysSection() {
  const [rows, setRows] = useState<HolidayRow[]>([makeRow()]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]); // ✅ ใหม่
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] =
    useState<{ type: "success" | "error"; msg: string } | null>(null);

  // โหลดจาก DB
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/holidays", { cache: "no-store" });
        const data: Array<{ id:number; title:string; date:string; note:string|null }> = await r.json();
        if (Array.isArray(data) && data.length) {
          setRows(data.map(d => ({
            id: d.id,
            title: d.title,
            date: d.date.slice(0,10),
            note: d.note ?? "",
          })));
        } else {
          setRows([makeRow()]);
        }
        setDeletedIds([]); // ✅ reset
      } catch {
        // เงียบๆ
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateRow = (idx: number, patch: Partial<HolidayRow>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const addRow = () => setRows(prev => [...prev, makeRow()]);

  const removeRow = (idx: number) => {
    setRows(prev => {
      const draft = [...prev];
      const removed = draft[idx];
      // ✅ ถ้ามี id ให้เก็บไว้ลบตอนส่ง PUT
      if (removed?.id) {
        setDeletedIds(d => Array.from(new Set([...d, removed.id!])));
      }
      draft.splice(idx, 1);
      return draft.length ? draft : [makeRow()];
    });
  };

  // ส่งขึ้น DB ทั้งชุด
  const handlePublish = async () => {
    setSaving(true);
    try {
      const cleaned = rows
        .map(r => ({
          id: r.id,
          title: r.title.trim(),
          date: r.date.trim(),
          note: r.note.trim(),
        }))
        .filter(r => r.title || r.date || r.note);

      const payload = { rows: cleaned, deletedIds }; // ✅ ส่ง deletedIds ไปด้วย

      const res = await fetch("/api/holidays", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(()=>null);
        throw new Error(j?.error || "Save failed");
      }

      // ✅ หลังบันทึก ดึงรายการใหม่มาซิงก์ id ของแถวที่พึ่ง create
      const r = await fetch("/api/holidays", { cache: "no-store" });
      const data: Array<{ id:number; title:string; date:string; note:string|null }> = await r.json();
      setRows(
        (data ?? []).map(d => ({
          id: d.id,
          title: d.title,
          date: d.date.slice(0,10),
          note: d.note ?? "",
        }))
      );
      setDeletedIds([]); // ✅ เคลียร์หลังบันทึกสำเร็จ
      setToast({ type: "success", msg: `บันทึกแล้ว ${cleaned.length} รายการ` });
    } catch (e:any) {
      setToast({ type: "error", msg: e.message || "บันทึกล้มเหลว" });
    } finally {
      setSaving(false);
      setTimeout(()=>setToast(null), 2200);
    }
  };

  return (
   <section role="tabpanel" aria-label="ประกาศวันหยุดประจำปี" className="neon-card rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="neon-title text-lg font-semibold">ประกาศวันหยุดประจำปี</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-xl px-4 py-2 font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 shadow-sm" onClick={addRow}>
            เพิ่มวันหยุด
          </button>
          <button
            type="button"
            className="btn-primary rounded-xl px-5 py-2 disabled:opacity-60"
            onClick={handlePublish}
            disabled={saving}
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="hidden md:grid md:grid-cols-12 md:gap-4 rounded-xl px-3 py-2 text-xs font-semibold
        text-slate-800 bg-slate-100 border border-slate-200
        dark:text-slate-300 dark:bg-slate-900/40 dark:border-white/10">
        <div className="col-span-4">ชื่อวันหยุด</div>
        <div className="col-span-3">วันที่</div>
        <div className="col-span-4">หมายเหตุ</div>
        <div className="col-span-1 text-right">ลบ</div>
      </div>

      {/* Rows */}
      <div className="mt-3 space-y-3">
        {loading ? (
          <div className="text-sm text-[var(--muted)]">กำลังโหลด…</div>
        ) : (
          rows.map((row, idx) => (
            <div key={row.id ?? `new-${idx}`}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm
                md:grid-cols-12 md:items-center
                dark:border-white/10 dark:bg-white/5"
            >
              <Field
                className="md:col-span-4"
                label={<span className="md:hidden">ชื่อวันหยุด</span>}
                placeholder="เช่น New Year"
                value={row.title}
                onChange={v => updateRow(idx, { title: v })}
              />
              <Field
                className="md:col-span-3"
                label={<span className="md:hidden">วันที่</span>}
                type="date"
                value={row.date}
                onChange={v => updateRow(idx, { date: v })}
              />
              <Field
                className="md:col-span-4"
                label={<span className="md:hidden">หมายเหตุ</span>}
                placeholder="(ถ้ามี)"
                value={row.note}
                onChange={v => updateRow(idx, { note: v })}
              />

              <div className="md:col-span-1 flex md:justify-end md:self-center">
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50
                    dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/30 h-[42px] whitespace-nowrap"
                >
                  ลบ
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Toast */}
      <div className="sr-only" aria-live="polite">{toast?.msg}</div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div className={`rounded-xl px-4 py-3 text-white ${toast.type === "success" ? "bg-emerald-600/90" : "bg-rose-600/90"}`}>
            {toast.msg}
            <button className="ml-3 border border-white/20 rounded px-2 text-xs" onClick={() => setToast(null)}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* Field */
function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  className,
}: {
  label?: React.ReactNode;
  type?: string;
  placeholder?: string;
  value?: string | number | "";
  onChange?: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      {label ? <span className="mb-1 block text-sm text-slate-800 dark:text-slate-300">{label}</span> : null}
      <input
        type={type}
        placeholder={placeholder}
        value={value as any}
        onChange={(e) => onChange?.(e.target.value)}
        className="neon-input w-full rounded-xl p-3
          bg-white text-slate-800 placeholder-slate-400
          dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-400
          border border-slate-300 focus:ring-2 focus:ring-emerald-500
          dark:border-white/10 outline-none"
      />
    </label>
  );
}
