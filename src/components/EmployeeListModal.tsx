"use client";
import { useEffect, useMemo, useState } from "react";

export type Employee = {
  id: string;
  empNo: string;
  name: string;
  dept?: string;
  email?: string;
  // 👇 เก็บข้อมูลดิบจาก API ไว้ให้หน้าเพจใช้ map ใส่ฟอร์มได้ครบ
  _raw?: any;
};

export default function EmployeeListModal({
  open,
  onClose,
  employees,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  employees?: Employee[];
  onSelect?: (emp: Employee) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    if (employees && employees.length) {
      setItems(employees);
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/employees", {
          cache: "no-store",
          credentials: "include", // ✅ เพิ่มบรรทัดนี้
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อไม่สำเร็จ");

        // ✅ map เฉพาะคอลัมน์ที่แสดง + แนบ _raw เต็ม ๆ มาด้วย
        const mapped: Employee[] = (Array.isArray(data) ? data : []).map((e: any) => ({
          id: String(e.id),
          empNo: e.empNo ?? "",
          name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(),
          dept: e.department ?? e.unit ?? "",
          email: e.email ?? "",
          _raw: e, // เก็บข้อมูลเต็ม
        }));
        if (alive) setItems(mapped);
      } catch (err: any) {
        if (alive) setError(err?.message || "เกิดข้อผิดพลาด");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, employees]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((e) =>
      [e.empNo, e.name, e.dept ?? "", e.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  if (!open) return null;

return (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
  >
    <div
      className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-white/15 bg-white text-slate-900 p-4 shadow-2xl dark:bg-[#0b1220] dark:text-slate-100 flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between shrink-0">
        <h3 className="text-lg font-semibold">รายชื่อพนักงาน</h3>
        <button
          onClick={onClose}
          className="rounded-xl px-3 py-1 border border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
        >
          ปิด
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา: ชื่อ / EMP No. / อีเมล / แผนก"
          className="neon-input w-full rounded-xl p-3 border border-slate-300 bg-white text-slate-900 placeholder-slate-400
                     dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder-slate-500"
        />
      </div>

      {/* Table (ส่วนที่เลื่อนได้) */}
      <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden dark:border-white/10 flex-1 min-h-0">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">EMP No.</th>
                <th className="px-3 py-2 text-left">ชื่อพนักงาน</th>
                <th className="px-3 py-2 text-left">แผนก/หน่วย</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center">
                    กำลังโหลด…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-rose-500">
                    {error}
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-slate-500 dark:text-slate-400"
                  >
                    ไม่พบรายการ
                  </td>
                </tr>
              ) : (
                list.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-slate-200 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <td className="px-3 py-2">{e.empNo}</td>
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2">{e.dept || "-"}</td>
                    <td className="px-3 py-2">{e.email || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                        onClick={() => {
                          onSelect?.(e);
                          onClose();
                        }}
                      >
                        เลือก
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);
}
