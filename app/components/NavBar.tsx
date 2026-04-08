"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "../lib/auth";

export function NavBar({ role }: { role: Role | null }) {
  const pathname = usePathname();
  if (!role) return null;

  const items: { href: string; label: string; show: boolean }[] = [
    { href: "/", label: "ダッシュボード", show: true },
    { href: "/breakeven", label: "損益分岐", show: role === "admin" || role === "manager" },
    { href: "/driver", label: "ドライバー", show: role === "admin" },
  ];
  return (
    <nav className="bg-zinc-950 text-white border-b border-zinc-800">
      <div className="flex overflow-x-auto no-scrollbar gap-1 px-2 py-2">
        {items.filter(i => i.show).map(i => (
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
        <div className="ml-auto shrink-0 self-center text-[10px] text-zinc-500 px-2">
          {role === "admin" ? "役員" : role === "manager" ? "管理職" : "事務員"}
        </div>
      </div>
    </nav>
  );
}
