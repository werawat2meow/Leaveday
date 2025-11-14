"use client";

import { useEffect, useRef, useState } from "react";
import EmployeeListModal, { type Employee } from "@/components/EmployeeListModal";

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
  if (API_BASE && x.startsWith(API_BASE + "/uploads")) return x.slice(API_BASE.length);
  if (x.startsWith("/uploads/")) return x;
  return `/uploads/${x.replace(/^\/+/, "")}`;
}

export default function ProfileSettingsPage() {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickFile = () => inputRef.current?.click();

  const [openEmpModal, setOpenEmpModal] = useState(false);

  const [form, setForm] = useState<EmployeeForm>({
    id: null,
    empNo: "",
    firstName: "",
    lastName: "",
  });
  const [saving, setSaving] = useState(false);
  const setF = (patch: Partial<EmployeeForm>) => setForm(prev => ({ ...prev, ...patch }));

  // ✅ เมื่อเลือกจากโมดัล → กรอกฟอร์มครบทุกฟิลด์
function handlePickEmployee(e: Employee) {
  if (e._raw) {
    setForm(mapEmployeeToForm(e._raw));
  } else {
    const parts = (e.name || "").trim().split(/\s+/);
    const first = parts[0] ?? "";
    const last  = parts.slice(1).join(" ");
    setForm(prev => ({
      ...prev,
      id: e.id ?? prev.id ?? null,
      empNo: e.empNo || prev.empNo,
      firstName: first || prev.firstName,
      lastName:  last  || prev.lastName,
      department: e.dept ?? prev.department,
    }));
  }

  // ✅ สำคัญ: รีเซ็ตพรีวิวไฟล์ท้องถิ่น เพื่อให้ใช้รูปจาก form.photoUrl
  setPhotoFile(null);
  setPhotoUrl(null);
}

  async function handleSave() {
    if (!form.empNo)   { alert("กรุณากรอกรหัสพนักงาน"); return; }
    if (!form.firstName || !form.lastName) { alert("กรุณากรอกชื่อ-นามสกุล"); return; }
    if (!form.email)   { alert("กรุณากรอกอีเมล"); return; }
    if (!form.idCard)  { alert("กรุณากรอกเลขบัตรประชาชน"); return; }

  setSaving(true);
  try {
    let photoUrlForDb = form.photoUrl ?? null;

    if (photoFile) {
      const fd = new FormData();
      fd.append("file", photoFile);
      const up = await fetch("/api/uploads", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) { alert(upData?.error ?? "อัปโหลดรูปไม่สำเร็จ"); return; }
      photoUrlForDb = upData.url as string;
    } else {
      // ✅ แปลง URL เต็มเป็น path ก่อนบันทึก
      photoUrlForDb = toDbPath(photoUrlForDb);
    }

    const payload = { ...form, photoUrl: photoUrlForDb };
    const isEdit = !!form.id;
    const url = isEdit ? `/api/employees?id=${form.id}` : "/api/employees";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data?.error ?? "บันทึกไม่สำเร็จ"); return; }

    setForm(mapEmployeeToForm(data));
    alert("บันทึกสำเร็จ");
  } catch (e) {
    console.error("[EMP_SAVE] unexpected error:", e);
    alert("เกิดข้อผิดพลาด");
  } finally {
    setSaving(false);
  }
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
  }

  function onClearClick() {
    const ok = window.confirm("ต้องการล้างฟอร์มทั้งหมดหรือไม่?");
    if (!ok) return;
    resetForm();
  }

  // preview รูป
  useEffect(() => {
    if (!photoFile) { setPhotoUrl(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { alert("กรุณาเลือกไฟล์รูปภาพ"); return; }
    setPhotoFile(f);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { alert("กรุณาเลือกไฟล์รูปภาพ"); return; }
    setPhotoFile(f);
  }
  const onDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  function removePhoto() {
    setPhotoFile(null);
    setPhotoUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section role="tabpanel" aria-label="เพิ่มข้อมูล" className="neon-card rounded-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="neon-title text-base sm:text-lg font-semibold mb-4">เพิ่มข้อมูล</h2>
        <button
          type="button"
          className="neon-title rounded-xl px-4 py-2 border border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
          onClick={() => setOpenEmpModal(true)}
        >
          รายชื่อพนักงาน
        </button>
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
              {(photoUrl || form.photoUrl) ? (
                <img src={resolveImageUrl(photoUrl || form.photoUrl)}
                  onError={(e)=>console.warn("[IMG ERROR]", (e.currentTarget as HTMLImageElement).src)} className="h-full w-full object-cover" />
              ) : (
                <div className="text-[var(--muted)] text-sm whitespace-normal break-words">
                  ยังไม่มีรูป
                  <div className="mt-1 opacity-80">You can drag and drop images here.</div>
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
                <button type="button" onClick={() => setF({ photoUrl: "" })} className="btn btn-outline">
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
          <Field label="คำนำหน้าชื่อ" placeholder="เช่น นาย / นาง / นางสาว"
            value={form.prefix ?? ""} onChange={v => setF({ prefix: v })} />
          <Field label="ชื่อ" placeholder="ชื่อ"
            value={form.firstName} onChange={v => setF({ firstName: v })}/>
          <Field label="นามสกุล" placeholder="นามสกุล"
            value={form.lastName} onChange={v => setF({ lastName: v })}/>

          <Field label="รหัสพนักงาน (EMP No.)" placeholder="เช่น EMP001"
            value={form.empNo} onChange={v => setF({ empNo: v })}/>
          <Field label="บัตรประชาชน" placeholder="เลขบัตรประชาชน"
            value={form.idCard ?? ""} onChange={v => setF({ idCard: v })} />
          <Field label="สังกัด" placeholder="สังกัด"
            value={form.org ?? ""} onChange={v => setF({ org: v })}/>

          <Field label="แผนก" placeholder="แผนก"
            value={form.department ?? ""} onChange={v => setF({ department: v })}/>
          <Field label="ฝ่าย" placeholder="ฝ่าย"
            value={form.division ?? ""} onChange={v => setF({ division: v })}/>
          <Field label="หน่วย" placeholder="หน่วย"
            value={form.unit ?? ""} onChange={v => setF({ unit: v })}/>

          <Field label="Level P" placeholder="P1 / P2 / P3 ..."
            value={form.levelP ?? ""} onChange={v => setF({ levelP: v })}/>
          <Field label="สิทธิ์ลาป่วย" placeholder="(อายุงาน + ตำแหน่ง)"
            value={form.sickDays ?? 0} onChange={v => setF({ sickDays: v === "" ? 0 : Number(v) })}/>
          <Field label="สิทธิ์ลาพักร้อน" placeholder="(อายุงาน + ตำแหน่ง)"
            value={form.vacationDays ?? 0} onChange={v => setF({ vacationDays: v === "" ? 0 : Number(v) })}/>

          <Field label="สิทธิ์ลากิจ" placeholder="(อายุงาน + ตำแหน่ง)"
            value={form.businessDays ?? 0} onChange={v => setF({ businessDays: v === "" ? 0 : Number(v) })}/>
          <Field label="สิทธิ์ลาบวช" placeholder="จำนวนวัน"
            value={form.ordainDays ?? 0} onChange={v => setF({ ordainDays: v === "" ? 0 : Number(v) })}/>
          <Field label="สิทธิ์ลาคลอด" placeholder="จำนวนวัน"
            value={form.maternityDays ?? 0} onChange={v => setF({ maternityDays: v === "" ? 0 : Number(v) })}/>

          <Field label="ลาโดยไม่ได้รับค่าจ้าง" placeholder="จำนวนวัน"
            value={form.unpaidDays ?? 0} onChange={v => setF({ unpaidDays: v === "" ? 0 : Number(v) })}/>
          <Field label="ลาวันเกิด" placeholder="จำนวนวัน"
            value={form.birthdayDays ?? 0} onChange={v => setF({ birthdayDays: v === "" ? 0 : Number(v) })}/>
          <Field label="วันหยุดประจำปี" placeholder="(จำนวนวัน)"
            value={form.annualHolidays ?? 0} onChange={v => setF({ annualHolidays: v === "" ? 0 : Number(v) })}/>

          <Field label="Line ID" placeholder="@line id"
            value={form.lineId ?? ""} onChange={v => setF({ lineId: v })}/>
          <Field label="เริ่มงานวันที่" type="date"
            value={form.startDate ?? ""} onChange={v => setF({ startDate: v })}/>
          <Field label="วันหยุดประจำสัปดาห์ (Default)" placeholder="ตัวอย่าง วันอาทิตย์"
            value={form.weeklyHoliday ?? ""} onChange={v => setF({ weeklyHoliday: v })} />
          <Field label="Email" placeholder="Emp001@company.com" type="email"
            value={form.email ?? ""} onChange={v => setF({ email: v })}/>
          <Field label="Photo URL (ถ้ามี)" placeholder="https://..."
            value={form.photoUrl ?? ""} onChange={(v) => setF({ photoUrl: v })} />
        </div>
      </div>

      {/* ปุ่ม */}
      <div className="mt-5 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
        <button type="button" 
          onClick={onClearClick}
          className="rounded-xl px-4 py-2 border border-white/10 hover:bg-white/5"
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
      <span className="mb-1 block text-sm whitespace-normal break-words">{label}</span>
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
