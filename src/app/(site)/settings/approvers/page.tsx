"use client";

import { useState } from "react";
import ApproverListModal, { type Approver } from "@/components/ApproverListModal";

type Form = {
  id?: number | null;
  prefix?: string;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn?: string;
  lastNameEn?: string;
  empNo: string;
  citizenId?: string;
  org?: string;
  department?: string;
  division?: string;
  unit?: string;
  level?: string;
  lineId?: string;
  email?: string;
};

const init: Form = {
  id: null,
  prefix: "",
  firstNameTh: "",
  lastNameTh: "",
  firstNameEn: "",
  lastNameEn: "",
  empNo: "",
  citizenId: "",
  org: "",
  department: "",
  division: "",
  unit: "",
  level: "",
  lineId: "",
  email: "",
};

export default function ApproversPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(init);
  const [saving, setSaving] = useState(false);

  const setF = (patch: Partial<Form>) => setForm((p) => ({ ...p, ...patch }));

const handlePick = (a: Approver) => {
  console.log("[PICK]", a);

  setForm(prev => ({
    ...prev,
    // id
    id: a.id ?? prev.id ?? null,
    // คำนำหน้า
    prefix: a._raw?.prefix ?? prev.prefix ?? "",

    // ชื่อ–นามสกุล
    firstNameTh: a._raw?.firstNameTh ?? prev.firstNameTh ?? "",
    lastNameTh:  a._raw?.lastNameTh  ?? prev.lastNameTh  ?? "",
    firstNameEn: a._raw?.firstNameEn ?? prev.firstNameEn ?? "",
    lastNameEn:  a._raw?.lastNameEn  ?? prev.lastNameEn  ?? "",

    // รหัสพนักงาน / บัตรประชาชน
    empNo:      a.empNo ?? a._raw?.empNo ?? "",
    citizenId:  a._raw?.citizenId ?? prev.citizenId ?? "",

    // โครงสร้างหน่วยงาน
    org:        a.org        ?? a._raw?.org        ?? "",
    department: a.dept       ?? a._raw?.department ?? "",
    division:   a.division   ?? a._raw?.division   ?? "",
    unit:       a.unit       ?? a._raw?.unit       ?? "",
    level:      a.level      ?? a._raw?.level      ?? "",

    // อื่น ๆ
    lineId:     a._raw?.lineId ?? "",
    email:      a.email ?? a._raw?.email ?? "",
  }));

  setOpen(false);
};

  function mapApproverToForm(a: any): Form {
    return {
      id: a.id ?? null,
      prefix: a.prefix ?? "",
      firstNameTh: a.firstNameTh ?? "",
      lastNameTh: a.lastNameTh ?? "",
      firstNameEn: a.firstNameEn ?? "",
      lastNameEn: a.lastNameEn ?? "",
      empNo: a.empNo ?? "",
      citizenId: a.citizenId ?? "",
      org: a.org ?? "",
      department: a.department ?? "",
      division: a.division ?? "",
      unit: a.unit ?? "",
      level: a.level ?? "",
      lineId: a.lineId ?? "",
      email: a.email ?? "",
    };
  }

  async function handleSave() {
    if (!form.firstNameTh || !form.lastNameTh || !form.empNo) {
      alert("กรุณากรอกชื่อ-สกุล (ไทย) และรหัสพนักงาน");
      return;
    }
    if (!form.email) {
      alert("กรุณากรอกอีเมล");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      alert("รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, email: form.email?.trim().toLowerCase() };
      const isEdit = !!form.id;
      const url = isEdit ? `/api/approvers?id=${form.id}` : "/api/approvers";
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

      // ✅ คงค่าไว้ตามที่บันทึกสำเร็จ (ใช้ค่าจากเซิร์ฟเวอร์)
      setForm(mapApproverToForm(data));

      // แจ้งรหัสเริ่มต้นเฉพาะตอน "เพิ่มใหม่" (ถ้ามี)
      if (!isEdit && data?.__tmpPassword) {
        alert(`บันทึกสำเร็จ\nรหัสเริ่มต้นของผู้ใช้: ${data.__tmpPassword}`);
      } else {
        alert("บันทึกสำเร็จ");
      }
    } catch (e) {
      console.error(e);
      alert("เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      role="tabpanel"
      aria-label="เพิ่มผู้มีสิทธิ์อนุมัติ"
      className="neon-card rounded-2xl p-6"
    >
      <div className="mb-4 flex item-center justify-between gap-3">
        <h2 className="neon-title text-lg font-semibold mb-4">
          เพิ่มผู้มีสิทธิ์อนุมัติ
        </h2>
        <button
          type="button"
          className="neon-title cursor-pointer rounded-xl px-4 py-2 border border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
          onClick={() => setOpen(true)}
        >
          รายชื่อผู้มีสิทธิ์อนุมัติ
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="คำนำหน้าชื่อ" value={form.prefix ?? ""} onChange={(v) => setF({ prefix: v })} />
        <Field label="ชื่อ (ไทย)" value={form.firstNameTh} onChange={(v) => setF({ firstNameTh: v })} />
        <Field label="นามสกุล (ไทย)" value={form.lastNameTh} onChange={(v) => setF({ lastNameTh: v })} />
        <Field label="ชื่อ (อังกฤษ)" value={form.firstNameEn ?? ""} onChange={(v) => setF({ firstNameEn: v })} />
        <Field label="นามสกุล (อังกฤษ)" value={form.lastNameEn ?? ""} onChange={(v) => setF({ lastNameEn: v })} />
        <Field label="รหัสพนักงาน" value={form.empNo} onChange={(v) => setF({ empNo: v })} />
        <Field label="บัตรประชาชน" value={form.citizenId ?? ""} onChange={(v) => setF({ citizenId: v })} />
        <Field label="สังกัด" value={form.org ?? ""} onChange={(v) => setF({ org: v })} />
        <Field label="แผนก" value={form.department ?? ""} onChange={(v) => setF({ department: v })} />
        <Field label="ฝ่าย" value={form.division ?? ""} onChange={(v) => setF({ division: v })} />
        <Field label="หน่วย" value={form.unit ?? ""} onChange={(v) => setF({ unit: v })} />
        <Field label="Level P" value={form.level ?? ""} onChange={(v) => setF({ level: v })} />
        <Field label="Line ID" value={form.lineId ?? ""} onChange={(v) => setF({ lineId: v })} />
        <Field label="Email" type="email" value={form.email ?? ""} onChange={(v) => setF({ email: v })} />
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-ghost" onClick={() => setForm(init)}>
          ล้างฟอร์ม
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>

      <ApproverListModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={handlePick}
      />
    </section>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="neon-input w-full rounded-xl p-3"
      />
    </label>
  );
}
