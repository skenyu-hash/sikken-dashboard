import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PR #58a: /dashboard → / 永続リダイレクト
  // 背景: ナビバー「ダッシュボード」は / にリンクされており、実態は / がダッシュボード。
  //       /dashboard 直接アクセスは 404 になっていた (古いブックマーク / 外部リンク被害)。
  //       CDN レベルで 301 を返してページ実行を回避。
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/",
        permanent: true, // 308 (Next.js は permanent:true で 308、SEO 上 301 と同等扱い)
      },
    ];
  },
};

export default nextConfig;
