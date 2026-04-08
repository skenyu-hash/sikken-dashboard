"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("パスワードが正しくありません");
        setLoading(false);
        return;
      }
      router.replace(next);
    } catch {
      setError("通信エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-4"
      >
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          経営ダッシュボード
        </h1>
        <p className="text-sm text-zinc-500">パスワードを入力してください</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-3 text-base"
          placeholder="パスワード"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full min-h-[52px] rounded-lg bg-emerald-600 active:bg-emerald-800 text-white font-semibold py-4 disabled:opacity-50"
        >
          {loading ? "確認中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
