// SIKKEN 新規ユーザー6名 一括投入スクリプト (2026-05-04)
//
// 実行:
//   ドライラン: export $(grep DATABASE_URL .env.local | xargs) && npx tsx scripts/insert_new_users_202605.ts --dry-run
//   本適用:    export $(grep DATABASE_URL .env.local | xargs) && npx tsx scripts/insert_new_users_202605.ts
//
// 設計:
//   - 共通仮パスワード "Sikken2026!" を bcryptjs で hash (saltRounds=10、auth.ts と整合)
//   - 6件を1トランザクションで INSERT
//   - --dry-run なら ROLLBACK で原状復帰
//   - INSERT 前に重複チェック、検出なら throw して中止

import bcrypt from "bcryptjs";
import { Pool } from "@neondatabase/serverless";

type Role = "executive" | "vice" | "manager" | "chief" | "staff" | "clerk";

type NewUser = {
  name: string;
  email: string;
  role: Role;
  area_id: string;
  business_category: string;
};

const NEW_USERS: NewUser[] = [
  { name: "相川佳祐", email: "keisuke.a0219@icloud.com", role: "vice", area_id: "kanto", business_category: "water" },
  { name: "藤春直哉", email: "naoya1645010@gmail.com", role: "vice", area_id: "kyushu", business_category: "water" },
  { name: "野田拓夢", email: "takusnsd7@gmail.com", role: "chief", area_id: "kyushu", business_category: "water" },
  { name: "山口優樹", email: "mountain.mouth2342second@gmail.com", role: "staff", area_id: "kyushu", business_category: "water" },
  { name: "木下勇毅", email: "y.kinoshita@mavericks-corp.com", role: "chief", area_id: "kansai", business_category: "water" },
  { name: "芝田圭吾", email: "keigo5135@gmail.com", role: "staff", area_id: "kansai", business_category: "road" },
];

const COMMON_PASSWORD = "Sikken2026!";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Run: export $(grep DATABASE_URL .env.local | xargs) before running this script.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const isDryRun = process.argv.includes("--dry-run");
  console.log(isDryRun ? "🧪 DRY RUN MODE (BEGIN/ROLLBACK)" : "🚀 PRODUCTION MODE (BEGIN/COMMIT)");

  console.log(`🔐 Hashing common password (bcryptjs, saltRounds=10)...`);
  const passwordHash = await bcrypt.hash(COMMON_PASSWORD, 10);
  console.log(`✅ Hash generated (${passwordHash.length} chars)`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 重複メールの再確認（前段ですでに psql で確認済みだが念のため）
    const beforeRes = await client.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM users WHERE email = ANY($1)`,
      [NEW_USERS.map((u) => u.email)]
    );
    console.log(`📊 Before INSERT: ${beforeRes.rows[0].cnt} existing users with these emails (期待: 0)`);
    if (beforeRes.rows[0].cnt > 0) {
      throw new Error("既に同じメールアドレスのユーザーが存在します。中止。");
    }

    let inserted = 0;
    for (const u of NEW_USERS) {
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, area_id, business_category, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [u.name, u.email, passwordHash, u.role, u.area_id, u.business_category]
      );
      console.log(`  ✅ ${u.name} (${u.email}) → role=${u.role}, area=${u.area_id}, biz=${u.business_category}`);
      inserted++;
    }
    console.log(`📥 Inserted: ${inserted}/6`);

    // 投入後検証
    const afterRes = await client.query<{
      name: string; email: string; role: string; area_id: string | null; business_category: string | null;
    }>(
      `SELECT name, email, role, area_id, business_category
       FROM users WHERE email = ANY($1)
       ORDER BY name`,
      [NEW_USERS.map((u) => u.email)]
    );
    console.log("\n📋 Inserted users (verify):");
    afterRes.rows.forEach((r) =>
      console.log(`  - ${r.name} | ${r.email} | ${r.role} | ${r.area_id} | ${r.business_category}`)
    );

    // 全体ロール分布
    const distRes = await client.query<{ role: string; cnt: number }>(`
      SELECT role, COUNT(*)::int AS cnt
      FROM users
      GROUP BY role
      ORDER BY
        CASE role
          WHEN 'executive' THEN 1
          WHEN 'vice' THEN 2
          WHEN 'manager' THEN 3
          WHEN 'chief' THEN 4
          WHEN 'staff' THEN 5
          WHEN 'clerk' THEN 6
          ELSE 7
        END
    `);
    console.log("\n📊 Final role distribution:");
    distRes.rows.forEach((r) => console.log(`  - ${r.role}: ${r.cnt}`));

    if (isDryRun) {
      await client.query("ROLLBACK");
      console.log("\n🔄 ROLLBACK (DRY RUN). No DB changes.");
    } else {
      await client.query("COMMIT");
      console.log("\n✅ COMMIT. Changes persisted to DB.");
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Error, ROLLBACK:", e);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
