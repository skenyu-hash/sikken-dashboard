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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "ログインに失敗しました");
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
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">経営OS</h1>
          <p className="text-xs text-zinc-500 mt-1">アカウント情報を入力してください</p>
        </div>

        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">メールアドレス</span>
          <input
            type="email" autoComplete="email" required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 text-base"
            placeholder="user@example.com"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">パスワード</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password" required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 pr-20 text-base"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] px-3 text-xs rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
            >
              {showPassword ? "隠す" : "表示"}
            </button>
          </div>
        </label>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full min-h-[52px] rounded-lg bg-emerald-600 active:bg-emerald-800 text-white font-semibold py-4 disabled:opacity-50"
        >
          {loading ? "確認中..." : "ログイン"}
        </button>

        <p className="text-[11px] text-zinc-500 text-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
          アカウントが必要な方は管理者に連絡してください
        </p>
      </form>
    </div>
  );
}
