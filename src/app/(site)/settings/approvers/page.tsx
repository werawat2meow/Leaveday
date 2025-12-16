"use client";

import ApproverListModal, {
  type Approver,
} from "@/components/ApproverListModal";
import { useEffect, useState } from "react";

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
  orgId?: number | null;
  departmentId?: number | null;
  divisionId?: number | null;
  unitId?: number | null;
  level?: string;
  levelP?: string;
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
  orgId: null,
  departmentId: null,
  divisionId: null,
  unitId: null,
  level: "",
  levelP: "",
  lineId: "",
  email: "",
};

export default function ApproversPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(init);
  const [saving, setSaving] = useState(false);
  const [orgs, setOrgs] = useState<Array<{ id: number; name: string }>>([]);
  const [depts, setDepts] = useState<Array<{ id: number; name: string }>>([]);
  const [divs, setDivs] = useState<Array<{ id: number; name: string }>>([]);
  const [units, setUnits] = useState<Array<{ id: number; name: string }>>([]);

  const setF = (patch: Partial<Form>) => setForm((p) => ({ ...p, ...patch }));

  // --- load lists for cascading selects ---
  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data))
          setOrgs(
            data.map((o: any) => ({
              id: o.id,
              name: o.name ?? o.title ?? o.org ?? String(o.id),
            }))
          );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.orgId) {
      setDepts([]);
      return;
    }
    fetch(`/api/organizations/${form.orgId}/departments`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data))
          setDepts(
            data.map((d: any) => ({
              id: d.id,
              name: d.name ?? d.title ?? d.department ?? String(d.id),
            }))
          );
      })
      .catch(() => setDepts([]));
  }, [form.orgId]);

  useEffect(() => {
    if (!form.departmentId) {
      setDivs([]);
      return;
    }
    fetch(`/api/departments/${form.departmentId}/divisions`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data))
          setDivs(
            data.map((d: any) => ({
              id: d.id,
              name: d.name ?? d.title ?? d.division ?? String(d.id),
            }))
          );
      })
      .catch(() => setDivs([]));
  }, [form.departmentId]);

  useEffect(() => {
    if (!form.divisionId) {
      setUnits([]);
      return;
    }
    fetch(`/api/divisions/${form.divisionId}/units`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data))
          setUnits(
            data.map((u: any) => ({
              id: u.id,
              name: u.name ?? u.title ?? u.unit ?? String(u.id),
            }))
          );
      })
      .catch(() => setUnits([]));
  }, [form.divisionId]);

  const handlePick = (a: Approver) => {
    console.log("[PICK]", a);

    setForm((prev) => ({
      ...prev,
      // id
      id: a.id ?? prev.id ?? null,
      // คำนำหน้า
      prefix: a._raw?.prefix ?? prev.prefix ?? "",

      // ชื่อ–นามสกุล
      firstNameTh: a._raw?.firstNameTh ?? prev.firstNameTh ?? "",
      lastNameTh: a._raw?.lastNameTh ?? prev.lastNameTh ?? "",
      firstNameEn: a._raw?.firstNameEn ?? prev.firstNameEn ?? "",
      lastNameEn: a._raw?.lastNameEn ?? prev.lastNameEn ?? "",

      // รหัสพนักงาน / บัตรประชาชน
      empNo: a.empNo ?? a._raw?.empNo ?? "",
      citizenId: a._raw?.citizenId ?? prev.citizenId ?? "",

      // โครงสร้างหน่วยงาน (ทั้งชื่อและ id ถ้ามี)
      org: a.org ?? a._raw?.org ?? "",
      department: a.dept ?? a._raw?.department ?? "",
      division: a.division ?? a._raw?.division ?? "",
      unit: a.unit ?? a._raw?.unit ?? "",
      orgId: (a as any).orgId ?? a._raw?.orgId ?? null,
      departmentId:
        (a as any).departmentId ??
        a._raw?.departmentId ??
        a._raw?.deptId ??
        null,
      divisionId: (a as any).divisionId ?? a._raw?.divisionId ?? null,
      unitId: (a as any).unitId ?? a._raw?.unitId ?? null,
      level: a.level ?? a._raw?.level ?? "",
      levelP: (function (v: any) {
        const raw =
          v ?? (a as any).levelP ?? a._raw?.levelP ?? a._raw?.level ?? a.level;
        if (raw == null) return "";
        const s = String(raw);
        if (s.startsWith("P")) return s;
        if (/^\d+$/.test(s)) return `P${s}`;
        return s;
      })(a.level),

      // อื่น ๆ
      lineId: a._raw?.lineId ?? "",
      email: a.email ?? a._raw?.email ?? "",
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
      orgId: a.orgId ?? null,
      departmentId: a.departmentId ?? null,
      divisionId: a.divisionId ?? null,
      unitId: a.unitId ?? null,
      level: a.level ?? "",
      levelP:
        a.levelP ??
        (a.level
          ? String(a.level).startsWith("P")
            ? String(a.level)
            : `P${String(a.level)}`
          : ""),
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
      // ส่งทั้งชื่อและ id เหมือนหน้าพนักงาน (DB มีคอลัมน์ name/text และ <model>Id)
      // Build payload but do NOT send `levelP` key to approvers API (model uses `level`)
      const payloadAny: any = {
        prefix: form.prefix ?? null,
        firstNameTh: form.firstNameTh,
        lastNameTh: form.lastNameTh,
        firstNameEn: form.firstNameEn ?? null,
        lastNameEn: form.lastNameEn ?? null,
        empNo: form.empNo,
        citizenId: form.citizenId ?? null,
        org: form.org ?? null,
        department: form.department ?? null,
        division: form.division ?? null,
        unit: form.unit ?? null,
        // Approver model expects `level` (not levelP)
        level: form.levelP ?? form.level ?? null,
        lineId: form.lineId ?? null,
        email: form.email?.trim().toLowerCase() ?? null,
        orgId: form.orgId ?? null,
        departmentId: form.departmentId ?? null,
        divisionId: form.divisionId ?? null,
        unitId: form.unitId ?? null,
      };
      const payload = payloadAny;
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
        <Field
          label="คำนำหน้าชื่อ"
          value={form.prefix ?? ""}
          onChange={(v) => setF({ prefix: v })}
        />
        <Field
          label="ชื่อ (ไทย)"
          value={form.firstNameTh}
          onChange={(v) => setF({ firstNameTh: v })}
        />
        <Field
          label="นามสกุล (ไทย)"
          value={form.lastNameTh}
          onChange={(v) => setF({ lastNameTh: v })}
        />
        <Field
          label="ชื่อ (อังกฤษ)"
          value={form.firstNameEn ?? ""}
          onChange={(v) => setF({ firstNameEn: v })}
        />
        <Field
          label="นามสกุล (อังกฤษ)"
          value={form.lastNameEn ?? ""}
          onChange={(v) => setF({ lastNameEn: v })}
        />
        <Field
          label="รหัสพนักงาน"
          value={form.empNo}
          onChange={(v) => setF({ empNo: v })}
        />
        <Field
          label="บัตรประชาชน"
          value={form.citizenId ?? ""}
          onChange={(v) => setF({ citizenId: v })}
        />
        <SelectField
          label="สังกัด"
          value={form.orgId ?? ""}
          options={orgs}
          onChange={(v) => {
            const id = v ? Number(v) : null;
            const sel = orgs.find((o) => String(o.id) === v);
            setF({
              orgId: id,
              org: sel?.name ?? (v ? String(v) : ""),
              departmentId: null,
              department: "",
              divisionId: null,
              division: "",
              unitId: null,
              unit: "",
            });
          }}
        />
        <SelectField
          label="แผนก"
          value={form.departmentId ?? ""}
          options={depts}
          onChange={(v) => {
            const id = v ? Number(v) : null;
            const sel = depts.find((d) => String(d.id) === v);
            setF({
              departmentId: id,
              department: sel?.name ?? (v ? String(v) : ""),
              divisionId: null,
              division: "",
              unitId: null,
              unit: "",
            });
          }}
        />
        <SelectField
          label="ฝ่าย"
          value={form.divisionId ?? ""}
          options={divs}
          onChange={(v) => {
            const id = v ? Number(v) : null;
            const sel = divs.find((d) => String(d.id) === v);
            setF({
              divisionId: id,
              division: sel?.name ?? (v ? String(v) : ""),
              unitId: null,
              unit: "",
            });
          }}
        />
        <SelectField
          label="หน่วย"
          value={form.unitId ?? ""}
          options={units}
          onChange={(v) => {
            const id = v ? Number(v) : null;
            const sel = units.find((u) => String(u.id) === v);
            setF({ unitId: id, unit: sel?.name ?? (v ? String(v) : "") });
          }}
        />
        <label>
          Level P
          <select
            className="neon-input w-full rounded-xl p-3"
            value={form.level ?? ""}
            onChange={(e) => setF({ level: e.target.value })}
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
          value={form.lineId ?? ""}
          onChange={(v) => setF({ lineId: v })}
        />
        <Field
          label="Email"
          type="email"
          value={form.email ?? ""}
          onChange={(v) => setF({ email: v })}
        />
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

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  options: Array<{ id: number; name: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="neon-input w-full rounded-xl p-3"
      >
        <option value="">{placeholder ?? "- เลือก -"}</option>
        {options.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
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
