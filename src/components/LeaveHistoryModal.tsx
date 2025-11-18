"use client";
import { useEffect } from "react";

export type LeaveHistoryItem = {
  no: number;
  type: string;
  range: string; // ช่วงวันที่ลา (เช่น 11-12/09/68)
  from: string;
  to: string;
  approverComment: string;
  approver: string;
  status: "approved" | "rejected" | "pending";
};

export default function LeaveHistoryModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: LeaveHistoryItem[];
}) {
  // ปิดด้วย ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* stop close when click card */}
      <div
        className="w-[96vw] max-w-5xl neon-card rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="neon-title text-lg font-semibold">ประวัติการลา</h3>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 border border-white/15 hover:bg-white/5"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div className="overflow-auto rounded-xl border border-white/10">
          <table className="w-full history-table">
            <colgroup>
              <col className="col-num" />
              <col />
              <col />
              <col />
              <col />
              <col className="col-status" />
            </colgroup>

            <thead>
              <tr>
                <th className="text-center">number</th>
                <th className="text-center">Types of leave</th>
                <th className="text-center">Leave from date - to date</th>
                <th className="text-center">Approver comments</th>
                <th className="text-center">Approver</th>
                <th className="text-center">Approval results</th>
              </tr>
            </thead>

            <tbody>
              {items.map((r) => (
                <tr key={r.no}>
                  <td className="col-num text-center">{r.no}</td>
                  <td className="text-center">{r.type}</td>
                  <td className="tabular-nums text-center">{r.range}</td>
                  <td className="text-center">{r.approverComment}</td>
                  <td className="text-center">{r.approver}</td>
                  <td className="col-status text-center">
                    {r.status === "approved" ? (
                      <span
                        className="inline-block rounded-lg px-2 py-1 text-xs font-semibold ring-1
                               bg-[rgba(0,255,120,.15)] text-[rgb(0,255,120)] ring-[rgba(0,255,120,.35)]"
                      >
                        approve
                      </span>
                    ) : r.status === "rejected" ? (
                      <span
                        className="inline-block rounded-lg px-2 py-1 text-xs font-semibold ring-1
                               bg-[rgba(255,60,60,.15)] text-[rgb(255,80,80)] ring-[rgba(255,60,60,.35)]"
                      >
                        Not approved
                      </span>
                    ) : (
                      <span
                        className="inline-block rounded-lg px-2 py-1 text-xs font-semibold ring-1
                               bg-[rgba(255,200,0,.15)] text-[rgb(255,200,0)] ring-[rgba(255,200,0,.35)]"
                      >
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-[var(--muted)]">
          * ข้อมูลเป็นตัวอย่าง สามารถเชื่อมต่อฐานข้อมูลจริงภายหลัง
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: "approved" | "rejected" | "pending";
}) {
  const label =
    status === "approved"
      ? "อนุมัติ"
      : status === "rejected"
      ? "ไม่อนุมัติ"
      : "รออนุมัติ";
  const cls =
    status === "approved"
      ? "bg-[rgba(0,255,120,.15)] text-[rgb(0,255,120)] ring-[rgba(0,255,120,.35)]"
      : status === "rejected"
      ? "bg-[rgba(255,60,60,.15)] text-[rgb(255,80,80)] ring-[rgba(255,60,60,.35)]"
      : "bg-[rgba(255,200,0,.15)] text-[rgb(255,200,0)] ring-[rgba(255,200,0,.35)]";
  return (
    <span
      className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${cls}`}
    >
      {label}
    </span>
  );
}
