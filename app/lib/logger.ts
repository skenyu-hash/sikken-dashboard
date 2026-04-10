export async function logAction(
  actionType: "view" | "edit" | "login" | "logout",
  options?: {
    targetArea?: string;
    targetPage?: string;
    detail?: string;
  }
) {
  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionType, ...options }),
    });
  } catch {
    // ログ失敗は無視
  }
}
