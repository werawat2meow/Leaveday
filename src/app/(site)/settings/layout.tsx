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
