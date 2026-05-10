"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./RoleProvider";
import { hasPageAccess, pathToPage, ROLE_LABELS } from "../lib/permissions";

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();

  // ログインページではナビ非表示
  if (pathname === "/login") return null;
  if (!session) return null;

  const role = session.role;

const items = [
    { href: "/",          label: "ダッシュボード" },
    { href: "/ranking",   label: "ランキング" },
    { href: "/trends",    label: "推移" },
    { href: "/matrix",    label: "マトリクス" },
    { href: "/targets",   label: "目標管理" },
    { href: "/meeting",   label: "会議" },
    { href: "/minutes",   label: "議事録" },
    { href: "/breakeven", label: "損益分岐" },
    { href: "/cockpit",   label: "CF" },
    { href: "/import",    label: "インポート" },
    { href: "/data-io",   label: "データ入出力" },
    { href: "/admin",     label: "管理者" },
  ].filter((item) => {
    const page = pathToPage(item.href);
    return page !== null && hasPageAccess({ role }, page, "view");
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <nav
      style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
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
        {items.map((i) => {
          const isActive = pathname === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              style={{
                padding: "11px 15px",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#111827" : "#6b7280",
                borderBottom: isActive ? "2px solid #1B5E3F" : "2px solid transparent",
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
          {session.name}({ROLE_LABELS[role]})
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
