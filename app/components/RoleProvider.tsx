"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "../lib/auth";

const RoleContext = createContext<Role | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    fetch("/api/me")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((j: { role: Role }) => setRole(j.role))
      .catch(() => setRole(null));
  }, []);
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export const useRole = () => useContext(RoleContext);
