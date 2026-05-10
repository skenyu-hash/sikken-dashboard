"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useRole } from "./RoleProvider";
import { hasPageAccess, pathToPage, ROLE_LABELS } from "../lib/permissions";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/ranking", label: "ランキング" },
  { href: "/trends", label: "推移" },
  { href: "/matrix", label: "マトリクス" },
  { href: "/targets", label: "目標" },
  { href: "/meeting", label: "10日会議" },
  { href: "/minutes", label: "議事録" },
  { href: "/breakeven", label: "損益分岐" },
  { href: "/cockpit", label: "CF" },
  { href: "/import", label: "インポート" },
  { href: "/admin", label: "管理者" },
];

export function MobileHeader() {
  const path = usePathname();
  const role = useRole();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (path === "/login") return null;

  const items = NAV_ITEMS.filter((item) => {
    if (role === null) return false;
    const page = pathToPage(item.href);
    return page !== null && hasPageAccess({ role }, page, "view");
  });

  return (
    <>
      <header
        className="show-mobile"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#1B5E3F",
          color: "white",
          padding: "12px 16px",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "calc(env(safe-area-inset-top) + 12px)",
        }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="メニューを開く"
          style={{
            background: "transparent",
            border: "none",
            color: "white",
            padding: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
          SIKKEN GROUP
        </div>
        <div style={{ width: 40 }} />
      </header>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 100,
          }}
        />
      )}

      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "82%",
          maxWidth: 320,
          background: "white",
          zIndex: 101,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease-out",
          display: "flex",
          flexDirection: "column",
          boxShadow: open ? "2px 0 16px rgba(0,0,0,0.2)" : "none",
        }}
      >
        <div
          style={{
            background: "#1B5E3F",
            color: "white",
            padding: "20px 20px",
            paddingTop: "calc(env(safe-area-inset-top) + 20px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>SIKKEN GROUP</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              経営OS
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="メニューを閉じる"
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {items.map((item) => {
            const active =
              item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  padding: "14px 20px",
                  fontSize: 15,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#1B5E3F" : "#171717",
                  background: active ? "#E8F0EA" : "transparent",
                  borderLeft: active ? "3px solid #1B5E3F" : "3px solid transparent",
                  textDecoration: "none",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {role !== null && (
          <div
            style={{
              borderTop: "1px solid #E5E5E5",
              padding: "16px 20px",
              fontSize: 13,
              color: "#666",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
            }}
          >
            <span>反謙雄（{ROLE_LABELS[role]}）</span>
            <Link
              href="/api/logout"
              style={{
                color: "#1B5E3F",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              ログアウト
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
