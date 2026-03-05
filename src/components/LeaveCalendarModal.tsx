import React from "react";

type DayPeople = { name: string; empNo: string; status: string };
type DayRow = {
  approved: number;
  pending: number;
  rejected: number;
  people: DayPeople[];
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
  filters?: FilterParams;
  onlyMyApprovals?: boolean;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function isoDateString(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function formatMonthTH(month: string) {
  // month = "2025-12"
  const [y, m] = month.split("-");
  const year = (parseInt(y, 10) + 543).toString();
  return `${m}/${year}`;
}

export default function LeaveCalendarModal({ open, onClose, filters = {}, onlyMyApprovals = false, }: Props) {
  const now = new Date();
  const [month, setMonth] = React.useState(
    () => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  );
  const [loading, setLoading] = React.useState(false);
  const [daysMap, setDaysMap] = React.useState<Record<string, DayRow>>({});
  const [expandedDay, setExpandedDay] = React.useState<string | null>(null);
  const [onlyMyApprovalsUi, setOnlyMyApprovalsUi] = React.useState<boolean>(() => !!onlyMyApprovals);

  const [fOrg, setFOrg] = React.useState("");
  const [fDept, setFDept] = React.useState("");
  const [fDivision, setFDivision] = React.useState("");
  const [fUnit, setFUnit] = React.useState("");

  const [opts, setOpts] = React.useState<{
    org: string[];
    dept: string[];
    division: string[];
    unit: string[];
  }>({ org: [], dept: [], division: [], unit: [] });

  // internal filter state removed; component now relies solely on the `filters` prop
  const cellRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [isMobile, setIsMobile] = React.useState(false);
  const [popupPos, setPopupPos] = React.useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const defaultOrg = filters.org ?? "";
  const defaultDept = filters.department ?? "";
  const defaultDivision = filters.division ?? "";
  const defaultUnit = filters.unit ?? "";

  React.useEffect(() => {
    if (open) return;
    setExpandedDay(null);
    setPopupPos(null);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setOnlyMyApprovalsUi(!!onlyMyApprovals);
  }, [open, onlyMyApprovals]);

  React.useEffect(() => {
    if (!open) return;
    setFOrg(defaultOrg);
    setFDept(defaultDept);
    setFDivision(defaultDivision);
    setFUnit(defaultUnit);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (fOrg) qs.set("org", fOrg);
    if (fDept) qs.set("department", fDept);
    if (fDivision) qs.set("division", fDivision);
    if (fUnit) qs.set("unit", fUnit);
    fetch(`/api/leaves/calendar-options${qs.toString() ? `?${qs.toString()}` : ""}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (controller.signal.aborted) return;
        if (!j?.ok) return;
        setOpts({
          org: Array.isArray(j.org) ? j.org : [],
          dept: Array.isArray(j.department) ? j.department : [],
          division: Array.isArray(j.division) ? j.division : [],
          unit: Array.isArray(j.unit) ? j.unit : [],
        });
      })
      .catch(() => {});

    return () => controller.abort();
  }, [open, fOrg, fDept, fDivision, fUnit]);

  // no longer sync filters into local state

  // fetch calendar per-month using only the filters passed in
  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (fOrg) params.set("org", fOrg);
    if (fDept) params.set("department", fDept);
    if (fDivision) params.set("division", fDivision);
    if (fUnit) params.set("unit", fUnit);
    params.set("onlyMyApprovals", onlyMyApprovalsUi ? "1" : "0");
    fetch(`/api/leaves/calendar?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        setDaysMap(json?.days || {});
        setLoading(false);
      })
      .catch(() => {
        setDaysMap({});
        setLoading(false);
      });
  }, [open, month, fOrg, fDept, fDivision, fUnit, onlyMyApprovalsUi]);

  // detect mobile (for bottom-sheet behaviour)
  React.useEffect(() => {
    const onResize = () => {
      try {
        setIsMobile(window.innerWidth < 640);
      } catch (e) {
        setIsMobile(false);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Escape key: close expanded popup or modal
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedDay) setExpandedDay(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedDay, onClose]);

  if (!open) return null;

  // helpers to build calendar cells
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const m = Number(monthStr); // 1-12

  const first = new Date(year, m - 1, 1);
  const last = new Date(year, m, 0); // last day of month
  // Determine weekday start (0=Sun..6=Sat). We'll render Mon..Sun so compute offset
  const startWeekday = (first.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = last.getDate();

  // build array of cells (leading blanks + days + outside days)
  const prevMonthLastDay = new Date(year, m - 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cells: Array<{ iso?: string; day: number; outside: boolean }> =
    Array.from({
      length: totalCells,
    }).map((_, idx) => {
      const dayIndex = idx - startWeekday + 1;
      if (dayIndex >= 1 && dayIndex <= daysInMonth) {
        return {
          iso: isoDateString(year, m, dayIndex),
          day: dayIndex,
          outside: false,
        };
      }
      // previous month filler
      if (dayIndex < 1) {
        return {
          day: prevMonthLastDay + dayIndex,
          outside: true,
        };
      }
      // next month filler
      return {
        day: dayIndex - daysInMonth,
        outside: true,
      };
    });
  const gotoPrev = () => {
    const d = new Date(year, m - 2, 1); // previous month
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    setExpandedDay(null);
  };
  const gotoNext = () => {
    const d = new Date(year, m, 1); // next month
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    setExpandedDay(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl p-3 sm:p-6 w-full max-w-full sm:max-w-3xl md:max-w-4xl shadow-lg relative max-h-[85vh] overflow-y-auto overflow-x-visible mx-3 sm:mx-0"
        style={{ minWidth: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-3 right-4">
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-rose-600 text-xl font-bold focus:outline-none"
            aria-label="ปิด"
          >
            X
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-3 mb-4 gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            ปฏิทินการลา ({formatMonthTH(month)})
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={gotoPrev}
              className="px-2 py-1 rounded border text-sm"
            >
              ‹
            </button>
            <input
              type="month"
              className="h-8 rounded border px-2 text-sm text-black w-full sm:w-auto"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setExpandedDay(null);
              }}
            />
            <button
              onClick={gotoNext}
              className="px-2 py-1 rounded border text-sm"
            >
              ›
            </button>
          </div>
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
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
              {opts.org.map((o: string) => (
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
              {opts.dept.map((o: string) => (
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
              {opts.division.map((o: string) => (
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
              {opts.unit.map((o: string) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* calendar header */}
        <div className="grid grid-cols-7 gap-1 text-xs text-slate-900 dark:text-slate-100 mb-2">
          <div className="text-center font-medium">จ</div>
          <div className="text-center font-medium">อ</div>
          <div className="text-center font-medium">พ</div>
          <div className="text-center font-medium">พฤ</div>
          <div className="text-center font-medium">ศ</div>
          <div className="text-center font-medium">ส</div>
          <div className="text-center font-medium">อา</div>
        </div>

        {/* calendar grid */}
        <div
          className="grid grid-cols-7 gap-1"
          onClick={() => setExpandedDay(null)}
        >
          {loading ? (
            <div className="col-span-7 p-6 text-center text-slate-700 dark:text-slate-100">
              กำลังโหลด...
            </div>
          ) : (
            cells.map((cell, i) => {
              if (cell.outside) {
                return (
                  <div
                    key={`outside-${i}`}
                    className="relative h-20 sm:h-28 border border-slate-300 rounded p-1.5 sm:p-2 bg-white dark:bg-slate-800/60"
                  >
                    <div className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 opacity-70 px-1 py-0.5 rounded">
                      {cell.day}
                    </div>
                  </div>
                );
              }

              if (!cell.iso) return null;
              const dayData = daysMap[cell.iso];
              const total = dayData ? dayData.people.length : 0;
              return (
                <div
                  key={cell.iso}
                  ref={(el) => {
                    if (cell.iso) cellRefs.current[cell.iso] = el;
                  }}
                  className="relative h-20 sm:h-28 border border-slate-300 rounded p-1.5 sm:p-2 bg-white dark:bg-slate-800 overflow-visible"
                >
                  <div className="flex items-start justify-between">
                    <div className="text-[11px] sm:text-xs text-slate-900 dark:text-slate-100 bg-transparent px-1 py-0.5 rounded">
                      {cell.day}
                    </div>
                    {total > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const iso = cell.iso;
                          if (!iso) return;

                          const el = cellRefs.current[iso];
                          let above = false;
                          if (el) {
                            const rect = el.getBoundingClientRect();
                            const viewportHeight =
                              window.innerHeight ||
                              document.documentElement.clientHeight;
                            const popupApprox = 220; // approximate popup height
                            const spaceBelow = viewportHeight - rect.bottom;
                            if (
                              spaceBelow < popupApprox &&
                              rect.top > popupApprox
                            )
                              above = true;
                            const left = rect.left + rect.width / 2;
                            const pos = above
                              ? {
                                  left,
                                  bottom: Math.max(
                                    viewportHeight - rect.top + 8,
                                    8
                                  ),
                                }
                              : { left, top: rect.bottom + 8 };
                            setPopupPos(pos);
                          }
                          setExpandedDay((prev) => {
                            const next = prev === iso ? null : iso;
                            if (next === null) setPopupPos(null);
                            return next;
                          });
                        }}
                        className="absolute top-2 right-2 text-[11px] sm:text-xs px-2 py-0.5 rounded-md bg-indigo-600 text-white"
                      >
                        {total} คน
                      </button>
                    )}
                  </div>

                  {/* small legend of counts */}
                  {dayData && (
                    <div className="mt-2 text-[11px] space-y-1 text-slate-700 dark:text-slate-200 hidden sm:block">
                      <div className="flex items-center justify-between">
                        <span className="text-green-600">✔</span>
                        <span>{dayData.approved} อนุมัติ</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-yellow-500">⌛</span>
                        <span>{dayData.pending} รอ</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-red-600">✖</span>
                        <span>{dayData.rejected} ไม่อนุมัติ</span>
                      </div>
                    </div>
                  )}

                  {/* expanded popup */}
                  {expandedDay === cell.iso &&
                    (isMobile ? (
                      <div
                        className="fixed left-0 right-0 bottom-0 z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="rounded-t-xl border bg-white p-4 shadow-lg max-h-[65vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
                          <div className="w-full flex items-center justify-center mb-2">
                            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium">
                              รายชื่อ {cell.iso}
                            </div>
                            <button
                              className="text-sm text-slate-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDay(null);
                              }}
                            >
                              ปิด
                            </button>
                          </div>
                          <div className="max-h-[56vh] overflow-y-auto text-sm space-y-2">
                            {dayData?.people.length ? (
                              dayData.people.map((p) => (
                                <div
                                  key={p.empNo}
                                  className="flex items-center justify-between"
                                >
                                  <div>
                                    {p.name}{" "}
                                    <span className="text-slate-400">
                                      ({p.empNo})
                                    </span>
                                  </div>
                                  <div className="text-[14px]">
                                    {p.status === "APPROVED"
                                      ? "✔️"
                                      : p.status === "REJECTED"
                                      ? "❌"
                                      : "⏳"}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-500">ไม่มีรายชื่อ</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="fixed z-50 w-[90vw] sm:w-72"
                        style={{
                          left: popupPos?.left ?? "50%",
                          transform: "translateX(-50%)",
                          top: popupPos?.top,
                          bottom: popupPos?.bottom,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="rounded border bg-white p-2 shadow-lg dark:bg-slate-800 dark:border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium">
                              รายชื่อ {cell.iso}
                            </div>
                            <button
                              className="text-xs text-slate-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDay(null);
                              }}
                            >
                              ปิด
                            </button>
                          </div>
                          <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                            {dayData?.people.length ? (
                              dayData.people.map((p) => (
                                <div
                                  key={p.empNo}
                                  className="flex items-center justify-between"
                                >
                                  <div>
                                    {p.name}{" "}
                                    <span className="text-slate-400">
                                      ({p.empNo})
                                    </span>
                                  </div>
                                  <div className="text-[12px]">
                                    {p.status === "APPROVED"
                                      ? "✔️"
                                      : p.status === "REJECTED"
                                      ? "❌"
                                      : "⏳"}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-500">ไม่มีรายชื่อ</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              );
            })
          )}
        </div>

        {/* footer hint */}
        <div className="mt-3 text-xs text-red-600 font-semibold">
          *** คลิกตัวเลขในวันที่เพื่อดูรายชื่อผู้ลา
        </div>
      </div>
    </div>
  );
}
