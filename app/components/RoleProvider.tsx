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
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { user: SessionInfo }) => setUser(j.user))
      .catch(() => setUser(null));
  }, []);
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** 後方互換: ロールだけ取得 */
export const useRole = (): Role | null => useContext(SessionContext)?.role ?? null;
export const useSession = (): SessionInfo | null => useContext(SessionContext);
