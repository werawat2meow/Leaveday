import React from "react";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
type LeaveRequest = {
  id: number;
  userId: number;
  kind: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: LeaveStatus;
  approverReason?: string;
  approverSignature?: string;
  approverName?: string;
  handoverTo?: string;
  createdAt: string;
  user: {
    name?: string;
    employee?: {
      empNo: string;
      firstName: string;
      lastName: string;
      org?: string;
      department?: string;
      division?: string;
      unit?: string;
      levelP?: string;
    };
  };
};

type Props = {
  open: boolean;
  onClose: () => void;
  department: string;
  leaveHistory?: LeaveRequest[];
};

function fmtDate(s: string) {
  if (!s) return "-";
  const date = new Date(s);
  if (isNaN(date.getTime())) return "-";
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function EmployeeLeaveHistoryModal({
  open,
  onClose,
  leaveHistory = [],
  department,
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [leaves, setLeaves] = React.useState<LeaveRequest[]>([]);
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    const url = department
      ? `/api/leaves/all?department=${encodeURIComponent(department)}`
      : "/api/leaves/all";
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        // Debug: log raw API data
        console.log("[Modal API] raw data:", json.data);
        setLeaves(json.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, department]);

  React.useEffect(() => {
    if (open) {
      console.log("[Modal] leaves for render:", leaves);
    }
  }, [open, leaves]);

  // Filter leaves by date range
  const filteredLeaves = React.useMemo(() => {
    if (!startDate && !endDate) return leaves;
    return leaves.filter((l) => {
      const leaveStart = new Date(l.startDate);
      const leaveEnd = new Date(l.endDate);
      const filterStart = startDate ? new Date(startDate) : null;
      const filterEnd = endDate ? new Date(endDate) : null;
      if (filterStart && leaveEnd < filterStart) return false;
      if (filterEnd && leaveStart > filterEnd) return false;
      return true;
    });
  }, [leaves, startDate, endDate]);

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
        className="w-[96vw] max-w-5xl neon-card rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="neon-title text-lg font-semibold">
            ประวัติการลาพนักงาน
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 border border-white/15 hover:bg-white/5"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>
        {/* Filter by date range */}
        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 mb-3 sm:mb-4">
          <div>
            <label className="block text-xs sm:text-sm mb-1 text-white/80">
              จากวันที่
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full sm:w-auto text-black"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm mb-1 text-white/80">
              ถึงวันที่
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full sm:w-auto text-black"
            />
          </div>
        </div>
        {/* Table container with scrolling */}
        <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-white/10">
          {/* ให้ตารางเลื่อนแนวนอนได้ */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] history-table text-xs sm:text-sm">
              <thead>
                <tr className="sticky top-0 z-10 bg-slate-900/80">
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap">
                    ลำดับ
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap">
                    ชื่อผู้ลา
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap">
                    ประเภท
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap">
                    วันที่
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap">
                    สถานะ
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap hidden sm:table-cell">
                    ผู้อนุมัติ
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center text-[var(--muted)] py-6 text-xs sm:text-sm"
                    >
                      กำลังโหลด...
                    </td>
                  </tr>
                ) : filteredLeaves.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center text-[var(--muted)] py-6 text-xs sm:text-sm"
                    >
                      ไม่มีประวัติการลา
                    </td>
                  </tr>
                ) : (
                  filteredLeaves.map((item: LeaveRequest, idx: number) => {
                    const employee = item.user.employee;
                    const name = employee
                      ? `${employee.firstName} ${employee.lastName}`
                      : "-";
                    const approver =
                      item.approverName || item.handoverTo || "-";
                    let statusLabel = "รออนุมัติ";
                    let statusClass =
                      "bg-yellow-200 text-yellow-800 border-yellow-300";
                    if (item.status === "APPROVED") {
                      statusLabel = "อนุมัติแล้ว";
                      statusClass =
                        "bg-green-200 text-green-800 border-green-300";
                    } else if (item.status === "REJECTED") {
                      statusLabel = "ไม่อนุมัติ";
                      statusClass = "bg-red-200 text-red-800 border-red-300";
                    }
                    return (
                      <tr
                        key={idx}
                        className="odd:bg-white/0 even:bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <td className="text-center px-3 py-2 text-xs sm:text-sm">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 text-xs sm:text-sm">{name}</td>
                        <td className="text-center px-3 py-2 text-xs sm:text-sm">
                          {item.kind}
                        </td>
                        <td className="text-center px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                          {fmtDate(item.startDate)} - {fmtDate(item.endDate)}
                        </td>
                        <td className="text-center px-3 py-2">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs ${statusClass}`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="text-center px-3 py-2 text-xs sm:text-sm hidden sm:table-cell">
                          {approver}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
