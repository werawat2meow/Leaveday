"use client";

import EmployeeLeaveHistoryModal from "@/components/EmployeeLeaveHistoryModal";
import LeaveCalendarModal from "@/components/LeaveCalendarModal";
import SignaturePadWrapper, {
  SigHandle,
} from "@/components/SignaturePadWrapper";
import { useEffect, useMemo, useRef, useState } from "react";

/* ---------------- Types ---------------- */
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
      photoUrl?: string | null;
      avatar?: string | null;
    };
  };
  attachments?: { id: number; name: string; url: string; mine?: string }[];
};

/* ---------------- API Functions ---------------- */
async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
  try {
    const response = await fetch("/api/approvals");
    if (!response.ok) throw new Error("Failed to fetch leaves");
    const data = await response.json();

    console.log("🔄 [Approvals] API Response:", data);
    const result = Array.isArray(data) ? data : data.data || [];

    return result.map((r: any) => {
      // normalize various attachment shapes into [{ id, name, url }]
      const raw =
        r.attachments ||
        r.files ||
        r.fileList ||
        (Array.isArray(r.attachments?.data) ? r.attachments.data : null) ||
        [];
      let attachments: any[] = [];

      if (Array.isArray(raw) && raw.length > 0) {
        attachments = raw.map((a: any, idx: number) => ({
          id: a.id ?? idx,
          name: a.name ?? a.filename ?? a.originalname ?? `file-${idx}`,
          url:
            a.url ||
            a.path ||
            a.fileUrl ||
            a.file ||
            a.file_path ||
            a.attachmentUrl ||
            "",
        }));
      } else if (r.attachmentUrl) {
        attachments = [
          {
            id: `single-${r.id}`,
            name:
              r.attachmentName ??
              r.attachmentFilename ??
              (r.attachmentUrl.split("/").pop() || "attachment"),
            url: r.attachmentUrl,
          },
        ];
      }

      return { ...r, attachments };
    });
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    return [];
  }
}

// async function updateLeaveStatus(
//   id: number,
//   status: LeaveStatus,
//   approverReason?: string,
//   approverSignature?: string
// ) {
//   try {
//     const response = await fetch(`/api/leaves/${id}`, {
//       method: "PATCH",
//       headers: { "Content-Type": "application/json" },
//       // ถ้า API ใช้ cookie session ให้เปิดอันนี้
//       // credentials: "include",
//       body: JSON.stringify({ status, approverReason, approverSignature }),
//     });

//     if (!response.ok) {
//       const bodyText = await response.text().catch(() => "");
//       console.error("PATCH /api/leaves failed:", {
//         id,
//         status,
//         httpStatus: response.status,
//         httpStatusText: response.statusText,
//         bodyText,
//       });
//       throw new Error(
//         `Failed to update leave status (${response.status}): ${bodyText || response.statusText}`
//       );
//     }

//     return await response.json();
//   } catch (error) {
//     console.error("Error updating leave status:", error);
//     throw error;
//   }
// }

async function updateLeaveStatus(
  id: number,
  status: LeaveStatus,
  approverReason?: string,
  approverSignature?: string
) {
  const response = await fetch(`/api/leaves/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    // credentials: "include",
    body: JSON.stringify({ status, approverReason, approverSignature }),
  });

  if (!response.ok) {
    const ct = response.headers.get("content-type") || "";
    const body =
      ct.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text().catch(() => "");

    const msg =
      typeof body === "string"
        ? body
        : body?.message || body?.error || JSON.stringify(body) || response.statusText;

    console.error("PATCH /api/leaves failed:", {
      id,
      status,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      body,
    });

    throw new Error(msg);
  }

  return await response.json();
}

/* ---------------- Page ---------------- */
export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LeaveRequest[]>([]);

  // selection
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // approver inputs
  const [approverReason, setApproverReason] = useState("");
  const [approverSignature, setApproverSignature] = useState<string | null>(
    null
  );
  const sigRef = useRef<SigHandle | null>(null); // use SignaturePadWrapper via ref

  // ------ signature
  const [rememberSignature, setRememberSignature] = useState(false);
  const [savedSignatureExists, setSavedSignatureExists] = useState(false);

  const signatureStorageKey = useMemo(() => {
    if (typeof window === "undefined") return "approverSignature_me";
    return `approverSignature_${
      (window as any).__USER_ID__ ||
      localStorage.getItem("currentUserId") ||
      "me"
    }`;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const s = localStorage.getItem(signatureStorageKey);
      setSavedSignatureExists(!!s);
    } catch {
      setSavedSignatureExists(false);
    }
  }, [signatureStorageKey]);

  // filters
  const [q, setQ] = useState("");
  const [fOrg, setFOrg] = useState("");
  const [fDept, setFDept] = useState("");
  const [fDivision, setFDivision] = useState("");
  const [fUnit, setFUnit] = useState("");

  // toast
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // leaveHistory for modal
  const [modalLeaveHistory, setModalLeaveHistory] = useState<LeaveRequest[]>(
    []
  );

  // fetch modal data when opened
  useEffect(() => {
    if (!showHistoryModal) return;
    fetch("/api/leaves/all?department=IT")
      .then((res) => res.json())
      .then((json) => {
        const mapped = (json.data || []).map((l: any) => ({
          id: l.id,
          userId: l.userId,
          kind: l.kind,
          startDate: l.startDate,
          endDate: l.endDate,
          reason: l.reason,
          status: l.status,
          approverReason: l.approverReason,
          approverSignature: l.approverSignature,
          approverName: l.approverName || l.approver?.name || l.approver || "",
          handoverTo: l.handoverTo || "",
          createdAt: l.createdAt,
          user: {
            name: l.user?.name,
            employee: {
              empNo: l.user?.employee?.empNo || "",
              firstName: l.user?.employee?.firstName || "",
              lastName: l.user?.employee?.lastName || "",
              org: l.user?.employee?.org || "",
              department: l.user?.employee?.department || "",
              division: l.user?.employee?.division || "",
              unit: l.user?.employee?.unit || "",
              levelP: l.user?.employee?.levelP || "",
            },
          },
        }));
        setModalLeaveHistory(mapped);
      });
  }, [showHistoryModal]);

  useEffect(() => {
    if (showHistoryModal) {
      console.log("[Modal] leaveHistory count:", modalLeaveHistory.length);
    }
  }, [showHistoryModal, modalLeaveHistory]);

  // load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const leaves = await fetchLeaveRequests();
      setData(leaves);
      setLoading(false);
    };
    loadData();
  }, []);

  // options
  const opts = useMemo(() => {
    const getUnique = (field: string) => {
      return Array.from(
        new Set(
          data
            .map(
              (x) => x.user.employee?.[field as keyof typeof x.user.employee]
            )
            .filter(Boolean)
        )
      ).sort() as string[];
    };
    return {
      org: getUnique("org"),
      dept: getUnique("department"),
      division: getUnique("division"),
      unit: getUnique("unit"),
    };
  }, [data]);

  // filtered list
  const filtered = useMemo(() => {
    return data.filter((r) => {
      const employee = r.user.employee;
      const name = `${employee?.firstName || ""} ${
        employee?.lastName || ""
      }`.trim();
      const empNo = employee?.empNo || "";
      const hitQ =
        !q ||
        [empNo, name, r.kind, formatKind(r.kind), r.reason || ""]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase());
      const hit =
        (!fOrg || employee?.org === fOrg) &&
        (!fDept || employee?.department === fDept) &&
        (!fDivision || employee?.division === fDivision) &&
        (!fUnit || employee?.unit === fUnit);
      return hitQ && hit;
    });
  }, [data, q, fOrg, fDept, fDivision, fUnit]);

  const selected = useMemo(() => {
    const s = data.find((d) => d.id === selectedId) || null;
    if (typeof window !== "undefined") console.log("Selected row:", s);
    return s;
  }, [data, selectedId]);

  // selection helpers
  const toggleRow = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const visibleIds = filtered.map((r) => r.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  // actions
  async function updateStatus(ids: number[], status: LeaveStatus) {
    try {
      await Promise.all(
        ids.map((id) =>
          updateLeaveStatus(
            id,
            status,
            approverReason || undefined,
            approverSignature || undefined
          )
        )
      );

      setData((prev) =>
        prev.map((r) => {
          if (ids.includes(r.id)) {
            return {
              ...r,
              status,
              approverReason: approverReason || undefined,
              approverSignature: approverSignature || undefined,
            };
          }
          return r;
        })
      );

      setToast({
        type: status === "APPROVED" ? "success" : "error",
        msg: `${status === "APPROVED" ? "อนุมัติ" : "ไม่อนุมัติ"}แล้ว ${
          ids.length
        } รายการ`,
      });

      setSelectedIds(new Set());
      setApproverReason("");
      setApproverSignature(null);
      sigRef.current?.clear();
      setTimeout(() => setToast(null), 2000);
    } catch (error: any) {
      console.error("Error updating status:", error);
      setToast({
        type: "error",
        msg: error?.message || "เกิดข้อผิดพลาดในการอัปเดตสถานะ",
      });
      setTimeout(() => setToast(null), 4000);
    }
  }
  const approveIds = (ids: number[]) => updateStatus(ids, "APPROVED");
  const rejectIds = (ids: number[]) => updateStatus(ids, "REJECTED");

  const clearSignature = () => {
    sigRef.current?.clear();
    setApproverSignature(null);
  };

  const saveSignature = () => {
    try {
      const dataURL = sigRef.current?.toDataURL() ?? null;
      if (!dataURL) return;

      setApproverSignature(dataURL);

      if (rememberSignature && typeof window !== "undefined") {
        try {
          localStorage.setItem(signatureStorageKey, dataURL);
          setSavedSignatureExists(true);
        } catch (err) {
          console.error("Failed to save signature to localStorage", err);
        }
      }
    } catch (error) {
      console.error("Error saving signature:", error);
    }
  };

  const deleteSavedSignature = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(signatureStorageKey);
      setSavedSignatureExists(false);
    } catch (err) {
      console.error("Failed to delete saved signature:", err);
    }
  };

  // --- attachment helper
  const openAttachment = (url: string) => {
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener");
  };

  const downloadAttachment = async (url: string, filename?: string) => {
    if (typeof window === "undefined") return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch file");
      const blob = await res.blob();
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = filename || "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Download failed", err);
      setToast({ type: "error", msg: "ดาวน์โหลดไฟล์ล้มเหลว" });
      setTimeout(() => setToast(null), 2000);
    }
  };

  return (
    <section className="neon-card rounded-2xl p-6 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <h2 className="neon-title text-lg font-semibold text-slate-900 dark:text-slate-100">
          รายการคำขอลา
        </h2>
        <div className="flex gap-2">
          <a
            className="rounded-lg px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 border border-rose-700 dark:bg-rose-500/80 dark:text-white dark:hover:bg-rose-500"
            href="/manual/Manager.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            คู่มือการใช้งาน
          </a>
          <button
            className="rounded-lg px-4 py-2 bg-yellow-200 text-yellow-900 hover:bg-yellow-300 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:hover:bg-yellow-800"
            onClick={() => {
              setShowHistoryModal(true);
            }}
          >
            ประวัติการลา
          </button>
          <button
            className="rounded-lg px-4 py-2 bg-orange-300 text-orange-900 hover:bg-orange-400 border border-orange-400 dark:bg-orange-900/30 dark:text-orange-200 dark:hover:bg-orange-800"
            onClick={() => setShowCalendarModal(true)}
          >
            ปฏิทินภาพรวม
          </button>
        </div>
      </div>

      {showHistoryModal &&
        (() => {
          console.log(
            "[Modal] leaveHistory (modalLeaveHistory):",
            modalLeaveHistory
          );
          return null;
        })()}
      <EmployeeLeaveHistoryModal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        leaveHistory={modalLeaveHistory}
        department={fDept}
      />
      <LeaveCalendarModal
        open={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
      />

      {/* Filters */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="สังกัด"
          value={fOrg}
          onChange={setFOrg}
          options={opts.org}
        />
        <Select
          label="แผนก"
          value={fDept}
          onChange={setFDept}
          options={opts.dept}
        />
        <Select
          label="ฝ่าย"
          value={fDivision}
          onChange={setFDivision}
          options={opts.division}
        />
        <Select
          label="หน่วย"
          value={fUnit}
          onChange={setFUnit}
          options={opts.unit}
        />
        <div>
          <label className="block text-sm text-slate-900 dark:text-slate-100">
            ค้นหา
          </label>
          <input
            placeholder="ชื่อ / EMP No. / เหตุผล"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-xl border p-3
                       border-slate-300 bg-white text-slate-900 placeholder-slate-400
                       focus:border-slate-400 focus:ring-2 focus:ring-slate-300/60
                       dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100
                       dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700/40"
          />
        </div>
      </div>

      {/* Bulk action bar */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-500">
          เลือกรายการ: {selectedIds.size}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg px-3 py-1 text-sm
                       bg-emerald-600 text-white hover:bg-emerald-700
                       disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            onClick={() => approveIds(Array.from(selectedIds))}
            disabled={selectedIds.size === 0}
          >
            อนุมัติที่เลือก
          </button>
          <button
            className="rounded-lg px-3 py-1 text-sm
                       bg-rose-600 text-white hover:bg-rose-700
                       disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-600"
            onClick={() => rejectIds(Array.from(selectedIds))}
            disabled={selectedIds.size === 0}
          >
            ไม่อนุมัติที่เลือก
          </button>
        </div>
      </div>

      {/* Table (responsive) */}
      <div
        className="mt-3 rounded-xl border overflow-x-auto
                      border-slate-300 bg-white shadow-sm
                      dark:border-white/10 dark:bg-white/5"
      >
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-900 text-center dark:bg-slate-900/40 dark:text-slate-100">
            <tr>
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหมด"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                />
              </Th>
              <Th>ลำดับ</Th>
              <Th>ชื่อ - สกุล</Th>
              <Th className="text-center">ประเภทลา</Th>
              <Th className="text-center">รายละเอียดการลา</Th>
              <Th className="text-center">วันที่แจ้งลา</Th>
              <Th className="text-center">Level P</Th>
              <Th className="text-center">สถานะ</Th>
              <Th className="text-center pr-3">Approve</Th>
            </tr>
          </thead>
          <tbody className="text-slate-900 dark:text-slate-100">
            {loading ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                >
                  กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                >
                  ไม่พบรายการ
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => {
                const checked = selectedIds.has(r.id);
                const employee = r.user.employee;
                const name = `${employee?.firstName || ""} ${
                  employee?.lastName || ""
                }`.trim();
                const empNo = employee?.empNo || "-";
                const org = `${employee?.org || "-"}/${
                  employee?.department || "-"
                }/${employee?.division || "-"}/${employee?.unit || "-"}`;

                return (
                  <tr
                    key={r.id}
                    className={`border-t border-slate-200 hover:bg-slate-50/70
                                dark:border-white/5 dark:hover:bg-white/10 cursor-pointer ${
                                  selectedId === r.id
                                    ? "bg-slate-50/70 dark:bg-white/10"
                                    : ""
                                }`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <Td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`เลือก ${name}`}
                        checked={checked}
                        onChange={() => toggleRow(r.id)}
                      />
                    </Td>
                    <Td className="text-center">{i + 1}</Td>
                    <Td>
                      <div className="font-medium text-slate-900 dark:text-slate-100 text-left">
                        {name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 text-left">
                        {empNo} • {org}
                      </div>
                    </Td>
                    <Td className=" text-center">{formatKind(r.kind)}</Td>
                    <Td className=" text-center">
                      {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                      <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {r.reason}
                      </div>
                    </Td>
                    <Td className="text-center">{fmtDate(r.createdAt)}</Td>
                    <Td className=" text-center">{employee?.levelP || "-"}</Td>
                    <Td className=" text-center">
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="text-right pr-3">
                      <div className="inline-flex gap-2 sm:gap-3">
                        <button
                          className="rounded-lg px-3 py-1 text-sm bg-emerald-600 text-white hover:bg-emerald-700
                                     dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            approveIds([r.id]);
                          }}
                        >
                          อนุมัติ
                        </button>
                        <button
                          className="rounded-lg px-3 py-1 text-sm bg-rose-600 text-white hover:bg-rose-700
                                     dark:bg-rose-500 dark:hover:bg-rose-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            rejectIds([r.id]);
                          }}
                        >
                          ไม่อนุมัติ
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Details Panel */}
      <div className="mt-6 rounded-2xl border p-4 border-slate-300 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        <h3 className="text-base font-semibold mb-3 text-slate-900 dark:text-slate-100">
          รายละเอียดคำขอ
        </h3>
        {selected ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(() => {
                const employee = selected.user.employee;
                const name = `${employee?.firstName || ""} ${
                  employee?.lastName || ""
                }`.trim();
                const empNo = employee?.empNo || "-";
                const org = `${employee?.org || "-"} / ${
                  employee?.department || "-"
                } / ${employee?.division || "-"} / ${employee?.unit || "-"}`;
                const photoUrl =
                  employee?.photoUrl ||
                  employee?.avatar ||
                  `/uploads/avatars/${empNo}.jpg`;
                return (
                  <>
                    <div className="sm:col-start-3 sm:row-start-1 flex items-start justify-end">
                      <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <img
                          src={photoUrl || "/images/avatar-placeholder.png"}
                          alt={`${employee?.firstName || ""} ${
                            employee?.lastName || ""
                          }`}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "/images/avatar-placeholder.png";
                          }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3 sm:row-start-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <ReadField
                        label="ชื่อ - สกุล (ผู้ขอ)"
                        value={`${name} • ${empNo}`}
                      />
                      <ReadField
                        label="สังกัด / แผนก / ฝ่าย / หน่วย"
                        value={org}
                      />
                      <ReadField
                        label="Level P"
                        value={employee?.levelP || "-"}
                      />
                      <ReadField label="ประเภทลา" value={formatKind(selected.kind)} />
                      <ReadField
                        label="วันที่ลา"
                        value={`${fmtDate(selected.startDate)} - ${fmtDate(
                          selected.endDate
                        )}`}
                      />
                      <ReadField
                        label="วันที่แจ้งลา"
                        value={fmtDate(selected.createdAt)}
                      />
                      <ReadField
                        label="สถานะ"
                        value={<StatusBadge status={selected.status} />}
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            <div>
              <div className="mb-1 text-sm text-slate-900 dark:text-slate-100">
                รายละเอียด (เหตุผลการลา)
              </div>
              <div className="rounded-xl border p-3 border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100">
                {selected.reason || "-"}
              </div>
            </div>

            {/* attachments */}
            <div>
              <div className="mb-1 text-sm text-slate-900 dark:text-slate-100">
                ไฟล์แนบ
              </div>
              <div className="rounded-xl border p-2 border-slate-300 bg-white dark:border-white/10 dark:bg-slate-800/80">
                {selected?.attachments && selected.attachments.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {selected.attachments.map((att) => {
                      const url =
                        (att as any).url || (att as any).attachmentUrl || "";
                      const name =
                        (att as any).name ||
                        (att as any).filename ||
                        url.split("/").pop() ||
                        "ไฟล์แนบ";
                      return (
                        <div
                          key={(att as any).id ?? name}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 py-1"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-slate-800 dark:text-slate-100 truncate">
                              {name}
                            </div>
                            {(att as any).description && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {(att as any).description}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 mt-2 sm:mt-0">
                            <button
                              type="button"
                              onClick={() => url && openAttachment(url)}
                              className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-lg hover:bg-yellow-500"
                            >
                              ดู
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                url && downloadAttachment(url, name)
                              }
                              className="px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                            >
                              ดาวน์โหลด
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    ไม่มีไฟล์แนบ
                  </div>
                )}
              </div>
            </div>
            {/* <div className="mt-2">
              <div className="text-xs text-slate-400">DEBUG: selected object</div>
              <pre className="text-xs text-white bg-black/20 p-2 rounded max-h-40 overflow-auto">{JSON.stringify(selected, null, 2)}</pre>
            </div> */}

            {/* approval info if resolved */}
            {selected.status !== "PENDING" && (
              <div className="border-t pt-4 border-slate-200 dark:border-slate-700">
                <h4 className="text-sm font-semibold mb-2 text-slate-900 dark:text-slate-100">
                  ข้อมูลการอนุมัติ
                </h4>
                <div className="grid gap-2">
                  {selected.approverReason && (
                    <ReadField
                      label="เหตุผลจากผู้อนุมัติ"
                      value={selected.approverReason}
                    />
                  )}
                  {selected.approverSignature && (
                    <div>
                      <div className="mb-1 text-sm text-slate-900 dark:text-slate-100">
                        ลายเซ็นผู้อนุมัติ
                      </div>
                      <div className="rounded-xl border p-2 border-slate-300 bg-white dark:border-white/10 dark:bg-slate-800/80">
                        <img
                          src={selected.approverSignature}
                          alt="ลายเซ็นผู้อนุมัติ"
                          className="max-h-20"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* approver reason */}
            <div>
              <label className="block text-sm text-slate-900 dark:text-slate-100 mb-1">
                เหตุผลในการอนุมัติ/ไม่อนุมัติ
              </label>
              <textarea
                value={approverReason}
                onChange={(e) => setApproverReason(e.target.value)}
                className="w-full rounded-xl border p-3 h-24 border-slate-300 bg-white text-slate-900 placeholder-slate-400
                           focus:border-slate-400 focus:ring-2 focus:ring-slate-300/60
                           dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100
                           dark:placeholder-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700/40"
                placeholder="ระบุเหตุผลในการอนุมัติหรือไม่อนุมัติ"
              />
            </div>

            {/* Signature (uses wrapper component) */}
            <div>
              <label className="block text-sm text-slate-900 dark:text-slate-100 mb-1">
                ลายเซ็น
              </label>
              <div className="border rounded-xl p-3 border-slate-300 bg-white dark:border-white/10 dark:bg-slate-800/80">
                {/* ให้ pad มีความสูงที่เหมาะสม และสามารถย่อ/ขยายได้ */}
                <div className="w-full">
                  <SignaturePadWrapper
                    ref={sigRef}
                    className="w-full h-40 sm:h-28 rounded bg-white"
                  />
                </div>

                {/* ปรับให้ปุ่ม wrap ได้บนหน้าจอเล็ก และแต่ละปุ่มไม่ยืดจนล้น */}
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  {savedSignatureExists && (
                    <button
                      type="button"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex-shrink-0 sm:flex-shrink-0 w-full sm:w-auto"
                      onClick={() => {
                        const s =
                          typeof window !== "undefined"
                            ? localStorage.getItem(signatureStorageKey)
                            : null;
                        if (s) setApproverSignature(s);
                      }}
                    >
                      ใช้ลายเซ็นที่บันทึกไว้
                    </button>
                  )}

                  {savedSignatureExists && (
                    <button
                      type="button"
                      className="px-4 py-2 bg-orange-400 text-orange-900 rounded-lg hover:bg-orange-500 flex-shrink-0 w-full sm:w-auto"
                      onClick={deleteSavedSignature}
                    >
                      ลบลายเซ็นที่บันทึกไว้
                    </button>
                  )}

                  <button
                    onClick={clearSignature}
                    className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600 flex-shrink-0 w-full sm:w-auto"
                  >
                    ล้างลายเซ็น
                  </button>

                  <button
                    onClick={saveSignature}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex-shrink-0 w-full sm:w-auto"
                  >
                    บันทึกลายเซ็น
                  </button>

                  <label className="ml-0 sm:ml-2 inline-flex items-center gap-2 text-sm w-full sm:w-auto">
                    <input
                      type="checkbox"
                      checked={rememberSignature}
                      onChange={(e) => setRememberSignature(e.target.checked)}
                    />
                    <span>บันทึกลายเซ็นสำหรับครั้งต่อไป</span>
                  </label>

                  {approverSignature && (
                    <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center w-full sm:w-auto">
                      ✓ บันทึกลายเซ็นแล้ว
                    </span>
                  )}
                </div>

                {approverSignature && (
                  <div className="mt-3">
                    <div className="mb-1 text-sm text-slate-900 dark:text-slate-100">
                      ตัวอย่างลายเซ็น
                    </div>
                    <div className="rounded border p-2 border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800">
                      <img
                        src={approverSignature}
                        alt="preview signature"
                        className="max-h-24 w-full object-contain bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <button
                className="rounded-xl px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
                onClick={() => rejectIds([selected.id])}
              >
                ไม่อนุมัติ
              </button>
              <button
                className="rounded-xl px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                onClick={() => approveIds([selected.id])}
              >
                อนุมัติ
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 dark:text-slate-400">
            เลือกแถวจากตารางด้านบนเพื่อดูรายละเอียด
          </div>
        )}
      </div>

      {/* Toast */}
      <div className="sr-only" aria-live="polite">
        {toast?.msg}
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div
            className={`rounded-xl px-4 py-3 text-white ${
              toast.type === "success" ? "bg-emerald-600/90" : "bg-rose-600/90"
            }`}
          >
            {toast.msg}
            <button
              className="ml-3 border border-white/20 rounded px-2 text-xs"
              onClick={() => setToast(null)}
              aria-label="ปิดการแจ้งเตือน"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Small components ---------------- */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!triggerRef.current) return;
    setMenuWidth(triggerRef.current.offsetWidth);
  }, [triggerRef.current, value, options.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <label className="block">
        <span className="mb-1 block text-sm text-slate-700 dark:text-slate-300">
          {label}
        </span>

        <div>
          <button
            type="button"
            ref={triggerRef}
            onClick={() => setOpen((v) => !v)}
            className="w-full rounded-xl border p-3 flex items-center justify-between
                       border-slate-300 bg-white text-slate-900 text-left
                       dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className={value ? "" : "text-slate-400"}>
              {value || "ทั้งหมด"}
            </span>
            <span className="ml-2 text-xs opacity-70">▾</span>
          </button>

          {open && (
            <div
              role="listbox"
              aria-label={label}
              className="absolute z-50 mt-2 rounded-xl border shadow-lg overflow-auto max-h-60 bg-white dark:bg-slate-800/90 dark:border-white/10"
              style={{ width: menuWidth }}
            >
              <div className="py-1">
                <div
                  role="option"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange("");
                    setOpen(false);
                  }}
                  className={`px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    value === ""
                      ? "font-medium"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  ทั้งหมด
                </div>
                {options.map((o) => (
                  <div
                    key={o}
                    role="option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(o);
                      setOpen(false);
                    }}
                    className={`px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${
                      value === o
                        ? "font-medium"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {o}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </label>
    </div>
  );
}
function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 text-slate-900 dark:text-slate-100 ${className}`}>
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td
      className={`px-3 py-2 align-top text-slate-900 dark:text-slate-100 ${className}`}
      onClick={onClick}
    >
      {children}
    </td>
  );
}
function ReadField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-sm text-slate-700 dark:text-slate-300">
        {label}
      </div>
      <div className="rounded-xl border p-2 border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}
function StatusBadge({ status }: { status: LeaveStatus }) {
  const map: Record<string, string> = {
    PENDING:
      "bg-yellow-200 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700/40",
    APPROVED:
      "bg-green-200 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/40",
    REJECTED:
      "bg-red-200 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40",
  };
  const label =
    status === "PENDING"
      ? "รออนุมัติ"
      : status === "APPROVED"
      ? "อนุมัติแล้ว"
      : "ไม่อนุมัติ";
  const className = map[status] || map["PENDING"];
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${className}`}
    >
      {label}
    </span>
  );
}

function formatKind(kind: string) {
  switch (kind) {
    case "ANNUAL":
      return "Annual";
    case "ANNUAL_HOLIDAY":
      return "Public holiday"; // คำที่ต้องการให้ลูกค้าดู
    case "SICK":
      return "Sick";
    case "UNPAID":
      return "Unpaid";
    case "ORDIN":
      return "Ordain";
    // เพิ่มกรณีอื่นตามที่มีในระบบ
    default:
      return kind.replace(/_/g, " ").toLowerCase();
  }
}

/* ---------------- Utils ---------------- */
function fmtDate(s: string) {
  if (!s) return "-";
  const date = new Date(s);
  if (isNaN(date.getTime())) return "-";

  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}
