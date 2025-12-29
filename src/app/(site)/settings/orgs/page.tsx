"use client";

import { useEffect, useMemo, useState } from "react";

type Org = { id: number; name: string };
type Dept = { id: number; name: string; orgId: number };
type Div = { id: number; name: string; departmentId: number };
type Unit = { id: number; name: string; divisionId: number };

export default function OrgsSettingsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [divisions, setDivisions] = useState<Div[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [selectedOrgId, setSelectedOrgId] = useState<number | undefined>();
  const [selectedDeptId, setSelectedDeptId] = useState<number | undefined>();
  const [selectedDivId, setSelectedDivId] = useState<number | undefined>();

  const [loading, setLoading] = useState({
    orgs: false,
    deps: false,
    divs: false,
    units: false,
  });
  const [search, setSearch] = useState({
    org: "",
    dept: "",
    div: "",
    unit: "",
  });

  // Modal state for create/edit
  const [openCreate, setOpenCreate] = useState<null | {
    level: "org" | "dept" | "div" | "unit";
    id?: number;
  }>(null);
  const [createName, setCreateName] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  // Load orgs on mount
  useEffect(() => {
    setLoading((s) => ({ ...s, orgs: true }));
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((data) => setOrgs(data || []))
      .catch(() => setOrgs([]))
      .finally(() => setLoading((s) => ({ ...s, orgs: false })));
  }, []);

  // Load departments when org changes
  useEffect(() => {
    setDepartments([]);
    setDivisions([]);
    setUnits([]);
    setSelectedDeptId(undefined);
    setSelectedDivId(undefined);
    if (!selectedOrgId) return;
    setLoading((s) => ({ ...s, deps: true }));
    fetch(`/api/organizations/${selectedOrgId}/departments`)
      .then((r) => r.json())
      .then((data) => setDepartments(data || []))
      .catch(() => setDepartments([]))
      .finally(() => setLoading((s) => ({ ...s, deps: false })));
  }, [selectedOrgId]);

  // Load divisions when dept changes
  useEffect(() => {
    setDivisions([]);
    setUnits([]);
    setSelectedDivId(undefined);
    if (!selectedDeptId) return;
    setLoading((s) => ({ ...s, divs: true }));
    fetch(`/api/departments/${selectedDeptId}/divisions`)
      .then((r) => r.json())
      .then((data) => setDivisions(data || []))
      .catch(() => setDivisions([]))
      .finally(() => setLoading((s) => ({ ...s, divs: false })));
  }, [selectedDeptId]);

  // Load units when division changes
  useEffect(() => {
    setUnits([]);
    if (!selectedDivId) return;
    setLoading((s) => ({ ...s, units: true }));
    fetch(`/api/divisions/${selectedDivId}/units`)
      .then((r) => r.json())
      .then((data) => setUnits(data || []))
      .catch(() => setUnits([]))
      .finally(() => setLoading((s) => ({ ...s, units: false })));
  }, [selectedDivId]);

  const filteredOrgs = useMemo(
    () =>
      orgs.filter((o) =>
        o.name.toLowerCase().includes(search.org.toLowerCase())
      ),
    [orgs, search.org]
  );
  const filteredDeps = useMemo(
    () =>
      departments.filter((d) =>
        d.name.toLowerCase().includes(search.dept.toLowerCase())
      ),
    [departments, search.dept]
  );
  const filteredDivs = useMemo(
    () =>
      divisions.filter((d) =>
        d.name.toLowerCase().includes(search.div.toLowerCase())
      ),
    [divisions, search.div]
  );
  const filteredUnits = useMemo(
    () =>
      units.filter((u) =>
        u.name.toLowerCase().includes(search.unit.toLowerCase())
      ),
    [units, search.unit]
  );

  async function handleSave() {
    const name = createName.trim();
    const level = openCreate?.level;
    const editingId = openCreate?.id;
    if (!level || !name) return;

    setSavingCreate(true);
    try {
      if (level === "org") {
        const url = editingId
          ? `/api/organizations?id=${editingId}`
          : `/api/organizations`;
        const method = editingId ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "บันทึกสังกัดไม่สำเร็จ");
        const r = await fetch("/api/organizations");
        setOrgs(await r.json());
      } else if (level === "dept") {
        if (!selectedOrgId) throw new Error("กรุณาเลือกสังกัดก่อน");
        const url = editingId
          ? `/api/departments?id=${editingId}`
          : `/api/organizations/${selectedOrgId}/departments`;
        const method = editingId ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, orgId: selectedOrgId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "บันทึกแผนกไม่สำเร็จ");
        const r = await fetch(
          `/api/organizations/${selectedOrgId}/departments`
        );
        setDepartments(await r.json());
      } else if (level === "div") {
        if (!selectedDeptId) throw new Error("กรุณาเลือกแผนกก่อน");
        const url = editingId
          ? `/api/divisions?id=${editingId}`
          : `/api/departments/${selectedDeptId}/divisions`;
        const method = editingId ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, departmentId: selectedDeptId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "บันทึกฝ่ายไม่สำเร็จ");
        const r = await fetch(`/api/departments/${selectedDeptId}/divisions`);
        setDivisions(await r.json());
      } else if (level === "unit") {
        if (!selectedDivId) throw new Error("กรุณาเลือกฝ่ายก่อน");
        const url = editingId
          ? `/api/units?id=${editingId}`
          : `/api/divisions/${selectedDivId}/units`;
        const method = editingId ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, divisionId: selectedDivId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "บันทึกหน่วยไม่สำเร็จ");
        const r = await fetch(`/api/divisions/${selectedDivId}/units`);
        setUnits(await r.json());
      }
      setOpenCreate(null);
      setCreateName("");
    } catch (err: any) {
      alert(err?.message || "เกิดข้อผิดพลาด");
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleDelete(
    level: "org" | "dept" | "div" | "unit",
    id: number
  ) {
    const ok = window.confirm("ยืนยันลบรายการนี้หรือไม่?");
    if (!ok) return;
    try {
      let url = "";
      if (level === "org") url = `/api/organizations?id=${id}`;
      else if (level === "dept") url = `/api/departments?id=${id}`;
      else if (level === "div") url = `/api/divisions?id=${id}`;
      else url = `/api/units?id=${id}`;

      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");

      if (level === "org") {
        const r = await fetch("/api/organizations");
        setOrgs(await r.json());
        setSelectedOrgId(undefined);
        setSelectedDeptId(undefined);
        setSelectedDivId(undefined);
        setDepartments([]);
        setDivisions([]);
        setUnits([]);
      } else if (level === "dept" && selectedOrgId) {
        const r = await fetch(
          `/api/organizations/${selectedOrgId}/departments`
        );
        setDepartments(await r.json());
        setSelectedDeptId(undefined);
        setSelectedDivId(undefined);
        setDivisions([]);
        setUnits([]);
      } else if (level === "div" && selectedDeptId) {
        const r = await fetch(`/api/departments/${selectedDeptId}/divisions`);
        setDivisions(await r.json());
        setSelectedDivId(undefined);
        setUnits([]);
      } else if (level === "unit" && selectedDivId) {
        const r = await fetch(`/api/divisions/${selectedDivId}/units`);
        setUnits(await r.json());
      }
    } catch (e: any) {
      alert(e?.message || "เกิดข้อผิดพลาด");
    }
  }

  return (
    <section
      role="tabpanel"
      aria-label="ตั้งค่าหน่วยงาน"
      className="neon-card rounded-2xl p-4 sm:p-6 space-y-6"
    >
      <h2 className="neon-title text-base sm:text-lg font-semibold">
        ตั้งค่าหน่วยงาน
      </h2>
      <p className="text-sm text-[var(--muted)]">
        จัดการสังกัด แผนก ฝ่าย และ หน่วย เพื่อใช้กับแบบฟอร์มพนักงาน
      </p>

      {/* Breadcrumb */}
      <div className="text-xs text-[var(--muted)]">
        {selectedOrgId
          ? orgs.find((o) => o.id === selectedOrgId)?.name
          : "สังกัด"}
        {selectedDeptId
          ? ` › ${departments.find((d) => d.id === selectedDeptId)?.name}`
          : ""}
        {selectedDivId
          ? ` › ${divisions.find((d) => d.id === selectedDivId)?.name}`
          : ""}
      </div>

      {/* Organizations */}
      <Card title="สังกัด (Organizations)" hint="เพิ่ม/แก้ไข/ลบ รายการสังกัด">
        <div className="flex items-center gap-2 mb-3">
          <input
            className="neon-input rounded-xl p-2 text-sm"
            placeholder="ค้นหา"
            value={search.org}
            onChange={(e) => setSearch((s) => ({ ...s, org: e.target.value }))}
          />
          <button
            className="btn btn-create"
            onClick={() => {
              setCreateName("");
              setOpenCreate({ level: "org" });
            }}
          >
            + สร้างสังกัด
          </button>
        </div>
        <List
          items={filteredOrgs}
          loading={loading.orgs}
          emptyText="ยังไม่มีสังกัด"
          onPick={(id) => setSelectedOrgId(id)}
          pickedId={selectedOrgId}
          onEdit={(it) => {
            setOpenCreate({ level: "org", id: it.id });
            setCreateName(it.name);
          }}
          onDelete={(it) => handleDelete("org", it.id)}
        />
      </Card>

      {/* Departments */}
      <Card
        title="แผนก (Departments)"
        hint="เพิ่ม/แก้ไข/ลบ รายการแผนก (ผูกกับสังกัด)"
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            className="neon-input rounded-xl p-2 text-sm"
            value={selectedOrgId || ""}
            onChange={(e) =>
              setSelectedOrgId(Number(e.target.value) || undefined)
            }
          >
            <option value="">เลือกสังกัด</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            className="neon-input rounded-xl p-2 text-sm"
            placeholder="ค้นหาแผนก"
            value={search.dept}
            onChange={(e) => setSearch((s) => ({ ...s, dept: e.target.value }))}
          />
          <button
            className="btn btn-create"
            disabled={!selectedOrgId}
            onClick={() => {
              if (!selectedOrgId) return;
              setCreateName("");
              setOpenCreate({ level: "dept" });
            }}
          >
            + สร้างแผนก
          </button>
        </div>
        <List
          items={filteredDeps}
          loading={loading.deps}
          emptyText={
            selectedOrgId ? "ยังไม่มีแผนกในสังกัดนี้" : "กรุณาเลือกสังกัดก่อน"
          }
          onPick={(id) => setSelectedDeptId(id)}
          pickedId={selectedDeptId}
          onEdit={(it) => {
            setOpenCreate({ level: "dept", id: it.id });
            setCreateName(it.name);
          }}
          onDelete={(it) => handleDelete("dept", it.id)}
        />
      </Card>

      {/* Divisions */}
      <Card
        title="ฝ่าย (Divisions)"
        hint="เพิ่ม/แก้ไข/ลบ รายการฝ่าย (ผูกกับแผนก)"
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            className="neon-input rounded-xl p-2 text-sm"
            value={selectedOrgId || ""}
            onChange={(e) => {
              const v = Number(e.target.value) || undefined;
              setSelectedOrgId(v);
              setSelectedDeptId(undefined);
              setSelectedDivId(undefined);
            }}
          >
            <option value="">เลือกสังกัด</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            className="neon-input rounded-xl p-2 text-sm"
            value={selectedDeptId || ""}
            onChange={(e) => {
              const v = Number(e.target.value) || undefined;
              setSelectedDeptId(v);
              setSelectedDivId(undefined);
            }}
            disabled={!selectedOrgId || !departments.length}
          >
            <option value="">เลือกแผนก</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            className="neon-input rounded-xl p-2 text-sm"
            placeholder="ค้นหาฝ่าย"
            value={search.div}
            onChange={(e) => setSearch((s) => ({ ...s, div: e.target.value }))}
          />
          <button
            className="btn btn-create"
            disabled={!selectedOrgId || !selectedDeptId}
            onClick={() => {
              if (!selectedOrgId || !selectedDeptId) return;
              setCreateName("");
              setOpenCreate({ level: "div" });
            }}
          >
            + สร้างฝ่าย
          </button>
        </div>
        <List
          items={filteredDivs}
          loading={loading.divs}
          emptyText={
            selectedDeptId
              ? "ยังไม่มีฝ่ายในแผนกนี้"
              : "กรุณาเลือกสังกัดและแผนกก่อน"
          }
          onPick={(id) => setSelectedDivId(id)}
          pickedId={selectedDivId}
          onEdit={(it) => {
            setOpenCreate({ level: "div", id: it.id });
            setCreateName(it.name);
          }}
          onDelete={(it) => handleDelete("div", it.id)}
        />
      </Card>

      {/* Units */}
      <Card
        title="หน่วย (Units)"
        hint="เพิ่ม/แก้ไข/ลบ รายการหน่วย (ผูกกับฝ่าย)"
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            className="neon-input rounded-xl p-2 text-sm"
            value={selectedOrgId || ""}
            onChange={(e) => {
              const v = Number(e.target.value) || undefined;
              setSelectedOrgId(v);
              setSelectedDeptId(undefined);
              setSelectedDivId(undefined);
            }}
          >
            <option value="">เลือกสังกัด</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            className="neon-input rounded-xl p-2 text-sm"
            value={selectedDeptId || ""}
            onChange={(e) => {
              const v = Number(e.target.value) || undefined;
              setSelectedDeptId(v);
              setSelectedDivId(undefined);
            }}
            disabled={!selectedOrgId || !departments.length}
          >
            <option value="">เลือกแผนก</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className="neon-input rounded-xl p-2 text-sm"
            value={selectedDivId || ""}
            onChange={(e) =>
              setSelectedDivId(Number(e.target.value) || undefined)
            }
            disabled={!selectedDeptId || !divisions.length}
          >
            <option value="">เลือกฝ่าย</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            className="neon-input rounded-xl p-2 text-sm"
            placeholder="ค้นหาหน่วย"
            value={search.unit}
            onChange={(e) => setSearch((s) => ({ ...s, unit: e.target.value }))}
          />
          <button
            className="btn btn-create"
            disabled={!selectedOrgId || !selectedDeptId || !selectedDivId}
            onClick={() => {
              if (!selectedOrgId || !selectedDeptId || !selectedDivId) return;
              setCreateName("");
              setOpenCreate({ level: "unit" });
            }}
          >
            + สร้างหน่วย
          </button>
        </div>
        <List
          items={filteredUnits}
          loading={loading.units}
          emptyText={
            selectedDivId
              ? "ยังไม่มีหน่วยในฝ่ายนี้"
              : "กรุณาเลือกสังกัด แผนก และ ฝ่ายก่อน"
          }
          onEdit={(it) => {
            setOpenCreate({ level: "unit", id: it.id });
            setCreateName(it.name);
          }}
          onDelete={(it) => handleDelete("unit", it.id)}
        />
      </Card>

      {/* Create/Edit Modal */}
      {openCreate && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setOpenCreate(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--input)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold mb-2">
              {openCreate.level === "org" &&
                (openCreate.id ? "แก้ไขสังกัด" : "สร้างสังกัด")}
              {openCreate.level === "dept" &&
                (openCreate.id ? "แก้ไขแผนก" : "สร้างแผนก")}
              {openCreate.level === "div" &&
                (openCreate.id ? "แก้ไขฝ่าย" : "สร้างฝ่าย")}
              {openCreate.level === "unit" &&
                (openCreate.id ? "แก้ไขหน่วย" : "สร้างหน่วย")}
            </h4>

            {/* Parent context */}
            <div className="text-xs text-[var(--muted)] mb-3">
              {selectedOrgId && (
                <>สังกัด: {orgs.find((o) => o.id === selectedOrgId)?.name} </>
              )}
              {selectedDeptId && (
                <>
                  • แผนก:{" "}
                  {departments.find((d) => d.id === selectedDeptId)?.name}{" "}
                </>
              )}
              {selectedDivId && (
                <>
                  • ฝ่าย: {divisions.find((d) => d.id === selectedDivId)?.name}
                </>
              )}
            </div>

            <label className="block mb-3">
              <span className="text-sm">ชื่อ</span>
              <input
                className="neon-input w-full rounded-xl p-3 mt-1"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="ระบุชื่อ"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                className="btn btn-delete"
                type="button"
                onClick={() => setOpenCreate(null)}
              >
                ยกเลิก
              </button>
              <button
                className="btn btn-create"
                type="button"
                disabled={!createName.trim() || savingCreate}
                onClick={handleSave}
              >
                {savingCreate
                  ? "กำลังบันทึก..."
                  : openCreate.id
                  ? "บันทึกการแก้ไข"
                  : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{title}</h3>
      </div>
      {hint && <p className="text-xs text-[var(--muted)] mb-3">{hint}</p>}
      {children}
    </div>
  );
}

function List<T extends { id: number; name: string }>({
  items,
  pickedId,
  loading,
  emptyText,
  onPick,
  onEdit,
  onDelete,
}: {
  items: T[];
  pickedId?: number;
  loading?: boolean;
  emptyText?: string;
  onPick?: (id: number) => void;
  onEdit?: (it: T) => void;
  onDelete?: (it: T) => void;
}) {

  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 3;

  if (loading) {
    return <div className="text-sm text-[var(--muted)]">กำลังโหลด...</div>;
  }
  if (!items.length) {
    return (
      <div className="text-sm text-[var(--muted)]">
        {emptyText || "ยังไม่มีรายการ"}
      </div>
    );
  }

  const visibleItems = expanded ? items : items.slice(0, MAX_VISIBLE);
  return (
    <>
    <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
      {visibleItems.map((it) => (
        <li
          key={it.id}
          className={`flex items-center justify-between p-3 ${
            pickedId === it.id ? "bg-white/5" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="font-medium">{it.name}</div>
          </div>
          <div className="flex items-center gap-2">
            {onPick && (
              <button
                className="btn btn-select text-xs"
                onClick={() => onPick(it.id)}
              >
                เลือก
              </button>
            )}
            {onEdit && (
              <button
                className="btn btn-edit text-xs"
                onClick={() => onEdit(it)}
              >
                แก้ไข
              </button>
            )}
            {onDelete && (
              <button
                className="btn btn-delete text-xs"
                onClick={() => onDelete(it)}
              >
                ลบ
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
    {items.length > MAX_VISIBLE && (
        <div className="pt-2 text-sm text-[var(--muted)]">
          <button
            className="underline text-sm"
            onClick={() => setExpanded((s) => !s)}
          >
            {expanded
              ? "แสดงน้อยลง"
              : `แสดงเพิ่มเติม (${items.length - MAX_VISIBLE})`}
          </button>
        </div>
      )}
      </>
  );
}
