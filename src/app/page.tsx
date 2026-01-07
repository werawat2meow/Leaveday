import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

const ROLE_HOME: Record<string, string> = {
  MASTER_ADMIN: "/dashboard",
  ADMIN: "/dashboard",
  MANAGER: "/approvals",
  USER: "/requests",
};

export default async function Home() {
  const session = await getServerSession(authOptions);
  const role = (session as any)?.role as string | undefined;

  if (!session) redirect("/login");
  redirect(ROLE_HOME[role ?? "ADMIN"] ?? "/dashboard");
}
