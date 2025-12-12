"use client";

import { useEffect, useState } from "react";
import MainNav from "./MainNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // ปิด drawer ด้วย ESC (เฉพาะตอนมือถือ)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-dvh">
      {/* Header เฉพาะมือถือ: ปุ่มแฮมเบอร์เกอร์ */}
      <div
        className={`md:hidden sticky top-0 z-40 border-b border-[var(--border)] bg-[color:rgba(0,0,0,.35)] backdrop-blur ${
          open ? "pointer-events-none" : ""
        }`}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 border border-white/10 hover:bg-white/5"
            aria-label="Open menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <b>Leave Management</b>
          <span className="w-[38px]" /> {/* ช่องว่างให้ปุ่มซ้าย-ขวาสมดุล */}
        </div>
      </div>

      {/* Layout เดสก์ท็อป = เหมือนเดิมชิดซ้าย */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-0">
        <aside className="hidden md:block border-r border-[rgba(255,255,255,.07)]/50 md:min-h-dvh">
          <MainNav />
        </aside>

        <section className="p-6">
          {children}
        </section>
      </div>

      {/* Drawer มือถือ */}
      <div className={`md:hidden fixed inset-0 z-[99999] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 bottom-0 w-[260px] neon-card transition-transform ${open ? "translate-x-0" : "-translate-x-full"} z-[100000]`}
          role="dialog"
          aria-modal="true"
        >
          <div className="p-4 flex items-center justify-between">
            <span className="font-semibold">Menu</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 border border-white/10 hover:bg-white/5"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <div className="p-2">
            <MainNav onNavigate={() => setOpen(false)} />
          </div>
        </aside>
      </div>
    </div>
  );
}
