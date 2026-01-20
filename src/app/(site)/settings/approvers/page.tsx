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
  allowCrossOrg?: boolean;
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
  allowCrossOrg: false,
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

    const handlePick = async (a: Approver) => {
    console.log("[PICK]", a);
    // map minimal -> form
    let mapped = mapApproverToForm(a as any);

    // fallback: ถ้าไม่มี id ของสังกัด/แผนก/ฝ่าย ให้ดึงข้อมูลเต็มจาก server
    const needFull =
      (!!mapped.id &&
        ((!mapped.orgId && !mapped.departmentId && !mapped.divisionId) ||
          typeof mapped.allowCrossOrg === "undefined"));

    if (needFull && mapped.id) {
      try {
        const r = await fetch(`/api/approvers?id=${mapped.id}`, { cache: "no-store" });
        if (r.ok) {
          const full = await r.json();
          mapped = mapApproverToForm(full);
        }
      } catch (err) {
        console.warn("[PICK_FETCH_FULL_FAIL]", err);
      }
    }

    // try resolve orgId from loaded orgs if missing
    if (!mapped.orgId && mapped.org) {
      const foundOrg = orgs.find(
        (o) =>
          (o.name ?? "").trim() === String(mapped.org).trim() ||
          String(o.id) === String(mapped.org)
      );
      if (foundOrg) mapped.orgId = foundOrg.id;
    }

    try {
      if (mapped.orgId) {
        const depsRes = await fetch(`/api/organizations/${mapped.orgId}/departments`);
        const depsData = await depsRes.json().catch(() => []);
        const mappedDeps = Array.isArray(depsData)
          ? depsData.map((d: any) => ({ id: d.id, name: d.name ?? d.title ?? d.department ?? String(d.id) }))
          : [];
        setDepts(mappedDeps);

        if (!mapped.departmentId && mapped.department) {
          const fd = mappedDeps.find((d) => d.name === mapped.department || String(d.id) === String(mapped.department));
          if (fd) mapped.departmentId = fd.id;
        }

        if (mapped.departmentId) {
          const divRes = await fetch(`/api/departments/${mapped.departmentId}/divisions`);
          const divsData = await divRes.json().catch(() => []);
          const mappedDivs = Array.isArray(divsData)
            ? divsData.map((d: any) => ({ id: d.id, name: d.name ?? d.title ?? d.division ?? String(d.id) }))
            : [];
          setDivs(mappedDivs);

          if (!mapped.divisionId && mapped.division) {
            const fv = mappedDivs.find((d) => d.name === mapped.division || String(d.id) === String(mapped.division));
            if (fv) mapped.divisionId = fv.id;
          }

          if (mapped.divisionId) {
            const uRes = await fetch(`/api/divisions/${mapped.divisionId}/units`);
            const uData = await uRes.json().catch(() => []);
            const mappedUnits = Array.isArray(uData)
              ? uData.map((u: any) => ({ id: u.id, name: u.name ?? u.title ?? u.unit ?? String(u.id) }))
              : [];
            setUnits(mappedUnits);

            if (!mapped.unitId && mapped.unit) {
              const fu = mappedUnits.find((u) => u.name === mapped.unit || String(u.id) === String(mapped.unit));
              if (fu) mapped.unitId = fu.id;
            }
          }
        }
      }
    } catch (err) {
      console.warn("[PICK_RESOLVE]", err);
    }

    setForm(mapped);
    setOpen(false);
  };

  

function mapApproverToForm(a: any): Form {
  const raw = a?._raw ?? a ?? {};

  const getId = (...keys: string[]) => {
    for (const k of keys) {
      const v = a?.[k] ?? raw?.[k];
      if (v !== undefined && v !== null && v !== "") return Number(v);
    }
    return null;
  };

  const getName = (...keys: string[]) => {
    for (const k of keys) {
      const v = a?.[k] ?? raw?.[k];
      if (v !== undefined && v !== null) return String(v);
    }
    return "";
  };

  const anyLevel = a?.level ?? raw?.level ?? a?.levelP ?? raw?.levelP;
  const levelP =
    a?.levelP ??
    raw?.levelP ??
    (anyLevel
      ? String(anyLevel).startsWith("P")
        ? String(anyLevel)
        : `P${String(anyLevel)}`
      : "");

  return {
    id: getId("id", "Id", "ID"),
    prefix: getName("prefix", "title", "prefixName"),
    firstNameTh: getName("firstNameTh", "first_name_th", "firstName"),
    lastNameTh: getName("lastNameTh", "last_name_th", "lastName"),
    firstNameEn: getName("firstNameEn", "first_name_en"),
    lastNameEn: getName("lastNameEn", "last_name_en"),
    empNo: getName("empNo", "employeeNo", "emp_no"),
    citizenId: getName("citizenId", "citizen_id"),
    org: getName("org", "organization", "orgName", "org_name"),
    department: getName("department", "dept", "departmentName", "dept_name"),
    division: getName("division", "divisionName", "division_name"),
    unit: getName("unit", "unitName", "unit_name"),
    orgId: getId("orgId", "org_id", "organizationId"),
    departmentId: getId("departmentId", "department_id", "deptId", "dept_id"),
    divisionId: getId("divisionId", "division_id"),
    unitId: getId("unitId", "unit_id"),
    level: getName("level"),
    levelP,
    lineId: getName("lineId", "line_id"),
    email: getName("email"),
    allowCrossOrg: Boolean(a?.allowCrossOrg ?? raw?.allowCrossOrg ?? false),
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
        allowCrossOrg: !!form.allowCrossOrg,
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
          className="rounded-xl px-4 py-2 font-bold bg-yellow-50 text-yellow-900 border border-yellow-200 hover:bg-yellow-100 shadow-sm"
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
            value={form.levelP ?? ""}
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
          value={form.lineId ?? ""}
          onChange={(v) => setF({ lineId: v })}
        />
        <Field
          label="Email"
          type="email"
          value={form.email ?? ""}
          onChange={(v) => setF({ email: v })}
        />
        {/* ✅ เพิ่ม: checkbox allowCrossOrg */}
        <label className="block">
          <span className="mb-1 block text-sm">สิทธิ์ผู้อนุมัติ</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!form.allowCrossOrg}
              onChange={(e) => setF({ allowCrossOrg: e.target.checked })}
            />
            <span>อนุมัติข้ามสังกัดได้</span>
          </label>
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button
          className="rounded-xl px-4 py-2 font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 shadow-sm"
          onClick={() => setForm(init)}
        >
          ล้างฟอร์ม
        </button>
        <button
          className="rounded-xl px-4 py-2 font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 shadow-sm"
          onClick={handleSave}
          disabled={saving}
        >
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
          <option key={o.id} value={o.id}>
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
