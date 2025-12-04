"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import SignaturePad from "signature_pad";
import EmployeeLeaveHistoryModal from "@/components/EmployeeLeaveHistoryModal";
import LeaveCalendarModal from "@/components/LeaveCalendarModal";

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
    };
  };
};

/* ---------------- API Functions ---------------- */
async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
  try {
    const response = await fetch('/api/approvals');
    if (!response.ok) throw new Error('Failed to fetch leaves');
    const data = await response.json();
    
    // 🔍 Debug log
    console.log('🔄 [Approvals] API Response:', data);
    console.log('🔄 [Approvals] Is Array?', Array.isArray(data));
    console.log('🔄 [Approvals] data.data?', data.data);
    
    const result = Array.isArray(data) ? data : data.data || [];
    console.log('🔄 [Approvals] Final result:', result);
    console.log('🔄 [Approvals] Result length:', result.length);
    
    return result;
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    return [];
  }
}

async function updateLeaveStatus(id: number, status: LeaveStatus, approverReason?: string, approverSignature?: string) {
  try {
    const response = await fetch(`/api/leaves/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, approverReason, approverSignature })
    });
    if (!response.ok) throw new Error('Failed to update leave status');
    return await response.json();
  } catch (error) {
    console.error('Error updating leave status:', error);
    throw error;
  }
}

/* ---------------- Page ---------------- */
export default function ApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LeaveRequest[]>([]);

  // selection
  const [selectedId, setSelectedId] = useState<number | null>(null); // สำหรับ panel ด้านล่าง
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set()); // สำหรับ bulk

  // approver inputs
  const [approverReason, setApproverReason] = useState("");
  const [approverSignature, setApproverSignature] = useState<string | null>(null);
  const sigCanvasRef = useRef<SignatureCanvas | null>(null);
  const signaturePadRef = useRef<HTMLCanvasElement | null>(null);
  const signaturePadInstance = useRef<SignaturePad | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [fOrg, setFOrg] = useState("");
  const [fDept, setFDept] = useState("");
  const [fDivision, setFDivision] = useState("");
  const [fUnit, setFUnit] = useState("");

  // toast
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // leaveHistory สำหรับ modal (ทุกคนในแผนก)
  const [modalLeaveHistory, setModalLeaveHistory] = useState<LeaveRequest[]>([]);

  // ดึง leave ทุกคนในแผนกเมื่อเปิด modal
  useEffect(() => {
    if (!showHistoryModal) return;
    // TODO: เปลี่ยน 'IT' เป็นชื่อแผนกจริงที่ต้องการ filter
    fetch('/api/leaves/all?department=IT')
      .then(res => res.json())
      .then(json => {
        // map ให้ตรงกับ LeaveRequest ที่ modal ใช้ (เพิ่ม approverName, handoverTo)
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
          approverName: l.approverName || l.approver?.name || l.approver || '',
          handoverTo: l.handoverTo || '',
          createdAt: l.createdAt,
          user: {
            name: l.user?.name,
            employee: {
              empNo: l.user?.employee?.empNo || '',
              firstName: l.user?.employee?.firstName || '',
              lastName: l.user?.employee?.lastName || '',
              org: l.user?.employee?.org || '',
              department: l.user?.employee?.department || '',
              division: l.user?.employee?.division || '',
              unit: l.user?.employee?.unit || '',
              levelP: l.user?.employee?.levelP || '',
            }
          }
        }));
        setModalLeaveHistory(mapped);
      });
  }, [showHistoryModal]);

  // Debug log: จำนวน leave request ที่ modal ได้รับ
  useEffect(() => {
    if (showHistoryModal) {
      console.log('[Modal] leaveHistory count:', data.length);
      console.log('[Modal] leaveHistory:', data);
    }
  }, [showHistoryModal, data]);

  // load data from API
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const leaves = await fetchLeaveRequests();
      setData(leaves);
      setLoading(false);
    };
    loadData();
  }, []);

  // initialize signature pad when modal opens
  useEffect(() => {
    if (selectedId && signaturePadRef.current) {
      // Destroy existing instance
      if (signaturePadInstance.current) {
        signaturePadInstance.current.off();
      }
      
      // Wait for modal to fully render
      setTimeout(() => {
        const canvas = signaturePadRef.current;
        if (canvas) {
          // Get actual canvas size from CSS
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          
          // Set canvas size to match display size
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          
          // Scale canvas back down using CSS
          canvas.style.width = rect.width + 'px';
          canvas.style.height = rect.height + 'px';
          
          // Scale the drawing context so everything draws at the correct size
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.scale(dpr, dpr);
          }
          
          // Initialize signature pad
          signaturePadInstance.current = new SignaturePad(canvas, {
            backgroundColor: 'rgb(255, 255, 255)',
            penColor: 'rgb(0, 0, 0)',
            minWidth: 1,
            maxWidth: 3,
          });
          
          console.log('SignaturePad initialized with proper scaling');
        }
      }, 100);
    }
  }, [selectedId]);

  // options
  const opts = useMemo(() => {
    const getUnique = (field: string) => {
      return Array.from(new Set(
        data.map(x => x.user.employee?.[field as keyof typeof x.user.employee])
          .filter(Boolean)
      )).sort() as string[];
    };
    return { 
      org: getUnique("org"), 
      dept: getUnique("department"), 
      division: getUnique("division"), 
      unit: getUnique("unit") 
    };
  }, [data]);

  // filter result
  const filtered = useMemo(() => {
    return data.filter((r) => {
      const employee = r.user.employee;
      const name = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
      const empNo = employee?.empNo || '';
      const hitQ = !q || [empNo, name, r.kind, r.reason || ''].join(" ").toLowerCase().includes(q.toLowerCase());
      const hit = (!fOrg || employee?.org === fOrg) && 
                  (!fDept || employee?.department === fDept) && 
                  (!fDivision || employee?.division === fDivision) && 
                  (!fUnit || employee?.unit === fUnit);
      return hitQ && hit;
    });
  }, [data, q, fOrg, fDept, fDivision, fUnit]);

  const selected = useMemo(() => data.find((d) => d.id === selectedId) || null, [data, selectedId]);

  // selection helpers
  const toggleRow = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const visibleIds = filtered.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
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
      // อัปเดตแต่ละรายการใน API
      await Promise.all(
        ids.map(id => updateLeaveStatus(id, status, approverReason || undefined, approverSignature || undefined))
      );
      
      // อัปเดต local state
      setData((prev) => prev.map((r) => {
        if (ids.includes(r.id)) {
          return { 
            ...r, 
            status,
            approverReason: approverReason || undefined,
            approverSignature: approverSignature || undefined
          };
        }
        return r;
      }));
      
      setToast({
        type: status === "APPROVED" ? "success" : "error",
        msg: `${status === "APPROVED" ? "อนุมัติ" : "ไม่อนุมัติ"}แล้ว ${ids.length} รายการ`,
      });
      
      setSelectedIds(new Set()); // clear selection
      setApproverReason(""); // clear approver reason
      setApproverSignature(null); // clear signature
      sigCanvasRef.current?.clear();
      setTimeout(() => setToast(null), 2000);
    } catch (error) {
      console.error('Error updating status:', error);
      setToast({
        type: "error",
        msg: "เกิดข้อผิดพลาดในการอัปเดตสถานะ",
      });
      setTimeout(() => setToast(null), 2000);
    }
  }
  const approveIds = (ids: number[]) => updateStatus(ids, "APPROVED");
  const rejectIds = (ids: number[]) => updateStatus(ids, "REJECTED");

  const clearSignature = () => {
    if (signaturePadInstance.current) {
      signaturePadInstance.current.clear();
    }
    // fallback for react-signature-canvas
    sigCanvasRef.current?.clear();
    setApproverSignature(null);
  };

  const saveSignature = () => {
    if (signaturePadInstance.current && !signaturePadInstance.current.isEmpty()) {
      try {
        const dataURL = signaturePadInstance.current.toDataURL("image/png");
        setApproverSignature(dataURL);
      } catch (error) {
        console.error('Error saving signature:', error);
      }
    } else {
      // fallback for react-signature-canvas
      if (sigCanvasRef.current) {
        try {
          const canvas = sigCanvasRef.current.getCanvas();
          const dataURL = canvas.toDataURL("image/png");
          setApproverSignature(dataURL);
        } catch (error) {
          console.error('Fallback signature save failed:', error);
        }
      }
    }
  };

  return (
    <section className="neon-card rounded-2xl p-6 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <h2 className="neon-title text-lg font-semibold text-slate-900 dark:text-slate-100">รายการคำขอลา</h2>
          <div className="flex gap-2">
            <button
              className="rounded-lg px-4 py-2 bg-yellow-200 text-yellow-900 hover:bg-yellow-300 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:hover:bg-yellow-800"
              onClick={() => { setShowHistoryModal(true) }}
            >
              ดูประวัติการลา
            </button>
            <button
              className="rounded-lg px-4 py-2 bg-orange-300 text-orange-900 hover:bg-orange-400 border border-orange-400 dark:bg-orange-900/30 dark:text-orange-200 dark:hover:bg-orange-800"
              onClick={() => setShowCalendarModal(true)}
            >
              ดูปฏิทินภาพรวม
            </button>
          </div>
      </div>
      {/* Debug: log leaveHistory prop before rendering modal */}
      {showHistoryModal && (
        (() => { console.log('[Modal] leaveHistory (modalLeaveHistory):', modalLeaveHistory); return null; })()
      )}
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
        <Select label="สังกัด" value={fOrg} onChange={setFOrg} options={opts.org} />
        <Select label="แผนก" value={fDept} onChange={setFDept} options={opts.dept} />
        <Select label="ฝ่าย" value={fDivision} onChange={setFDivision} options={opts.division} />
        <Select label="หน่วย" value={fUnit} onChange={setFUnit} options={opts.unit} />
        <div>
          <label className="block text-sm text-slate-900 dark:text-slate-100">ค้นหา</label>
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
        <div className="text-sm text-slate-600 dark:text-slate-300">เลือกรายการ: {selectedIds.size}</div>
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

      {/* Table (responsive + higher contrast in light) */}
      <div className="mt-3 rounded-xl border overflow-x-auto
                      border-slate-300 bg-white shadow-sm
                      dark:border-white/10 dark:bg-white/5">
        <table className="w-full min-w-[900px] text-sm">
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
              <Th className="hidden md:table-cell">ประเภทลา</Th>
              <Th className="hidden lg:table-cell">รายละเอียดการลา</Th>
              <Th className="hidden sm:table-cell">Level P</Th>
              <Th className="hidden sm:table-cell">สถานะ</Th>
              <Th className="text-right pr-3">Approve</Th>
            </tr>
          </thead>
          <tbody className="text-slate-900 dark:text-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  กำลังโหลดข้อมูล...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  ไม่พบรายการ
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => {
                const checked = selectedIds.has(r.id);
                const employee = r.user.employee;
                const name = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
                const empNo = employee?.empNo || '-';
                const org = `${employee?.org || '-'}/${employee?.department || '-'}/${employee?.division || '-'}/${employee?.unit || '-'}`;
                
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-slate-200 hover:bg-slate-50/70
                                dark:border-white/5 dark:hover:bg-white/10 cursor-pointer ${
                                  selectedId === r.id ? "bg-slate-50/70 dark:bg-white/10" : ""
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
                      <div className="font-medium text-slate-900 dark:text-slate-100 text-left">{name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 text-left">
                        {empNo} • {org}
                      </div>
                    </Td>
                    <Td className="hidden md:table-cell text-center">{r.kind}</Td>
                    <Td className="hidden lg:table-cell text-center">
                      {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                      <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{r.reason}</div>
                    </Td>
                    <Td className="hidden sm:table-cell text-center">{employee?.levelP || '-'}</Td>
                    <Td className="hidden sm:table-cell text-center">
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="text-right pr-3">
                      <div className="inline-flex gap-2 sm:gap-3">
                        <button
                          className="rounded-lg px-3 py-1 text-sm bg-emerald-600 text-white hover:bg-emerald-700
                                     dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          onClick={(e) => { e.stopPropagation(); approveIds([r.id]); }}
                        >
                          อนุมัติ
                        </button>
                        <button
                          className="rounded-lg px-3 py-1 text-sm bg-rose-600 text-white hover:bg-rose-700
                                     dark:bg-rose-500 dark:hover:bg-rose-600"
                          onClick={(e) => { e.stopPropagation(); rejectIds([r.id]); }}
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
        <h3 className="text-base font-semibold mb-3 text-slate-900 dark:text-slate-100">รายละเอียดคำขอ</h3>
        {selected ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {(() => {
                const employee = selected.user.employee;
                const name = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
                const empNo = employee?.empNo || '-';
                const org = `${employee?.org || '-'} / ${employee?.department || '-'} / ${employee?.division || '-'} / ${employee?.unit || '-'}`;
                
                return (
                  <>
                    <ReadField label="ชื่อ - สกุล (ผู้ขอ)" value={`${name} • ${empNo}`} />
                    <ReadField
                      label="องค์กร / แผนก / ฝ่าย / หน่วย"
                      value={org}
                    />
                    <ReadField label="Level P" value={employee?.levelP || '-'} />
                    <ReadField label="ประเภทลา" value={selected.kind} />
                    <ReadField label="วันที่ลา" value={`${fmtDate(selected.startDate)} - ${fmtDate(selected.endDate)}`} />
                    <ReadField label="สถานะ" value={<StatusBadge status={selected.status} />} />
                  </>
                );
              })()}
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-900 dark:text-slate-100">รายละเอียด (เหตุผลการลา)</div>
              <div className="rounded-xl border p-3 border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100">
                {selected.reason || "-"}
              </div>
            </div>

            {/* แสดงข้อมูลผู้อนุมัติ (ถ้ามี) */}
            {selected.status !== "PENDING" && (
              <div className="border-t pt-4 border-slate-200 dark:border-slate-700">
                <h4 className="text-sm font-semibold mb-2 text-slate-900 dark:text-slate-100">ข้อมูลการอนุมัติ</h4>
                <div className="grid gap-2">
                  {selected.approverReason && (
                    <ReadField label="เหตุผลจากผู้อนุมัติ" value={selected.approverReason} />
                  )}
                  {selected.approverSignature && (
                    <div>
                      <div className="mb-1 text-sm text-slate-900 dark:text-slate-100">ลายเซ็นผู้อนุมัติ</div>
                      <div className="rounded-xl border p-2 border-slate-300 bg-white dark:border-white/10 dark:bg-slate-800/80">
                        <img src={selected.approverSignature} alt="ลายเซ็นผู้อนุมัติ" className="max-h-20" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* เหตุผลของผู้อนุมัติ */}
            <div>
              <label className="block text-sm text-slate-900 dark:text-slate-100 mb-1">เหตุผลในการอนุมัติ/ไม่อนุมัติ</label>
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

            {/* Signature Canvas */}
            <div>
              <label className="block text-sm text-slate-900 dark:text-slate-100 mb-1">ลายเซ็น</label>
              <div className="border rounded-xl p-3 border-slate-300 bg-white dark:border-white/10 dark:bg-slate-800/80">
                <canvas
                  ref={signaturePadRef}
                  className="w-full h-40 border rounded bg-white border-slate-300"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={clearSignature}
                    className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
                  >
                    ล้างลายเซ็น
                  </button>
                  <button
                    onClick={saveSignature}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    บันทึกลายเซ็น
                  </button>
                  {approverSignature && (
                    <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center">
                      ✓ บันทึกลายเซ็นแล้ว
                    </span>
                  )}
                </div>
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
          <div className="text-slate-500 dark:text-slate-400">เลือกแถวจากตารางด้านบนเพื่อดูรายละเอียด</div>
        )}
      </div>

      {/* Toast */}
      <div className="sr-only" aria-live="polite">{toast?.msg}</div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div className={`rounded-xl px-4 py-3 text-white ${toast.type === "success" ? "bg-emerald-600/90" : "bg-rose-600/90"}`}>
            {toast.msg}
            <button className="ml-3 border border-white/20 rounded px-2 text-xs" onClick={() => setToast(null)} aria-label="ปิดการแจ้งเตือน">ปิด</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Small components ---------------- */
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[]; }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border p-3
                   border-slate-300 bg-white text-slate-900
                   focus:border-slate-400 focus:ring-2 focus:ring-slate-300/60
                   dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700/40"
      >
        <option value="">ทั้งหมด</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-slate-900 dark:text-slate-100 ${className}`}>{children}</th>;
}
function Td({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: React.MouseEventHandler<HTMLTableCellElement>; }) {
  return <td className={`px-3 py-2 align-top text-slate-900 dark:text-slate-100 ${className}`} onClick={onClick}>{children}</td>;
}
function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-sm text-slate-700 dark:text-slate-300">{label}</div>
      <div className="rounded-xl border p-2 border-slate-300 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-100">{value}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: LeaveStatus }) {
  const map: Record<string, string> = {
    "PENDING":  "bg-yellow-200 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700/40",
    "APPROVED": "bg-green-200 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/40", 
    "REJECTED": "bg-red-200 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40",
  };
  const label = status === "PENDING" ? "รออนุมัติ" : status === "APPROVED" ? "อนุมัติแล้ว" : "ไม่อนุมัติ";
  const className = map[status] || map["PENDING"];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${className}`}>{label}</span>;
}

/* ---------------- Utils ---------------- */
function fmtDate(s: string) {
  if (!s) return "-";
  // แปลง ISO string เป็น Date แล้วฟอร์แมต
  const date = new Date(s);
  if (isNaN(date.getTime())) return "-";
  
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}
