"use client";
import { useEffect, useRef, useState } from "react";

// เพิ่มรหัสภาษาใหม่ตรงนี้ (my, zh-CN)
// ถ้าจะใช้จีนตัวเต็ม เปลี่ยน "zh-CN" เป็น "zh-TW" หรือใส่ทั้งสองตัวก็ได้
type Lang = "th" | "en" | "my" | "zh-CN";

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "th",   label: "ไทย",             flag: "🇹🇭" },
  { code: "en",   label: "English",         flag: "🇬🇧" },
  { code: "my",   label: "เมียนมา",           flag: "🇲🇲" }, // Burmese
  { code: "zh-CN",label: "ภาษาจีน",       flag: "🇨🇳" }, // Chinese (Simplified)
  // ถ้าต้องการตัวเต็ม เพิ่มบรรทัดนี้ด้วย:
  // { code: "zh-TW" as Lang, label: "中文（繁體）", flag: "🇹🇼" },
];

function setCookie(name: string, value: string) {
  // note: cookie บน localhost จะไม่ set domain — เผื่อไว้ด้วย try/catch
  document.cookie = `${name}=${value}; path=/`;
  try {
    const host = location.hostname.startsWith("www.")
      ? location.hostname.slice(4)
      : location.hostname;
    if (host.includes(".")) {
      document.cookie = `${name}=${value}; path=/; domain=.${host}`;
    }
  } catch {}
}

function applyLang(lang: Lang) {
  const sel = document.querySelector<HTMLSelectElement>("select.goog-te-combo");
  if (sel) {
    sel.value = lang;
    sel.dispatchEvent(new Event("change"));
  } else {
    // ตั้ง cookie ให้ Google Website Translator รับรู้
    // ใช้ทั้ง /auto/{lang} และ /th/{lang} ตาม logic เดิมของคุณ
    setCookie("googtrans", `/auto/${lang}`);
    setCookie("googtrans", `/th/${lang}`);
    location.reload();
  }
  localStorage.setItem("app-lang", lang);
  window.dispatchEvent(new CustomEvent("app:lang", { detail: lang }));
}

const isLang = (v: unknown): v is Lang =>
  typeof v === "string" && (["th", "en", "my", "zh-CN"] as const).includes(v as Lang);

export default function LangSwitch({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [current, setCurrent] = useState<Lang>("th");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("app-lang");
    if (isLang(stored)) setCurrent(stored);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Lang>).detail;
      if (isLang(d)) setCurrent(d);
    };
    window.addEventListener("app:lang", on as EventListener);
    return () => window.removeEventListener("app:lang", on as EventListener);
  }, []);

  const active = LANGS.find(l => l.code === current)!;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="rounded-xl px-3 py-2 bg-[var(--input)] text-[var(--text)] flex items-center gap-2 hover:brightness-110"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-base leading-none" suppressHydrationWarning>
          {mounted ? active.flag : "🌐"}
        </span>
        <span className="text-sm" suppressHydrationWarning>
          {mounted ? active.label : ""}
        </span>
        <svg width="14" height="14" viewBox="0 0 20 20" className="opacity-70">
          <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 w-48 rounded-xl overflow-hidden shadow-xl border border-[var(--border)] bg-[var(--panel)] z-50"
        >
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={current === l.code}
                onClick={() => { setCurrent(l.code); setOpen(false); applyLang(l.code); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 ${
                  current === l.code ? "bg-white/5" : ""
                }`}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
