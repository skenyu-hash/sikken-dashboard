export type Role = "admin" | "manager" | "staff" | "input";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "役員",
  manager: "部長",
  staff: "内勤・役職者",
  input: "事務員",
};

export const PAGE_ACCESS: Record<string, Role[]> = {
  "/":          ["admin", "manager", "staff", "input"],
  "/ranking":   ["admin", "manager", "staff", "input"],
  "/targets":   ["admin", "manager", "staff", "input"],
  "/meeting":   ["admin", "manager", "staff", "input"],
  "/trends":    ["admin", "manager", "staff", "input"],
  "/breakeven": ["admin"],
  "/cockpit":   ["admin"],
  "/import":    ["admin"],
  "/admin":     ["admin"],
};

export const CAN_EDIT_DASHBOARD: Role[] = ["admin", "manager", "input"];
export const CAN_EDIT_TARGETS: Role[] = ["admin", "manager"];

export function canAccessPage(role: Role, path: string): boolean {
  const allowed = PAGE_ACCESS[path] ?? ["admin"];
  return allowed.includes(role);
}
