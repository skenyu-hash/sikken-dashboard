"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "../lib/auth";

export type SessionInfo = {
  id: number;
  email: string;
  name: string;
  role: Role;
  areaId: string | null;
};

const SessionContext = createContext<SessionInfo | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionInfo | null>(null);
  useEffect(() => {
    // 予防的ハードニング: 認証/セッション応答(/api/me)は HTTP キャッシュさせない(定石)。
    // 観測されたバグの修正ではない — 本番の通常リロードで NavBar は正常表示(2026-06-20 確認)。
    // 認証応答のキャッシュは「ログイン前の 401 が残る」等の潜在リスクがあるため no-store にしておく。
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { user: SessionInfo }) => setUser(j.user))
      .catch(() => setUser(null));
  }, []);
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** 後方互換: ロールだけ取得 */
export const useRole = (): Role | null => useContext(SessionContext)?.role ?? null;
export const useSession = (): SessionInfo | null => useContext(SessionContext);
