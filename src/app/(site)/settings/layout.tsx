"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (slug: string) => pathname?.startsWith(`/settings/${slug}`);

  return (
    <main className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Tabs */}
        <nav
          className="tabs-surface rounded-2xl p-2"
          role="tablist"
          aria-label="Settings tabs"
        >
          <div className="flex flex-wrap gap-2">
            <Tab href="/settings/profile" active={active("profile")}>
              เพิ่มข้อมูล
            </Tab>
            <Tab href="/settings/leave-rights" active={active("leave-rights")}>
              สิทธิ์การลาตามตำแหน่ง
            </Tab>
            <Tab href="/settings/approvers" active={active("approvers")}>
              เพิ่มผู้มีสิทธิ์อนุมัติ
            </Tab>
            <Tab href="/settings/holidays" active={active("holidays")}>
              ประกาศวันหยุดประจำปี
            </Tab>
            <Tab href="/settings/orgs" active={active("orgs")}>
              ตั้งค่าหน่วยงาน
            </Tab>
            <a
              className="rounded-lg px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 border border-rose-700 dark:bg-rose-500/80 dark:text-white dark:hover:bg-rose-500"
              href="/manual/Admin.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              คู่มือการใช้งาน
            </a>
          </div>
        </nav>

        {children}
      </div>
    </main>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link role="tab" aria-selected={active} href={href} className="tab-btn">
      {children}
    </Link>
  );
}
