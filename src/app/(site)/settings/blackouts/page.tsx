"use client";

import { useEffect, useMemo, useState } from "react";

type Meta = {
  organizations: Array<{ id: number; name: string }>;
  departments: Array<{ id: number; name: string; organizationId: number }>;
  divisions: Array<{ id: number; name: string; departmentId: number }>;
  units: Array<{ id: number; name: string; divisionId: number }>;
};

type Target = {
  targetType: TargetType;
  targetId: number;
};

type Rule = {
  id: number;
  startDate: string;
  endDate: string;
  reason: string;
  active: boolean;
  allKinds: boolean;
  blockedKinds: LeaveKind[];
  targets: Array<{ id: number; targetType: TargetType; targetId: number }>;
};

type TargetType = "ORG" | "DEPARTMENT" | "DIVISION" | "UNIT";

type LeaveKind =
  | "ANNUAL"
  | "SICK"
  | "BUSINESS"
  | "UNPAID"
  | "BIRTHDAY"
  | "ORDAIN"
  | "MATERNITY"
  | "ANNUAL_HOLIDAY"
  | "SHIFT_CHANGE"
  | "HOLIDAY_CHANGE"
  | "OT";

const TARGET_TYPES: Array<{ value: TargetType; label: string }> = [
  { value: "ORG", label: "สังกัด" },
  { value: "DEPARTMENT", label: "แผนก" },
  { value: "DIVISION", label: "ฝ่าย" },
  { value: "UNIT", label: "หน่วย" },
];

const LEAVE_KINDS: Array<{ kind: LeaveKind; label: string }> = [
  { kind: "ANNUAL", label: "ลาพักร้อน" },
  { kind: "SICK", label: "ลาป่วย" },
  { kind: "BUSINESS", label: "ลากิจ" },
  { kind: "UNPAID", label: "ลาไม่รับเงินเดือน" },
  { kind: "BIRTHDAY", label: "ลาวันเกิด" },
  { kind: "ORDAIN", label: "ลาบวช" },
  { kind: "MATERNITY", label: "ลาคลอด" },
  { kind: "ANNUAL_HOLIDAY", label: "ลาใช้วันหยุดประจำปี" },
  { kind: "SHIFT_CHANGE", label: "เปลี่ยนกะ (ไม่ตัดสิทธิ์)" },
  { kind: "HOLIDAY_CHANGE", label: "สลับวันหยุด (ไม่ตัดสิทธิ์)" },
  { kind: "OT", label: "OT (ไม่ตัดสิทธิ์)" },
];

function makeNewRule(): Omit<Rule, "id" | "targets"> & { targets: Target[] } {
  const today = new Date().toISOString().slice(0, 10);
  return {
    startDate: today,
    endDate: today,
    reason: "",
    active: true,
    allKinds: true,
    blockedKinds: [],
    targets: [],
  };
}

export default function BlackoutsSettingsPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const [newRule, setNewRule] = useState(makeNewRule());

  async function loadAll() {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([
        fetch("/api/blackouts/meta", { cache: "no-store" }).then((x) => x.json()),
        fetch("/api/blackouts", { cache: "no-store" }).then((x) => x.json()),
      ]);
      setMeta(m);
      setRules(Array.isArray(r) ? r : []);
    } catch {
      setMeta(null);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const nameByTarget = useMemo(() => {
    const org = new Map<number, string>();
    const dept = new Map<number, string>();
    const div = new Map<number, string>();
    const unit = new Map<number, string>();

    for (const o of meta?.organizations ?? []) org.set(o.id, o.name);
    for (const d of meta?.departments ?? []) dept.set(d.id, d.name);
    for (const d of meta?.divisions ?? []) div.set(d.id, d.name);
    for (const u of meta?.units ?? []) unit.set(u.id, u.name);

    return { org, dept, div, unit };
  }, [meta]);

  function targetLabel(t: { targetType: TargetType; targetId: number }) {
    switch (t.targetType) {
      case "ORG":
        return nameByTarget.org.get(t.targetId) ?? `#${t.targetId}`;
      case "DEPARTMENT":
        return nameByTarget.dept.get(t.targetId) ?? `#${t.targetId}`;
      case "DIVISION":
        return nameByTarget.div.get(t.targetId) ?? `#${t.targetId}`;
      case "UNIT":
        return nameByTarget.unit.get(t.targetId) ?? `#${t.targetId}`;
    }
  }

  function optionsForType(type: TargetType) {
    if (!meta) return [] as Array<{ id: number; name: string }>;
    if (type === "ORG") return meta.organizations;
    if (type === "DEPARTMENT") return meta.departments.map((d) => ({ id: d.id, name: d.name }));
    if (type === "DIVISION") return meta.divisions.map((d) => ({ id: d.id, name: d.name }));
    return meta.units.map((u) => ({ id: u.id, name: u.name }));
  }

  function updateRule(id: number, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function createRule() {
    if (!newRule.targets.length) {
      setToast({ type: "error", msg: "กรุณาเลือกสังกัด/ฝ่าย/แผนก/หน่วยอย่างน้อย 1 รายการ" });
      setTimeout(() => setToast(null), 2200);
      return;
    }

    if (!newRule.allKinds && newRule.blockedKinds.length === 0) {
      setToast({ type: "error", msg: "กรุณาเลือกประเภทการลาที่จะปิด" });
      setTimeout(() => setToast(null), 2200);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/blackouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: newRule.startDate,
          endDate: newRule.endDate,
          reason: newRule.reason,
          active: newRule.active,
          allKinds: newRule.allKinds,
          blockedKinds: newRule.allKinds ? [] : newRule.blockedKinds,
          targets: newRule.targets,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Create failed");
      }

      setToast({ type: "success", msg: "สร้างกฎวันปิดเรียบร้อย" });
      setNewRule(makeNewRule());
      await loadAll();
    } catch (e: any) {
      setToast({ type: "error", msg: e.message || "สร้างกฎไม่สำเร็จ" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2200);
    }
  }

  async function saveRule(rule: Rule) {
    if (!rule.targets.length) {
      setToast({ type: "error", msg: "กฎนี้ต้องมีหน่วยงานอย่างน้อย 1 รายการ" });
      setTimeout(() => setToast(null), 2200);
      return;
    }

    if (!rule.allKinds && rule.blockedKinds.length === 0) {
      setToast({ type: "error", msg: "กรุณาเลือกประเภทการลาที่จะปิด" });
      setTimeout(() => setToast(null), 2200);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/blackouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule.id,
          startDate: rule.startDate,
          endDate: rule.endDate,
          reason: rule.reason,
          active: rule.active,
          allKinds: rule.allKinds,
          blockedKinds: rule.allKinds ? [] : rule.blockedKinds,
          targets: rule.targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId })),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Save failed");
      }

      setToast({ type: "success", msg: "บันทึกแล้ว" });
      await loadAll();
    } catch (e: any) {
      setToast({ type: "error", msg: e.message || "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2200);
    }
  }

  async function deleteRule(id: number) {
    if (!confirm("ลบกฎวันปิดนี้?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/blackouts?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Delete failed");
      }
      setToast({ type: "success", msg: "ลบแล้ว" });
      await loadAll();
    } catch (e: any) {
      setToast({ type: "error", msg: e.message || "ลบไม่สำเร็จ" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2200);
    }
  }

  return (
    <section role="tabpanel" aria-label="ปิดวันลา" className="neon-card rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="neon-title text-lg font-semibold">ปิดวันลา (Blackout)</h2>
        <div className="text-sm text-[var(--muted)]">
          ใช้สำหรับปิดรับการลาเป็นวัน/ช่วงวัน และเลือกหน่วยงานที่ได้รับผล
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--muted)]">กำลังโหลด…</div>
      ) : (
        <>
          {/* Create */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">เพิ่มกฎใหม่</div>
              <button
                type="button"
                className="btn-primary rounded-xl px-5 py-2 disabled:opacity-60"
                onClick={createRule}
                disabled={saving}
              >
                {saving ? "กำลังบันทึก..." : "สร้างกฎ"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
              <Field className="md:col-span-3" label="เริ่มวันที่" type="date" value={newRule.startDate} onChange={(v) => setNewRule((s) => ({ ...s, startDate: v }))} />
              <Field className="md:col-span-3" label="ถึงวันที่" type="date" value={newRule.endDate} onChange={(v) => setNewRule((s) => ({ ...s, endDate: v }))} />
              <Field className="md:col-span-4" label="เหตุผล (ถ้ามี)" placeholder="เช่น สงกรานต์ ต้องมีเวร" value={newRule.reason} onChange={(v) => setNewRule((s) => ({ ...s, reason: v }))} />
              <Toggle className="md:col-span-2" label="เปิดใช้งาน" checked={newRule.active} onChange={(v) => setNewRule((s) => ({ ...s, active: v }))} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-6">
                <div className="text-sm font-semibold mb-2">ประเภทการลาที่ปิด</div>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={newRule.allKinds} onChange={(e) => setNewRule((s) => ({ ...s, allKinds: e.target.checked, blockedKinds: [] }))} />
                    ปิดทุกประเภท
                  </label>
                </div>

                {!newRule.allKinds && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {LEAVE_KINDS.map((k) => (
                      <label key={k.kind} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={newRule.blockedKinds.includes(k.kind)}
                          onChange={(e) =>
                            setNewRule((s) => ({
                              ...s,
                              blockedKinds: e.target.checked
                                ? Array.from(new Set([...s.blockedKinds, k.kind]))
                                : s.blockedKinds.filter((x) => x !== k.kind),
                            }))
                          }
                        />
                        {k.label}
                      </label>
                    ))}
                  </div>
                )}

                {!newRule.allKinds && newRule.blockedKinds.length === 0 && (
                  <div className="mt-2 text-xs text-rose-600">เลือกอย่างน้อย 1 ประเภท (หรือเลือกปิดทุกประเภท)</div>
                )}
              </div>

              <div className="md:col-span-6">
                <div className="text-sm font-semibold mb-2">หน่วยงานที่ถูกปิด</div>

                <div className="space-y-2">
                  {newRule.targets.map((t, idx) => (
                    <div
                      key={`${t.targetType}-${t.targetId}-${idx}`}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center"
                    >
                      <div className="sm:col-span-4">
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950/30"
                          value={t.targetType}
                          onChange={(e) => {
                            const tt = e.target.value as TargetType;
                            const opts = optionsForType(tt);
                            setNewRule((s) => ({
                              ...s,
                              targets: s.targets.map((x, i) =>
                                i === idx
                                  ? {
                                      targetType: tt,
                                      targetId: opts[0]?.id ?? 0,
                                    }
                                  : x
                              ),
                            }));
                          }}
                        >
                          {TARGET_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-7">
                        <select
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950/30"
                          value={t.targetId}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            setNewRule((s) => ({
                              ...s,
                              targets: s.targets.map((x, i) =>
                                i === idx ? { ...x, targetId: id } : x
                              ),
                            }));
                          }}
                        >
                          {optionsForType(t.targetType).map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-1 sm:flex sm:justify-end">
                        <button
                          type="button"
                          className="rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          onClick={() =>
                            setNewRule((s) => ({
                              ...s,
                              targets: s.targets.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2 font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 shadow-sm"
                    onClick={() => {
                      const defaultType: TargetType = "ORG";
                      const opts = optionsForType(defaultType);
                      const firstId = opts[0]?.id ?? 0;
                      setNewRule((s) => ({
                        ...s,
                        targets: [...s.targets, { targetType: defaultType, targetId: firstId }],
                      }));
                    }}
                  >
                    เพิ่มหน่วยงาน
                  </button>

                  {!newRule.targets.length && (
                    <div className="text-xs text-rose-600 self-center">
                      ต้องเลือกอย่างน้อย 1 หน่วยงาน
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Existing rules */}
          <div className="mt-5 space-y-4">
            {rules.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">ยังไม่มีกฎวันปิด</div>
            ) : (
              rules.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">กฎ #{r.id}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary rounded-xl px-5 py-2 disabled:opacity-60"
                        onClick={() => saveRule(r)}
                        disabled={saving}
                      >
                        {saving ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-rose-300 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        onClick={() => deleteRule(r.id)}
                        disabled={saving}
                      >
                        ลบ
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                    <Field className="md:col-span-3" label="เริ่มวันที่" type="date" value={r.startDate} onChange={(v) => updateRule(r.id, { startDate: v })} />
                    <Field className="md:col-span-3" label="ถึงวันที่" type="date" value={r.endDate} onChange={(v) => updateRule(r.id, { endDate: v })} />
                    <Field className="md:col-span-4" label="เหตุผล (ถ้ามี)" value={r.reason} onChange={(v) => updateRule(r.id, { reason: v })} />
                    <Toggle className="md:col-span-2" label="เปิดใช้งาน" checked={r.active} onChange={(v) => updateRule(r.id, { active: v })} />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="md:col-span-6">
                      <div className="text-sm font-semibold mb-2">ประเภทการลาที่ปิด</div>
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={r.allKinds}
                          onChange={(e) => updateRule(r.id, { allKinds: e.target.checked, blockedKinds: [] })}
                        />
                        ปิดทุกประเภท
                      </label>

                      {!r.allKinds && (
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {LEAVE_KINDS.map((k) => (
                            <label key={k.kind} className="inline-flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={r.blockedKinds.includes(k.kind)}
                                onChange={(e) => {
                                  updateRule(r.id, {
                                    blockedKinds: e.target.checked
                                      ? Array.from(new Set([...r.blockedKinds, k.kind]))
                                      : r.blockedKinds.filter((x) => x !== k.kind),
                                  });
                                }}
                              />
                              {k.label}
                            </label>
                          ))}
                        </div>
                      )}
                      {!r.allKinds && r.blockedKinds.length === 0 && (
                        <div className="mt-2 text-xs text-rose-600">เลือกอย่างน้อย 1 ประเภท (หรือเลือกปิดทุกประเภท)</div>
                      )}
                    </div>

                    <div className="md:col-span-6">
                      <div className="text-sm font-semibold mb-2">หน่วยงานที่ถูกปิด</div>

                      <div className="flex flex-wrap gap-2">
                        {r.targets.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs dark:border-white/10 dark:bg-white/5"
                            title={`${t.targetType} ${t.targetId}`}
                          >
                            {TARGET_TYPES.find((x) => x.value === t.targetType)?.label}: {targetLabel(t)}
                            <button
                              type="button"
                              className="ml-1 rounded px-2 py-0.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              onClick={() => {
                                updateRule(r.id, {
                                  targets: r.targets.filter((x) => x.id !== t.id),
                                });
                              }}
                            >
                              ลบ
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center">
                        <div className="sm:col-span-4">
                          <select
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950/30"
                            value={"ORG"}
                            onChange={() => {}}
                            disabled
                          >
                            <option value="ORG">สังกัด/ฝ่าย/แผนก/หน่วย</option>
                          </select>
                        </div>
                        <div className="sm:col-span-7">
                          <select
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950/30"
                            value={0}
                            onChange={() => {}}
                            disabled
                          >
                            <option value={0}>ใช้ปุ่ม “เพิ่มหน่วยงาน” ด้านล่าง</option>
                          </select>
                        </div>
                        <div className="sm:col-span-1 sm:flex sm:justify-end" />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <AddTargetButton
                          meta={meta}
                          onAdd={(t) => {
                            const nextId = -Math.floor(Math.random() * 1_000_000);
                            updateRule(r.id, {
                              targets: [
                                ...r.targets,
                                { id: nextId, targetType: t.targetType, targetId: t.targetId },
                              ],
                            });
                          }}
                        />
                      </div>

                      {r.targets.length === 0 && (
                        <div className="mt-2 text-xs text-rose-600">ต้องเลือกอย่างน้อย 1 หน่วยงาน</div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Toast */}
      <div className="sr-only" aria-live="polite">
        {toast?.msg}
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div
            className={`rounded-xl px-4 py-3 text-white ${toast.type === "success" ? "bg-emerald-600/90" : "bg-rose-600/90"}`}
          >
            {toast.msg}
            <button className="ml-3 border border-white/20 rounded px-2 text-xs" onClick={() => setToast(null)}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  className,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none
          focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-600/40
          dark:border-white/10 dark:bg-slate-950/30"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {checked ? "เปิด" : "ปิด"}
      </label>
    </div>
  );
}

function AddTargetButton({
  meta,
  onAdd,
}: {
  meta: Meta | null;
  onAdd: (t: Target) => void;
}) {
  const [type, setType] = useState<TargetType>("ORG");

  const options = useMemo(() => {
    if (!meta) return [] as Array<{ id: number; name: string }>;
    if (type === "ORG") return meta.organizations;
    if (type === "DEPARTMENT") return meta.departments.map((d) => ({ id: d.id, name: d.name }));
    if (type === "DIVISION") return meta.divisions.map((d) => ({ id: d.id, name: d.name }));
    return meta.units.map((u) => ({ id: u.id, name: u.name }));
  }, [meta, type]);

  const [selectedId, setSelectedId] = useState<number>(0);

  useEffect(() => {
    setSelectedId(options[0]?.id ?? 0);
  }, [type, options]);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center w-full">
      <div className="sm:col-span-4">
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950/30"
          value={type}
          onChange={(e) => setType(e.target.value as TargetType)}
        >
          {TARGET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-6">
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-950/30"
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 sm:flex sm:justify-end">
        <button
          type="button"
          className="rounded-xl px-4 py-2 font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 shadow-sm disabled:opacity-60"
          onClick={() => onAdd({ targetType: type, targetId: selectedId })}
          disabled={!selectedId}
        >
          เพิ่มหน่วยงาน
        </button>
      </div>
    </div>
  );
}
