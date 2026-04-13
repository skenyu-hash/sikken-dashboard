"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "DB" },
  { href: "/meeting", label: "会議" },
  { href: "/trends", label: "推移" },
  { href: "/targets", label: "目標" },
  { href: "/ranking", label: "他" },
];

export function BottomNav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "#064e3b", display: "flex",
      borderTop: "1px solid rgba(255,255,255,0.1)",
      zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)",
    }} className="show-mobile">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", padding: "8px 4px 10px", gap: 3,
            textDecoration: "none",
            background: active ? "rgba(255,255,255,0.15)" : "transparent",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 4,
              background: active ? "#a7f3d0" : "rgba(255,255,255,0.35)",
            }} />
            <span style={{
              fontSize: 9, fontWeight: 700,
              color: active ? "#a7f3d0" : "rgba(255,255,255,0.6)",
            }}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
