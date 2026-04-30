export type Role = "executive" | "vice" | "manager" | "chief" | "staff" | "clerk";

export const ROLE_LABELS: Record<Role, string> = {
  executive: "役員",
  vice: "副社長",
  manager: "部長",
  chief: "課長",
  staff: "社員",
  clerk: "事務員",
};

// 全ロール（並び順は組織階層順）
export const ALL_ROLES: Role[] = ["executive", "vice", "manager", "chief", "staff", "clerk"];

// 管理職以上（副社長・部長・課長）= 5項目フル表示組
export const LEADERSHIP: Role[] = ["executive", "vice", "manager", "chief"];

export const PAGE_ACCESS: Record<string, Role[]> = {
  "/":          ALL_ROLES,
  "/ranking":   ["executive", "vice", "manager", "chief", "staff"],
  "/targets":   LEADERSHIP,
  "/meeting":   LEADERSHIP,
  "/minutes":   LEADERSHIP,
  "/trends":    ["executive", "vice", "manager", "chief", "staff"],
  "/matrix":    LEADERSHIP,
  "/breakeven": ["executive"],
  "/cockpit":   ["executive"],
  "/import":    ["executive"],
  "/admin":     ["executive"],
  "/data-io":   LEADERSHIP,
};

export const CAN_EDIT_DASHBOARD: Role[] = ["executive", "vice", "manager", "chief", "clerk"];
export const CAN_EDIT_TARGETS: Role[] = ["executive", "vice", "manager"];

export function canAccessPage(role: Role, path: string): boolean {
  const allowed = PAGE_ACCESS[path] ?? ["executive"];
  return allowed.includes(role);
}
// 役員専用ページ（損益分岐/CF/インポート/管理者）
export const ADMIN_ONLY_PAGES = ["/breakeven", "/cockpit", "/import", "/admin"];

export function canViewAdminPages(role: Role): boolean {
  return PAGE_ACCESS["/breakeven"]?.includes(role) ?? false;
}
