"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./RoleProvider";

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();

  // ログインページではナビ非表示
  if (pathname === "/login") return null;
  if (!session) return null;

  const role = session.role;

  const items: { href: string; label: string; show: boolean }[] = [
    { href: "/", label: "ダッシュボード", show: true },
    { href: "/summary", label: "一覧", show: true },
    { href: "/ranking", label: "ランキング", show: true },
    { href: "/trends", label: "推移", show: true },
    { href: "/targets", label: "目標", show: true },
    { href: "/meeting", label: "会議", show: true },
    { href: "/breakeven", label: "損益分岐", show: role === "admin" },
    { href: "/cockpit", label: "CF", show: role === "admin" },
    { href: "/import", label: "インポート", show: role === "admin" },
    { href: "/admin", label: "管理者", show: role === "admin" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <nav
      style={{
        background: "#fff",
        borderBottom: "1px solid #d1fae5",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 20px",
        overflowX: "auto",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex" }}>
        {items.filter((i) => i.show).map((i) => {
          const isActive = pathname === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              style={{
                padding: "11px 15px",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#065f46" : "#6b7280",
                borderBottom: isActive ? "2px solid #059669" : "2px solid transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {i.label}
            </Link>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
          {session.name}（{role === "admin" ? "役員" : role === "manager" ? "部長" : role === "staff" ? "内勤・役職者" : "事務員"}）
        </span>
        <button
          type="button"
          onClick={logout}
          style={{
            fontSize: 11,
            padding: "5px 12px",
            borderRadius: 6,
            background: "#f3f4f6",
            color: "#374151",
            border: "1px solid #e5e7eb",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          ログアウト
        </button>
      </div>
    </nav>
  );
}
