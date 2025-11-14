import { prisma } from "@/lib/prisma";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: { email: {}, password: {} },
      async authorize(c) {
        if (!c?.email || !c?.password) return null;

        // 1) ตรวจ user ด้วย email + password
        const user = await prisma.user.findUnique({ where: { email: c.email } });
        if (!user) return null;
        const ok = await bcrypt.compare(c.password, user.passwordHash);
        if (!ok) return null;

        // 2) ดึง employee เพื่อเอา idCard (หาได้ทั้งจาก userId หรือ email)
        const emp = await prisma.employee.findFirst({
          where: {
            OR: [{ userId: user.id }, { email: user.email }],
          },
          select: { idCard: true },
        });

        // 3) คืน user object พร้อมข้อมูลที่อยากใส่ใน token
        return {
          id: String(user.id),
          email: user.email,
          name: user.name ?? "",
          role: user.role,
          idCard: emp?.idCard ?? null,  // << สำคัญ
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // เรียกตอน login ครั้งแรก หรือเมื่อ refresh token
      if (user) {
        token.sub = (user as any).id;               // เก็บ id ผู้ใช้ไว้ใน token
        (token as any).role = (user as any).role;   // เก็บ role
        (token as any).idCard = (user as any).idCard ?? null; // เก็บ idCard
      }
      return token;
    },
    async session({ session, token }) {
      // map token -> session (ฝั่ง client)
      if (token?.sub) (session.user as any).id = Number(token.sub);
      if ((token as any).idCard) (session.user as any).idCard = (token as any).idCard;
      if ((token as any).role) (session as any).role = (token as any).role;
      return session;
    },
  },
  pages: { signIn: "/login" },
  debug: true,
};
