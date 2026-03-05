import React from "react";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
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

type FilterParams = {
  org?: string;
  department?: string;
  division?: string;
  unit?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  department?: string;               // ทำให้ optional
  leaveHistory?: LeaveRequest[];
  filters?: FilterParams;            // ← เพิ่มตรงนี้
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

function stripTitle(s: string): string {
  if (!s) return "";
  const orig = s.trim();
  let str = orig;
  // pattern covers Thai honorifics and single-letter+dot (dot must be followed by space)
  const pattern = /^(นาย|นางสาว?|สาว|เด็กชาย|เด็กหญิง|ว่าที่ร้อยตรี|ว่าที่ร้อยเอก|คุณ|[A-Za-z]\.)\s*/i;
  // remove repeatedly in case multiple prefixes appear
  while (pattern.test(str)) {
    str = str.replace(pattern, "").trim();
  }
  // if stripping removed everything, revert to original (so we don't show '-')
  if (str === "" && orig !== "") {
    return orig;
  }
  return str;
}

function fmtEmployeeName(emp?: {
  firstName?: string;
  lastName?: string;
}): string {
  if (!emp) return "-";
  const fn = stripTitle(emp.firstName || "");
  const ln = stripTitle(emp.lastName || "");
  const name = [fn, ln].filter(Boolean).join(" ");
  return name || "-";
}

export default function EmployeeLeaveHistoryModal({
  open,
  onClose,
  leaveHistory = [],
  department,
  filters = {},
}: Props) {
  const [loading, setLoading] = React.useState(false);
  const [leaves, setLeaves] = React.useState<LeaveRequest[]>([]);
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  const [onlyMyApprovalsUi, setOnlyMyApprovalsUi] = React.useState(false);

  const [fOrg, setFOrg] = React.useState("");
  const [fDept, setFDept] = React.useState("");
  const [fDivision, setFDivision] = React.useState("");
  const [fUnit, setFUnit] = React.useState("");

  const opts = React.useMemo(() => {
    const getUnique = (
      field: "org" | "department" | "division" | "unit"
    ): string[] => {
      return Array.from(
        new Set(
          leaves
            .map((x) => x.user.employee?.[field])
            .filter((v): v is string => !!v)
        )
      ).sort();
    };
    return {
      org: getUnique("org"),
      dept: getUnique("department"),
      division: getUnique("division"),
      unit: getUnique("unit"),
    };
  }, [leaves]);

  React.useEffect(() => {
    if (!open) {
      setLeaves([]);
      setStartDate("");
      setEndDate("");
      setOnlyMyApprovalsUi(false);
      setFOrg("");
      setFDept("");
      setFDivision("");
      setFUnit("");
      return;
    }

    setFOrg(filters.org || "");
    setFDept(filters.department || department || "");
    setFDivision(filters.division || "");
    setFUnit(filters.unit || "");

    // show any provided snapshot immediately, but still fetch authoritative data
    if (leaveHistory && leaveHistory.length > 0) {
      setLeaves(leaveHistory);
    }
  }, [open, department, filters, leaveHistory]);

  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);

    const qs = new URLSearchParams();
    if (fOrg) qs.set("org", fOrg);
    if (fDept) qs.set("department", fDept);
    if (fDivision) qs.set("division", fDivision);
    if (fUnit) qs.set("unit", fUnit);
    qs.set("onlyMyApprovals", onlyMyApprovalsUi ? "1" : "0");

    const url = `/api/leaves/all${qs.toString() ? `?${qs.toString()}` : ""}`;

    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        if (controller.signal.aborted) return;
        setLeaves(json?.data || []);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });

    return () => controller.abort();
  }, [open, fOrg, fDept, fDivision, fUnit, onlyMyApprovalsUi]);

  // Filter leaves by org + date range
  const filteredLeaves = React.useMemo(() => {
    return leaves.filter((l) => {
      const employee = l.user.employee;
      const hitOrg = !fOrg || employee?.org === fOrg;
      const hitDept = !fDept || employee?.department === fDept;
      const hitDivision = !fDivision || employee?.division === fDivision;
      const hitUnit = !fUnit || employee?.unit === fUnit;
      if (!hitOrg || !hitDept || !hitDivision || !hitUnit) return false;

      if (!startDate && !endDate) return true;
      const leaveStart = new Date(l.startDate);
      const leaveEnd = new Date(l.endDate);
      const filterStart = startDate ? new Date(startDate) : null;
      const filterEnd = endDate ? new Date(endDate) : null;
      if (filterStart && leaveEnd < filterStart) return false;
      if (filterEnd && leaveStart > filterEnd) return false;
      return true;
    });
  }, [leaves, fOrg, fDept, fDivision, fUnit, startDate, endDate]);
  

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
        className="w-[96vw] lg:w-[85vw] lg:max-w-[1200px] neon-card rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
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

        <div className="mb-3">
          <label className="inline-flex items-center px-2 py-1 rounded text-sm blink-bg">
            <input
              type="checkbox"
              checked={onlyMyApprovalsUi}
              onChange={(e) => setOnlyMyApprovalsUi(e.target.checked)}
              className="mr-2"
            />
            รายชื่อขึ้นตรงกับเรา
          </label>
        </div>
        {/* Filters */}
        <div className="mb-3 sm:mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="block text-xs sm:text-sm mb-1 text-slate-700 dark:text-white/80">
              สังกัด
            </label>
            <select
              value={fOrg}
              onChange={(e) => setFOrg(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full text-black"
            >
              <option value="">ทั้งหมด</option>
              {opts.org.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm mb-1 text-slate-700 dark:text-white/80">
              แผนก
            </label>
            <select
              value={fDept}
              onChange={(e) => setFDept(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full text-black"
            >
              <option value="">ทั้งหมด</option>
              {opts.dept.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm mb-1 text-slate-700 dark:text-white/80">
              ฝ่าย
            </label>
            <select
              value={fDivision}
              onChange={(e) => setFDivision(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full text-black"
            >
              <option value="">ทั้งหมด</option>
              {opts.division.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm mb-1 text-slate-700 dark:text-white/80">
              หน่วย
            </label>
            <select
              value={fUnit}
              onChange={(e) => setFUnit(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full text-black"
            >
              <option value="">ทั้งหมด</option>
              {opts.unit.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm mb-1 text-slate-700 dark:text-white/80">
              จากวันที่
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full text-black"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm mb-1 text-slate-700 dark:text-white/80">
              ถึงวันที่
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border px-2 py-1 text-xs sm:text-sm w-full text-black"
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
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b border-slate-200 dark:border-white/10">
                    ลำดับ
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b border-slate-200 dark:border-white/10">
                    ชื่อผู้ลา
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b border-slate-200 dark:border-white/10">
                    ประเภท
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b border-slate-200 dark:border-white/10">
                    วันที่
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b border-slate-200 dark:border-white/10">
                    สถานะ
                  </th>
                  <th className="text-center px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b border-slate-200 dark:border-white/10">
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
                  // compose employee name without title
                  const name = fmtEmployeeName(employee);

                  // format approver: strip title from string first
                  let approverRaw = item.approverName || item.handoverTo || "";
                  approverRaw = stripTitle(approverRaw);
                  // if still empty, show a sensible placeholder instead of dash
                  const approver = approverRaw || "ยังไม่มีผู้อนุมัติ";

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
                    } else if (item.status === "CANCELLED") {
                      statusLabel = "ยกเลิก";
                      statusClass = "bg-slate-200 text-slate-800 border-slate-300";
                    }
                    return (
                      <tr
                        key={idx}
                        className="border-t border-slate-200 dark:border-white/10 odd:bg-white/0 even:bg-white/5 hover:bg-white/10 transition-colors"
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
                        <td className="text-center px-3 py-2 text-xs sm:text-sm">
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
