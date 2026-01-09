"use client";

import EmployeeListModal, {
  type Employee,
} from "@/components/EmployeeListModal";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// เพิ่ม: สำหรับ Approver
type Approver = {
  id: number;
  firstNameTh: string;
  lastNameTh: string;
  empNo: string;
};



type EmployeeForm = {
  id?: string | null;
  empNo: string;
  prefix?: string;
  email?: string;
  firstName: string;
  lastName: string;
  idCard?: string;
  org?: string;
  department?: string;
  division?: string;
  unit?: string;
  position?: string;
  levelP?: string;
  lineId?: string;
  startDate?: string;
  weeklyHoliday?: string;
  vacationDays?: number;
  businessDays?: number;
  sickDays?: number;
  ordainDays?: number;
  maternityDays?: number;
  unpaidDays?: number;
  birthdayDays?: number;
  annualHolidays?: number;
  photoUrl?: string;
  orgId?: number;
  departmentId?: number;
  divisionId?: number;
  unitId?: number;
};

function mapEmployeeToForm(e: any): EmployeeForm {
  return {
    id: e.id ? String(e.id) : null,
    empNo: e.empNo ?? "",
    prefix: e.prefix ?? "",
    email: e.email ?? "",
    firstName: e.firstName ?? "",
    lastName: e.lastName ?? "",
    idCard: e.idCard ?? "",
    org: e.org ?? "",
    department: e.department ?? "",
    division: e.division ?? "",
    unit: e.unit ?? "",
    position: e.position ?? "",
    levelP: e.levelP ?? "",
    lineId: e.lineId ?? "",
    startDate: e.startDate ? String(e.startDate).slice(0, 10) : "",
    weeklyHoliday: e.weeklyHoliday ?? "",
    vacationDays: Number(e.vacationDays ?? 0),
    businessDays: Number(e.businessDays ?? 0),
    sickDays: Number(e.sickDays ?? 0),
    ordainDays: Number(e.ordainDays ?? 0),
    maternityDays: Number(e.maternityDays ?? 0),
    unpaidDays: Number(e.unpaidDays ?? 0),
    birthdayDays: Number(e.birthdayDays ?? 0),
    annualHolidays: Number(e.annualHolidays ?? 0),
    orgId: e.orgId ?? undefined,
    departmentId: e.departmentId ?? undefined,
    divisionId: e.divisionId ?? undefined,
    unitId: e.unitId ?? undefined,
    photoUrl: e.photoUrl ?? "",
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function resolveImageUrl(u?: string | null) {
  if (!u) return "";
  const x = String(u).trim().replace(/\\/g, "/");

  // ✅ กรณีพรีวิวไฟล์ที่เพิ่งเลือก
  if (x.startsWith("blob:") || x.startsWith("data:")) return x;

  // absolute URL
  if (/^https?:\/\//i.test(x)) return x;

  // path จากเซิร์ฟเวอร์
  if (x.startsWith("/uploads")) return API_BASE ? `${API_BASE}${x}` : x;

  return API_BASE ? `${API_BASE}/uploads/${x}` : `/uploads/${x}`;
}

function toDbPath(u?: string | null) {
  if (!u) return null;
  const x = String(u).trim();
  if (x.startsWith("blob:") || x.startsWith("data:")) return null;
  if (API_BASE && x.startsWith(API_BASE + "/uploads"))
    return x.slice(API_BASE.length);
  if (x.startsWith("/uploads/")) return x;
  return `/uploads/${x.replace(/^\/+/, "")}`;
}

export default function ProfileSettingsPage() {

    const [form, setForm] = useState<any>({
    id: null,
    empNo: "",
    firstName: "",
    lastName: "",
    position: "",
    orgId: undefined,
    departmentId: undefined,
    divisionId: undefined,
    unitId: undefined,
  });
  // เพิ่ม state สำหรับ approverIds และ approvers
  const [approverIds, setApproverIds] = useState<number[]>([]);
  const [approvers, setApprovers] = useState<Approver[]>([]);
    // โหลดรายชื่อ Approver (อาจ filter ตามแผนก/สังกัดได้ถ้าต้องการ)
    // NOTE: don't clear approvers if we already have assigned approvers (e.g. when picking an employee)
    useEffect(() => {
      if (
        !form.orgId &&
        !form.departmentId &&
        !form.divisionId &&
        !form.unitId &&
        approvers.length === 0
      ) {
        setApprovers([]);
        return;
      }
      const params = new URLSearchParams({
        orgId: form.orgId ? String(form.orgId) : "",
        departmentId: form.departmentId ? String(form.departmentId) : "",
        divisionId: form.divisionId ? String(form.divisionId) : "",
        unitId: form.unitId ? String(form.unitId) : "",
      });
      fetch(`/api/approvers?${params.toString()}`)
        .then((res) => res.json())
        .then((list) => {
          const normalized = (list || []).map((a: any) => ({
            id: Number(a.id),
            firstNameTh: a.firstNameTh ?? a.firstName ?? "",
            lastNameTh: a.lastNameTh ?? a.lastName ?? "",
            empNo: a.empNo ?? "",
          }));
          setApprovers(normalized);
        })
        .catch(() => setApprovers([]));
    }, [form.orgId, form.departmentId, form.divisionId, form.unitId]);
  const { data: session } = useSession();
  const canImport = session?.user?.email === "master@company.com";
  const router = useRouter();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [searchApprover, setSearchApprover] = useState("");

  // helper: load the approver pool for given org/department/division/unit
  async function loadApproverPool(
    orgId?: number,
    departmentId?: number,
    divisionId?: number,
    unitId?: number
  ) {
    try {
      const params = new URLSearchParams({
        orgId: orgId ? String(orgId) : "",
        departmentId: departmentId ? String(departmentId) : "",
        divisionId: divisionId ? String(divisionId) : "",
        unitId: unitId ? String(unitId) : "",
      });
      const resp = await fetch(`/api/approvers?${params.toString()}`, { cache: "no-store" });
      if (!resp.ok) return [];
      const list = await resp.json();
      return (list || []).map((a: any) => ({
        id: Number(a.id),
        firstNameTh: a.firstNameTh ?? a.firstName ?? "",
        lastNameTh: a.lastNameTh ?? a.lastName ?? "",
        empNo: a.empNo ?? "",
      }));
    } catch (err) {
      console.warn("[LOAD_APPROVER_POOL]", err);
      return [];
    }
  }
  

  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const setF = (patch: Partial<EmployeeForm>) =>
    setForm((prev: EmployeeForm) => ({ ...prev, ...patch }));

  // --- useEffect สำหรับ dropdown ---
  // โหลดรายชื่อสังกัด (Organization) ตอน mount
  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then(setOrganizations)
      .catch(() => setOrganizations([]));
  }, []);

  // โหลดแผนกเมื่อ orgId เปลี่ยน (ไม่เคลียร์ค่าเลือกใน effect)
  useEffect(() => {
    if (!form.orgId) {
      setDepartments([]);
      setDivisions([]);
      setUnits([]);
      return;
    }
    fetch(`/api/organizations/${form.orgId}/departments`)
      .then((res) => res.json())
      .then((data) => {
        setDepartments(data);
      })
      .catch(() => {
        setDepartments([]);
      });
  }, [form.orgId]);

  // โหลดฝ่ายเมื่อ departmentId เปลี่ยน (ไม่เคลียร์ค่าเลือกใน effect)
  useEffect(() => {
    if (!form.departmentId) {
      setDivisions([]);
      setUnits([]);
      return;
    }
    fetch(`/api/departments/${form.departmentId}/divisions`)
      .then((res) => res.json())
      .then((data) => {
        setDivisions(data);
      })
      .catch(() => {
        setDivisions([]);
      });
  }, [form.departmentId]);

  // โหลดหน่วยเมื่อ divisionId เปลี่ยน (ไม่เคลียร์ค่าเลือกใน effect)
  useEffect(() => {
    if (!form.divisionId) {
      setUnits([]);
      return;
    }
    fetch(`/api/divisions/${form.divisionId}/units`)
      .then((res) => res.json())
      .then((data) => {
        setUnits(data);
      })
      .catch(() => {
        setUnits([]);
      });
  }, [form.divisionId]);

  // ลบ effect ที่ซ้ำ (เคยเคลียร์ค่าเลือกซ้ำ)

  const pickFile = () => inputRef.current?.click();
  const [openEmpModal, setOpenEmpModal] = useState(false);

  // ✅ เมื่อเลือกจากโมดัล → กรอกฟอร์มครบทุกฟิลด์
  async function handlePickEmployee(e: Employee) {
    if (e._raw) {
      const newForm = mapEmployeeToForm(e._raw);
      setForm(newForm);
      // โหลด dropdown แบบ chain เพื่อให้แสดงค่าที่เลือกไว้ถูกต้อง
      if (newForm.orgId) {
        fetch(`/api/organizations/${newForm.orgId}/departments`)
          .then((res) => res.json())
          .then((deps) => {
            setDepartments(deps);
            if (newForm.departmentId) {
              setF({ departmentId: newForm.departmentId });
              fetch(`/api/departments/${newForm.departmentId}/divisions`)
                .then((res) => res.json())
                .then((divs) => {
                  setDivisions(divs);
                  if (newForm.divisionId) {
                    setF({ divisionId: newForm.divisionId });
                    fetch(`/api/divisions/${newForm.divisionId}/units`)
                      .then((res) => res.json())
                      .then((units) => {
                        setUnits(units);
                        if (newForm.unitId) setF({ unitId: newForm.unitId });
                      });
                  }
                });
            }
          });
      }
      // assigned approvers (from modal) — keep as IDs
      const rawApprovers = e._raw?.approvers ?? [];
      const assignedIds = rawApprovers.map((a: any) => Number(a.id));

      // load full approver pool for this employee's org/department/etc
      const pool = await loadApproverPool(newForm.orgId, newForm.departmentId, newForm.divisionId, newForm.unitId);
      setApprovers(pool);
      // mark selected ones
      setApproverIds(assignedIds);

      // if modal didn't include assigned approvers, try fetching employee to get assigned list
      if (assignedIds.length === 0 && newForm.id) {
        try {
          const resp = await fetch(`/api/employees?id=${newForm.id}`, { cache: "no-store" });
          if (resp.ok) {
            const full = await resp.json();
            const fetched = full?.approvers ?? [];
            const fetchedIds = fetched.map((a: any) => Number(a.id));
            setApproverIds(fetchedIds);
          }
        } catch (err) {
          console.warn("[FETCH_EMP_APPROVERS]", err);
        }
      }
    } else {
      const parts = (e.name || "").trim().split(/\s+/);
      const first = parts[0] ?? "";
      const last = parts.slice(1).join(" ");
      setForm((prev: EmployeeForm) => ({
        ...prev,
        id: e.id ?? prev.id ?? null,
        empNo: e.empNo || prev.empNo,
        firstName: first || prev.firstName,
        lastName: last || prev.lastName,
        department: e.dept ?? prev.department,
      }));
      // Try fetch approvers by id if available (modal might provide only id/name)
      if (e.id) {
        try {
          const resp = await fetch(`/api/employees?id=${e.id}`, { cache: "no-store" });
          if (resp.ok) {
            const full = await resp.json();
            const fetched = full?.approvers ?? [];
            const fetchedIds = fetched.map((a: any) => Number(a.id));
            // load pool for the employee and set assigned ids
            const pool = await loadApproverPool(full?.orgId, full?.departmentId, full?.divisionId, full?.unitId);
            setApprovers(pool);
            setApproverIds(fetchedIds);
          } else {
            setApproverIds([]);
          }
        } catch (err) {
          console.warn("[FETCH_EMP_APPROVERS]", err);
          setApproverIds([]);
        }
      } else {
        setApproverIds([]);
      }
    }

    // ✅ สำคัญ: รีเซ็ตพรีวิวไฟล์ท้องถิ่น เพื่อให้ใช้รูปจาก form.photoUrl
    setPhotoFile(null);
    setPhotoUrl(null);
  }

  async function handleSave() {
    if (!form.empNo) {
      alert("กรุณากรอกรหัสพนักงาน");
      return;
    }
    if (!form.firstName || !form.lastName) {
      alert("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    if (!form.email) {
      alert("กรุณากรอกอีเมล");
      return;
    }
    if (!form.idCard) {
      alert("กรุณากรอกเลขบัตรประชาชน");
      return;
    }

    setSaving(true);
    try {
      let photoUrlForDb = form.photoUrl ?? null;

      if (photoFile) {
        const fd = new FormData();
        fd.append("file", photoFile);
        const up = await fetch("/api/uploads", { method: "POST", body: fd });
        const upData = await up.json();
        if (!up.ok) {
          alert(upData?.error ?? "อัปโหลดรูปไม่สำเร็จ");
          return;
        }
        photoUrlForDb = upData.url as string;
      } else {
        // ✅ แปลง URL เต็มเป็น path ก่อนบันทึก
        photoUrlForDb = toDbPath(photoUrlForDb);
      }

      const payload = {
        ...form,
        org: organizations.find((x) => x.id === form.orgId)?.name || "",
        department:
          departments.find((x) => x.id === form.departmentId)?.name || "",
        division: divisions.find((x) => x.id === form.divisionId)?.name || "",
        unit: units.find((x) => x.id === form.unitId)?.name || "",
        photoUrl: photoUrlForDb,
        approverIds, // เพิ่มตรงนี้
      };
      const isEdit = !!form.id;
      const url = isEdit ? `/api/employees?id=${form.id}` : "/api/employees";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      const newForm = mapEmployeeToForm(data);
      setForm(newForm);
      // determine assigned ids from response or fetch
      let assignedIds: number[] = [];
      if (Array.isArray(data?.approvers)) {
        assignedIds = (data.approvers || []).map((a: any) => Number(a.id));
      } else {
        try {
          const resp = await fetch(`/api/employees?id=${newForm.id}`, { cache: "no-store" });
          if (resp.ok) {
            const full = await resp.json();
            assignedIds = (full?.approvers || []).map((a: any) => Number(a.id));
          }
        } catch (err) {
          console.warn("[EMP_SAVE] fallback fetch error", err);
        }
      }

      // load pool based on newForm's org/department/etc and set assigned ids
      const pool = await loadApproverPool(newForm.orgId, newForm.departmentId, newForm.divisionId, newForm.unitId);
      setApprovers(pool);
      setApproverIds(assignedIds);
      // โหลด dropdown ตาม id ที่ได้มาใหม่
      if (newForm.orgId) {
        fetch(`/api/organizations/${newForm.orgId}/departments`)
          .then((res) => res.json())
          .then(setDepartments);
      }
      if (newForm.departmentId) {
        fetch(`/api/departments/${newForm.departmentId}/divisions`)
          .then((res) => res.json())
          .then(setDivisions);
      }
      if (newForm.divisionId) {
        fetch(`/api/divisions/${newForm.divisionId}/units`)
          .then((res) => res.json())
          .then(setUnits);
      }
      alert("บันทึกสำเร็จ");
      // hard reload to ensure latest data is shown immediately
      try {
        window.location.reload();
      } catch (e) {
        // ignore
      }
    } catch (e) {
      console.error("[EMP_SAVE] unexpected error:", e);
      alert("เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportExcel() {
    if (!importFile) {
      alert("กรุณาเลือกไฟล์ Excel ก่อน");
      return;
    }

    setImporting(true);
    try {
      const formdata = new FormData();
      formdata.append("file", importFile);

      const res = await fetch("/api/employees/import", {
        method: "POST",
        body: formdata,
      });

      const result = await res.json();
      if (!res.ok) {
        alert(result?.error ?? "Import ไม่สำเร็จ");
        return;
      }

      alert(`Import สำเร็จ! เพิ่มพนักงาน ${result.success} คน`);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
    } catch (e) {
      console.error("[IMPORT_ERROR]", e);
      alert("เกิดข้อผิดพลาดในการ Import");
    } finally {
      setImporting(false);
    }
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/)) {
      alert("กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)");
      return;
    }
    setImportFile(file);
  }

  function resetForm() {
    setForm({
      id: null,
      empNo: "",
      prefix: "",
      email: "",
      firstName: "",
      lastName: "",
      idCard: "",
      org: "",
      department: "",
      division: "",
      unit: "",
      position: "",
      levelP: "",
      lineId: "",
      startDate: "",
      weeklyHoliday: "",
      vacationDays: 0,
      businessDays: 0,
      sickDays: 0,
      ordainDays: 0,
      maternityDays: 0,
      unpaidDays: 0,
      birthdayDays: 0,
      annualHolidays: 0,
      photoUrl: "",
    });
    setPhotoFile(null);
    setPhotoUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    setApproverIds([]);
  }

  function onClearClick() {
    const ok = window.confirm("ต้องการล้างฟอร์มทั้งหมดหรือไม่?");
    if (!ok) return;
    resetForm();
  }

  // preview รูป
  useEffect(() => {
    if (!photoFile) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    setPhotoFile(f);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    setPhotoFile(f);
  }
  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  function removePhoto() {
    setPhotoFile(null);
    setPhotoUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section
      role="tabpanel"
      aria-label="เพิ่มข้อมูล"
      className="neon-card rounded-2xl p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="neon-title text-base sm:text-lg font-semibold mb-4">
          เพิ่มข้อมูล
        </h2>
        <div className="flex items-center gap-2">
          {canImport && (
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={importInputRef}
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportFileChange}
              />
              <button
                type="button"
                className="neon-title rounded-xl px-4 py-2 border border-green-500 hover:bg-green-50 dark:border-green-400 dark:hover:bg-green-500/10 cursor-pointer text-sm"
                onClick={() => importInputRef.current?.click()}
              >
                เลือกไฟล์ Excel
              </button>
              {importFile && (
                <button
                  type="button"
                  className="neon-title rounded-xl px-4 py-2 bg-green-600 text-white hover:bg-green-700 cursor-pointer text-sm"
                  onClick={handleImportExcel}
                  disabled={importing}
                >
                  {importing ? "กำลัง Import..." : `Import ${importFile.name}`}
                </button>
              )}
            </div>
          )}
          <button
          type="button"
          onClick={() => setOpenEmpModal(true)}
          className="rounded-xl px-4 py-2 font-bold bg-yellow-50 text-yellow-900 border border-yellow-200 hover:bg-yellow-100 shadow-sm"
        >
          รายชื่อพนักงาน
        </button>
        </div>
      </div>

      {/* layout: ซ้ายรูป / ขวาฟอร์ม */}
      <div className="grid gap-6 md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        {/* ซ้าย: อัปโหลด/แสดงรูป */}
        <div className="min-w-0">
          <div
            onDrop={onDrop}
            onDragOver={onDrag}
            onDragEnter={onDrag}
            className="rounded-2xl border border-white/10 bg-[var(--input)] p-4 text-center"
          >
            <div className="aspect-square w-full rounded-xl overflow-hidden bg-black/20 flex items-center justify-center">
              {photoUrl || form.photoUrl ? (
                <img
                  src={resolveImageUrl(photoUrl || form.photoUrl)}
                  onError={(e) =>
                    console.warn(
                      "[IMG ERROR]",
                      (e.currentTarget as HTMLImageElement).src
                    )
                  }
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-[var(--muted)] text-sm whitespace-normal break-words">
                  ยังไม่มีรูป
                  <div className="mt-1 opacity-80">
                    You can drag and drop images here.
                  </div>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />

            <div className="mt-3 flex flex-col sm:flex-row gap-2 justify-center">
              <button type="button" onClick={pickFile} className="btn btn-soft">
                เพิ่มรูป
              </button>
              {form.photoUrl && !photoUrl && (
                <button
                  type="button"
                  onClick={() => setF({ photoUrl: "" })}
                  className="btn btn-outline"
                >
                  ลบรูป
                </button>
              )}
            </div>

            <p className="mt-2 text-xs text-[var(--muted)] break-words">
              รองรับไฟล์ภาพ เช่น JPG, PNG (แนะนำขนาดสี่เหลี่ยมจัตุรัส)
            </p>
          </div>
        </div>

        {/* ขวา: ฟอร์ม */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
          <Field
            label="คำนำหน้าชื่อ"
            placeholder="เช่น นาย / นาง / นางสาว"
            value={form.prefix ?? ""}
            onChange={(v) => setF({ prefix: v })}
          />
          <Field
            label="ชื่อ"
            placeholder="ชื่อ"
            value={form.firstName}
            onChange={(v) => setF({ firstName: v })}
          />
          <Field
            label="นามสกุล"
            placeholder="นามสกุล"
            value={form.lastName}
            onChange={(v) => setF({ lastName: v })}
          />

          <Field
            label="รหัสพนักงาน (EMP No.)"
            placeholder="เช่น EMP001"
            value={form.empNo}
            onChange={(v) => setF({ empNo: v })}
          />
          <Field
            label="บัตรประชาชน"
            placeholder="เลขบัตรประชาชน"
            value={form.idCard ?? ""}
            onChange={(v) => setF({ idCard: v })}
          />
          <label>
            สังกัด
            <select
              className="neon-input w-full rounded-xl p-3"
              value={form.orgId || ""}
              onChange={(e) => {
                const v = Number(e.target.value) || undefined;
                setF({
                  orgId: v,
                  departmentId: undefined,
                  divisionId: undefined,
                  unitId: undefined,
                });
              }}
            >
              <option value="">เลือกสังกัด</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            แผนก
            <select
              className="neon-input w-full rounded-xl p-3"
              value={form.departmentId || ""}
              onChange={(e) => {
                const v = Number(e.target.value) || undefined;
                setF({
                  departmentId: v,
                  divisionId: undefined,
                  unitId: undefined,
                });
              }}
              disabled={!departments.length}
            >
              <option value="">เลือกแผนก</option>
              {departments.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            ฝ่าย
            <select
              className="neon-input w-full rounded-xl p-3"
              value={form.divisionId || ""}
              onChange={(e) => {
                const v = Number(e.target.value) || undefined;
                setF({ divisionId: v, unitId: undefined });
              }}
              disabled={!divisions.length}
            >
              <option value="">เลือกฝ่าย</option>
              {divisions.map((div) => (
                <option key={div.id} value={div.id}>
                  {div.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            หน่วย
            <select
              className="neon-input w-full rounded-xl p-3"
              value={form.unitId || ""}
              onChange={(e) =>
                setF({ unitId: Number(e.target.value) || undefined })
              }
              disabled={!units.length}
            >
              <option value="">เลือกหน่วย</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>

          <Field
            label="ตำแหน่ง"
            placeholder="ตำแหน่ง"
            value={form.position ?? ""}
            onChange={(v) => setF({ position: v })}
          />

          <label>
            Level P
            <select
              className="neon-input w-full rounded-xl p-3"
              value={form.levelP || ""}
              onChange={(e) => setF({ levelP: e.target.value })}
            >
              <option value="">เลือก Level P</option>
              {Array.from({ length: 11 }, (_, i) => `P${i + 2}`).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <Field
            label="Line ID"
            placeholder="@line id"
            value={form.lineId ?? ""}
            onChange={(v) => setF({ lineId: v })}
          />
          <Field
            label="เริ่มงานวันที่"
            type="date"
            value={form.startDate ?? ""}
            onChange={(v) => setF({ startDate: v })}
          />
          <Field
            label="วันหยุดประจำสัปดาห์ (Default)"
            placeholder="ตัวอย่าง อาทิตย์"
            value={form.weeklyHoliday ?? ""}
            onChange={(v) => setF({ weeklyHoliday: v })}
          />
          <Field
            label="Email"
            placeholder="Emp001@company.com"
            type="email"
            value={form.email ?? ""}
            onChange={(v) => setF({ email: v })}
          />
          <Field
            label="Photo URL (ถ้ามี)"
            placeholder="https://..."
            value={form.photoUrl ?? ""}
            onChange={(v) => setF({ photoUrl: v })}
          />

          {/* Multi-select Approver */}
          <label className="block">
            ผู้อนุมัติ
            <input
              type="text"
              placeholder="ค้นหาชื่อผู้อนุมัติ..."
              className="neon-input w-full rounded-xl p-2 mb-2"
              value={searchApprover}
              onChange={e => setSearchApprover(e.target.value)}
            />
            <div className="flex flex-col gap-1 mt-1 max-h-40 overflow-y-auto border rounded-xl p-2 bg-white/5">
              {approvers
                .filter(a =>
                  `${a.firstNameTh} ${a.lastNameTh} ${a.empNo}`
                    .toLowerCase()
                    .includes(searchApprover.toLowerCase())
                )
                .map(a => (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={approverIds.includes(a.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setApproverIds([...approverIds, a.id]);
                        } else {
                          setApproverIds(approverIds.filter(id => id !== a.id));
                        }
                      }}
                    />
                    <span>
                      {a.firstNameTh} {a.lastNameTh}
                    </span>
                  </label>
                ))}
              {approvers.length === 0 && (
                <span className="text-xs text-gray-400">ไม่มีผู้อนุมัติในสังกัดนี้</span>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* ปุ่ม */}
      <div className="mt-5 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onClearClick}
          className="rounded-xl px-4 py-2 font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 shadow-sm"
        >
          ล้างฟอร์ม
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl px-5 py-2 font-extrabold bg-[var(--cyan)] text-[#001418] shadow-[0_10px_28px_var(--cyan-soft)]"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>

      {/* Modal รายชื่อพนักงาน (ไม่ส่ง MOCK, ให้มัน fetch เอง) */}
      <EmployeeListModal
        open={openEmpModal}
        onClose={() => setOpenEmpModal(false)}
        onSelect={handlePickEmployee}
      />
    </section>
  );
}

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value?: string | number;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm whitespace-normal break-words">
        {label}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value as any}
        onChange={(e) => onChange?.(e.target.value)}
        className="neon-input w-full rounded-xl p-3"
      />
    </label>
  );
}
