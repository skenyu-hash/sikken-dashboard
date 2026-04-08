"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "../lib/auth";

export function NavBar({ role, userName }: { role: Role | null; userName: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  if (!role) return null;

  const items: { href: string; label: string; show: boolean }[] = [
    { href: "/", label: "ダッシュボード", show: true },
    { href: "/ranking", label: "ランキング", show: role === "admin" || role === "manager" },
    { href: "/targets", label: "目標", show: role === "admin" || role === "manager" },
    { href: "/breakeven", label: "損益分岐", show: role === "admin" || role === "manager" },
    { href: "/driver", label: "ドライバー", show: role === "admin" },
    { href: "/cockpit", label: "CF", show: role === "admin" },
    { href: "/admin", label: "管理", show: role === "admin" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <nav className="bg-zinc-950 text-white border-b border-zinc-800">
      <div className="flex overflow-x-auto no-scrollbar gap-1 px-2 py-2">
        {items.filter((i) => i.show).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`shrink-0 min-h-[40px] px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
              pathname === i.href
                ? "bg-emerald-600 text-white font-semibold"
                : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {i.label}
          </Link>
        ))}
        <div className="ml-auto shrink-0 self-center flex items-center gap-2 px-2">
          <span className="text-[10px] text-zinc-400">
            {userName} ({role === "admin" ? "役員" : role === "manager" ? "管理職" : "事務員"})
          </span>
          <button
            type="button"
            onClick={logout}
            className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            ログアウト
          </button>
        </div>
      </div>
    </nav>
  );
}
