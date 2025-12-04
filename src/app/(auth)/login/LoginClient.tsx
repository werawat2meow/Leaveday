"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

type Role = "MASTER_ADMIN" | "ADMIN" | "MANAGER" | "USER";

export default function LoginClient() {
  const router = useRouter();
  const { status, data: session, update } = useSession();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  // เพิ่ม state สำหรับล็อกอินผิดและล็อก
  const [loginFailCount, setLoginFailCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeLeft, setLockTimeLeft] = useState(30);

  // โหลดค่าจาก localStorage เมื่อ component mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const fail = Number(localStorage.getItem("loginFailCount") || "0");
      const locked = localStorage.getItem("isLocked") === "true";
      const left = Number(localStorage.getItem("lockTimeLeft") || "30");
      setLoginFailCount(fail);
      setIsLocked(locked);
      setLockTimeLeft(left);
    }
  }, []);
  // นับถอยหลังเมื่อถูกล็อก
  useEffect(() => {
    // sync state ไป localStorage ทุกครั้งที่เปลี่ยน
    if (typeof window !== "undefined") {
      localStorage.setItem("loginFailCount", String(loginFailCount));
      localStorage.setItem("isLocked", String(isLocked));
      localStorage.setItem("lockTimeLeft", String(lockTimeLeft));
    }
    if (isLocked) {
      if (lockTimeLeft > 0) {
        const timer = setTimeout(() => setLockTimeLeft(lockTimeLeft - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setIsLocked(false);
        setLockTimeLeft(30);
        // ไม่รีเซ็ต loginFailCount เพื่อให้สะสมจำนวนครั้งผิด
      }
    }
  }, [isLocked, lockTimeLeft, loginFailCount]);

  // ถ้ามี session อยู่แล้ว ให้เด้งไปหน้าตาม role
  useEffect(() => {
    if (status === "authenticated") {
      const role =
        ((session as any)?.user?.role as Role | undefined) ??
        ((session as any)?.role as Role | undefined);
      if (role === "USER") router.replace("/requests");
      else if (role === "MANAGER") router.replace("/approvals");
      else router.replace("/dashboard");
    }
  }, [status, session, router]);

  const redirectByRole = (role?: Role) => {
    if (role === "USER") router.replace("/requests");
    else if (role === "MANAGER") router.replace("/approvals");
    else router.replace("/dashboard");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    if (!email.trim() || !pw.trim()) return alert("กรุณากรอกให้ครบ");

    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password: pw,
      });
      console.log("[client] signIn result →", res);

      if (!res || !res.ok) {
        setLoginFailCount((prev) => {
          const next = prev + 1;
          if (next >= 3 && prev < 3) {
            setLockTimeLeft(30);
            setIsLocked(true);
          }
          return next;
        });
        alert("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        return;
      }

      const fresh = (await update()) as any;
      const role: Role | undefined =
        fresh?.user?.role ?? fresh?.role ?? (session as any)?.user?.role;

      if (!role) {
        await router.refresh();
      }
      redirectByRole(role);
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh flex justify-center items-center px-4 relative overflow-hidden">
      <img
        src="/cover-005.jpg"
        alt="Background"
        className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none select-none"
        style={{ zIndex: 0 }}
      />
      {/* Popup modal ขณะล็อกอิน */}
      {isLocked && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-cyan-50 rounded-xl p-8 text-center shadow-2xl border border-cyan-200">
            <h2 className="text-xl font-bold mb-4 text-cyan-700">ล็อกอินผิดเกิน 3 ครั้ง</h2>
            <p className="text-base font-semibold text-gray-900">กรุณารอ {lockTimeLeft} วินาที ก่อนลองใหม่</p>
          </div>
        </div>
      )}
      <div className="flex flex-col items-center gap-4 w-full max-w-xl relative z-10">
        <section className="neon-card w-full rounded-2xl p-7 text-center">
          <img
          src="/HRM-w.gif"
          alt="HR Logo"
          className="mx-auto w-80 object-contain"
        />
          <form onSubmit={onSubmit} className="grid gap-4 text-left">
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                id="email"
                type="email"
                placeholder="Email"
                className="neon-input w-full rounded-xl px-4 py-3 outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                disabled={isLocked}
              />
            </label>

            <label className="block">
              <span className="sr-only">Password</span>
              <input
                id="pw"
                type="password"
                placeholder="Password"
                className="neon-input w-full rounded-xl px-4 py-3 outline-none mt-3"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLocked}
              />
            </label>

            <button
              type="submit"
              disabled={loading || isLocked}
              className="neon-cta mt-10 mb-10 w-fit mx-auto rounded-xl px-5 py-3 font-extrabold active:translate-y-[1px] disabled:opacity-60"
            >
              {loading ? "กำลังเข้าสู่ระบบ..." : "Login"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
