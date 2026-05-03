import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { DailyEntry, FixedCosts, Targets } from "./calculations";

let _sql: NeonQueryFunction<false, false> | null = null;
export function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = neon(url);
  return _sql;
}

let schemaReady: Promise<void> | null = null;

/** 初回呼び出し時にテーブルを作成(idempotent) */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      const safe = async (q: Promise<unknown>) => { try { await q; } catch (e) { console.error("Schema error:", e); } };

      await safe(sql`
        CREATE TABLE IF NOT EXISTS entries (
          area_id TEXT NOT NULL,
          business_category VARCHAR(20) NOT NULL DEFAULT 'water',
          entry_date DATE NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (area_id, business_category, entry_date)
        )
      `);
      // Phase 9.5: 既存DBに対する冪等マイグレーション。
      // entries テーブルは長らく PK=(area_id, entry_date) で
      // business_category を含まない構造だったため、業態別の同日レコードが
      // PK衝突で1行に圧縮されてしまう設計バグがあった。新スキーマに揃える。
      await safe(sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS business_category VARCHAR(20) DEFAULT 'water'`);
      await safe(sql`UPDATE entries SET business_category = 'water' WHERE business_category IS NULL`);
      await safe(sql`ALTER TABLE entries ALTER COLUMN business_category SET NOT NULL`);
      await safe(sql`ALTER TABLE entries ALTER COLUMN business_category SET DEFAULT 'water'`);
      await safe(sql`ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_pkey`);
      await safe(sql`ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_area_cat_date_key`);
      await safe(sql`ALTER TABLE entries ADD CONSTRAINT entries_pkey PRIMARY KEY (area_id, business_category, entry_date)`);
      // 旧 UNIQUE 制約は CONSTRAINT ではなく INDEX として登録されていたため
      // ALTER TABLE DROP CONSTRAINT では消えない。新 PK と完全に同じカラム
      // セットの冗長 INDEX なので明示的に DROP INDEX で削除する。
      await safe(sql`DROP INDEX IF EXISTS entries_area_cat_date_key`);
      await safe(sql`
        CREATE TABLE IF NOT EXISTS fixed_costs (
          area_id TEXT NOT NULL,
          year INT NOT NULL,
          month INT NOT NULL,
          labor_cost BIGINT NOT NULL DEFAULT 0,
          rent BIGINT NOT NULL DEFAULT 0,
          other BIGINT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (area_id, year, month)
        )
      `);
      await safe(sql`
        CREATE TABLE IF NOT EXISTS targets (
          area_id TEXT NOT NULL,
          year INT NOT NULL,
          month INT NOT NULL,
          target_sales BIGINT NOT NULL DEFAULT 0,
          target_profit BIGINT NOT NULL DEFAULT 0,
          target_count INT NOT NULL DEFAULT 0,
          target_cpa INT NOT NULL DEFAULT 0,
          target_conversion_rate NUMERIC NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (area_id, year, month)
        )
      `);
      // 旧スキーマからのマイグレーション(列が無ければ追加)
      const migrations = [
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_cpa INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_conversion_rate NUMERIC NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_help_sales BIGINT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_help_count INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_help_unit_price INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_self_sales BIGINT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_self_profit BIGINT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_self_count INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_new_sales BIGINT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_new_profit BIGINT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_new_count INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_ad_cost BIGINT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_ad_rate NUMERIC NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_labor_rate NUMERIC NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_material_rate NUMERIC NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_vehicle_count INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_call_count INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_construction_rate NUMERIC NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_pass_rate NUMERIC NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_unit_price INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_call_unit_price INT NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_help_rate NUMERIC NOT NULL DEFAULT 0`,
        sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS business_category TEXT NOT NULL DEFAULT 'water'`,
      ];
      for (const m of migrations) await safe(m);

      // PRIMARY KEY を business_category 込みに変更（冪等）
      await safe(sql`ALTER TABLE targets DROP CONSTRAINT IF EXISTS targets_pkey`);
      await safe(sql`ALTER TABLE targets ADD CONSTRAINT targets_pkey PRIMARY KEY (area_id, year, month, business_category)`);

      await safe(sql`
        CREATE TABLE IF NOT EXISTS cashflow_entries (
          id BIGSERIAL PRIMARY KEY,
          area_id TEXT NOT NULL,
          year INT NOT NULL,
          month INT NOT NULL,
          accounts_receivable BIGINT NOT NULL DEFAULT 0,
          accounts_receivable_overdue BIGINT NOT NULL DEFAULT 0,
          bank_balance BIGINT NOT NULL DEFAULT 0,
          loan_balance BIGINT NOT NULL DEFAULT 0,
          loan_repayment BIGINT NOT NULL DEFAULT 0,
          scheduled_payments BIGINT NOT NULL DEFAULT 0,
          payment_due_date DATE,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await safe(sql`CREATE INDEX IF NOT EXISTS idx_cf_area_ym ON cashflow_entries(area_id, year, month)`);

      await safe(sql`
        CREATE TABLE IF NOT EXISTS monthly_summaries (
          id SERIAL PRIMARY KEY,
          area_id TEXT NOT NULL,
          year INT NOT NULL,
          month INT NOT NULL,
          total_revenue BIGINT NOT NULL DEFAULT 0,
          total_profit BIGINT NOT NULL DEFAULT 0,
          total_count INT NOT NULL DEFAULT 0,
          unit_price INT NOT NULL DEFAULT 0,
          ad_cost BIGINT NOT NULL DEFAULT 0,
          ad_rate NUMERIC NOT NULL DEFAULT 0,
          acquisition_count INT NOT NULL DEFAULT 0,
          cpa INT NOT NULL DEFAULT 0,
          call_count INT NOT NULL DEFAULT 0,
          call_unit_price INT NOT NULL DEFAULT 0,
          conv_rate NUMERIC NOT NULL DEFAULT 0,
          profit_rate NUMERIC NOT NULL DEFAULT 0,
          help_revenue BIGINT NOT NULL DEFAULT 0,
          help_count INT NOT NULL DEFAULT 0,
          help_unit_price INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(area_id, year, month)
        )
      `);

      await safe(sql`ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS vehicle_count INT NOT NULL DEFAULT 0`);

      await safe(sql`
        CREATE TABLE IF NOT EXISTS access_logs (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          action_type TEXT NOT NULL,
          target_area TEXT,
          target_page TEXT,
          detail TEXT,
          ip_address TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/** 指定エリア・指定月の入力データを取得 */
export async function listEntries(
  areaId: string,
  year: number,
  month: number,
  category: string = "water"
): Promise<DailyEntry[]> {
  await ensureSchema();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  // 月初〜翌月初未満
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const rows = (await getSql()`
    SELECT data FROM entries
    WHERE area_id = ${areaId} AND entry_date >= ${start} AND entry_date < ${end}
      AND COALESCE(business_category, 'water') = ${category}
    ORDER BY entry_date ASC
  `) as { data: DailyEntry }[];

  return rows.map((r) => r.data);
}

export async function getFixedCosts(
  areaId: string, year: number, month: number
): Promise<FixedCosts> {
  await ensureSchema();
  const rows = (await getSql()`
    SELECT labor_cost, rent, other FROM fixed_costs
    WHERE area_id = ${areaId} AND year = ${year} AND month = ${month}
  `) as { labor_cost: string | number; rent: string | number; other: string | number }[];
  if (!rows[0]) return { laborCost: 0, rent: 0, other: 0 };
  return {
    laborCost: Number(rows[0].labor_cost),
    rent: Number(rows[0].rent),
    other: Number(rows[0].other),
  };
}

export async function upsertFixedCosts(
  areaId: string, year: number, month: number, fc: FixedCosts
): Promise<void> {
  await ensureSchema();
  await getSql()`
    INSERT INTO fixed_costs (area_id, year, month, labor_cost, rent, other)
    VALUES (${areaId}, ${year}, ${month}, ${fc.laborCost}, ${fc.rent}, ${fc.other})
    ON CONFLICT (area_id, year, month) DO UPDATE
    SET labor_cost = EXCLUDED.labor_cost, rent = EXCLUDED.rent, other = EXCLUDED.other
  `;
}

export async function getTargets(
  areaId: string, year: number, month: number, category: string = "water"
): Promise<Targets> {
  await ensureSchema();
  const rows = (await getSql()`
    SELECT target_sales, target_profit, target_count, target_cpa, target_conversion_rate,
      target_help_sales, target_help_count, target_help_unit_price,
      target_self_sales, target_self_profit, target_self_count,
      target_new_sales, target_new_profit, target_new_count,
      target_ad_cost, target_ad_rate, target_labor_rate, target_material_rate,
      target_vehicle_count, target_call_count, target_construction_rate, target_pass_rate,
      target_unit_price, target_call_unit_price, target_help_rate
    FROM targets WHERE area_id = ${areaId} AND year = ${year} AND month = ${month}
      AND COALESCE(business_category, 'water') = ${category}
  `) as Record<string, string | number>[];
  if (!rows[0]) {
    return {
      targetSales: 0, targetProfit: 0, targetCount: 0, targetCpa: 0, targetConversionRate: 0,
      targetHelpSales: 0, targetHelpCount: 0, targetHelpUnitPrice: 0,
      targetSelfSales: 0, targetSelfProfit: 0, targetSelfCount: 0,
      targetNewSales: 0, targetNewProfit: 0, targetNewCount: 0,
      targetAdCost: 0, targetAdRate: 0, targetLaborRate: 0, targetMaterialRate: 0,
      targetVehicleCount: 0, targetCallCount: 0,
      targetConstructionRate: 0, targetPassRate: 0,
      targetUnitPrice: 0, targetCallUnitPrice: 0, targetHelpRate: 0,
    };
  }
  const r = rows[0];
  return {
    targetSales: Number(r.target_sales),
    targetProfit: Number(r.target_profit),
    targetCount: Number(r.target_count),
    targetCpa: Number(r.target_cpa),
    targetConversionRate: Number(r.target_conversion_rate),
    targetHelpSales: Number(r.target_help_sales),
    targetHelpCount: Number(r.target_help_count),
    targetHelpUnitPrice: Number(r.target_help_unit_price),
    targetSelfSales: Number(r.target_self_sales),
    targetSelfProfit: Number(r.target_self_profit),
    targetSelfCount: Number(r.target_self_count),
    targetNewSales: Number(r.target_new_sales),
    targetNewProfit: Number(r.target_new_profit),
    targetNewCount: Number(r.target_new_count),
    targetAdCost: Number(r.target_ad_cost),
    targetAdRate: Number(r.target_ad_rate),
    targetLaborRate: Number(r.target_labor_rate),
    targetMaterialRate: Number(r.target_material_rate),
    targetVehicleCount: Number(r.target_vehicle_count),
    targetCallCount: Number(r.target_call_count),
    targetConstructionRate: Number(r.target_construction_rate),
    targetPassRate: Number(r.target_pass_rate),
    targetUnitPrice: Number(r.target_unit_price),
    targetCallUnitPrice: Number(r.target_call_unit_price),
    targetHelpRate: Number(r.target_help_rate),
  };
}

export async function upsertTargets(
  areaId: string, year: number, month: number, t: Targets, category: string = "water"
): Promise<void> {
  await ensureSchema();
  await getSql()`
    INSERT INTO targets (
      area_id, year, month, business_category,
      target_sales, target_profit, target_count, target_cpa, target_conversion_rate,
      target_help_sales, target_help_count, target_help_unit_price,
      target_self_sales, target_self_profit, target_self_count,
      target_new_sales, target_new_profit, target_new_count,
      target_ad_cost, target_ad_rate, target_labor_rate, target_material_rate,
      target_vehicle_count, target_call_count, target_construction_rate, target_pass_rate,
      target_unit_price, target_call_unit_price, target_help_rate,
      updated_at
    )
    VALUES (
      ${areaId}, ${year}, ${month}, ${category},
      ${t.targetSales}, ${t.targetProfit}, ${t.targetCount}, ${t.targetCpa}, ${t.targetConversionRate},
      ${t.targetHelpSales}, ${t.targetHelpCount}, ${t.targetHelpUnitPrice},
      ${t.targetSelfSales}, ${t.targetSelfProfit}, ${t.targetSelfCount},
      ${t.targetNewSales}, ${t.targetNewProfit}, ${t.targetNewCount},
      ${t.targetAdCost}, ${t.targetAdRate}, ${t.targetLaborRate}, ${t.targetMaterialRate},
      ${t.targetVehicleCount}, ${t.targetCallCount}, ${t.targetConstructionRate}, ${t.targetPassRate},
      ${t.targetUnitPrice}, ${t.targetCallUnitPrice}, ${t.targetHelpRate},
      NOW()
    )
    ON CONFLICT (area_id, year, month, business_category) DO UPDATE
    SET target_sales = EXCLUDED.target_sales,
        target_profit = EXCLUDED.target_profit,
        target_count = EXCLUDED.target_count,
        target_cpa = EXCLUDED.target_cpa,
        target_conversion_rate = EXCLUDED.target_conversion_rate,
        target_help_sales = EXCLUDED.target_help_sales,
        target_help_count = EXCLUDED.target_help_count,
        target_help_unit_price = EXCLUDED.target_help_unit_price,
        target_self_sales = EXCLUDED.target_self_sales,
        target_self_profit = EXCLUDED.target_self_profit,
        target_self_count = EXCLUDED.target_self_count,
        target_new_sales = EXCLUDED.target_new_sales,
        target_new_profit = EXCLUDED.target_new_profit,
        target_new_count = EXCLUDED.target_new_count,
        target_ad_cost = EXCLUDED.target_ad_cost,
        target_ad_rate = EXCLUDED.target_ad_rate,
        target_labor_rate = EXCLUDED.target_labor_rate,
        target_material_rate = EXCLUDED.target_material_rate,
        target_vehicle_count = EXCLUDED.target_vehicle_count,
        target_call_count = EXCLUDED.target_call_count,
        target_construction_rate = EXCLUDED.target_construction_rate,
        target_pass_rate = EXCLUDED.target_pass_rate,
        target_unit_price = EXCLUDED.target_unit_price,
        target_call_unit_price = EXCLUDED.target_call_unit_price,
        target_help_rate = EXCLUDED.target_help_rate,
        updated_at = NOW()
  `;
}

// ============ Cashflow ============
export type CashflowEntry = {
  id?: number;
  areaId: string;
  year: number;
  month: number;
  accountsReceivable: number;
  accountsReceivableOverdue: number;
  bankBalance: number;
  loanBalance: number;
  loanRepayment: number;
  scheduledPayments: number;
  paymentDueDate: string | null;
  notes: string;
};

export async function listCashflow(year: number, month: number): Promise<CashflowEntry[]> {
  await ensureSchema();
  const rows = (await getSql()`
    SELECT id, area_id, year, month,
      accounts_receivable, accounts_receivable_overdue,
      bank_balance, loan_balance, loan_repayment,
      scheduled_payments, payment_due_date, notes
    FROM cashflow_entries
    WHERE year = ${year} AND month = ${month}
    ORDER BY area_id, id
  `) as Record<string, string | number | null>[];
  return rows.map((r) => ({
    id: Number(r.id),
    areaId: String(r.area_id),
    year: Number(r.year),
    month: Number(r.month),
    accountsReceivable: Number(r.accounts_receivable),
    accountsReceivableOverdue: Number(r.accounts_receivable_overdue),
    bankBalance: Number(r.bank_balance),
    loanBalance: Number(r.loan_balance),
    loanRepayment: Number(r.loan_repayment),
    scheduledPayments: Number(r.scheduled_payments),
    paymentDueDate: r.payment_due_date ? String(r.payment_due_date).slice(0, 10) : null,
    notes: r.notes ? String(r.notes) : "",
  }));
}

export async function insertCashflow(e: CashflowEntry): Promise<void> {
  await ensureSchema();
  await getSql()`
    INSERT INTO cashflow_entries
      (area_id, year, month, accounts_receivable, accounts_receivable_overdue,
       bank_balance, loan_balance, loan_repayment, scheduled_payments,
       payment_due_date, notes)
    VALUES
      (${e.areaId}, ${e.year}, ${e.month}, ${e.accountsReceivable}, ${e.accountsReceivableOverdue},
       ${e.bankBalance}, ${e.loanBalance}, ${e.loanRepayment}, ${e.scheduledPayments},
       ${e.paymentDueDate}, ${e.notes})
  `;
}

export async function deleteCashflow(id: number): Promise<void> {
  await ensureSchema();
  await getSql()`DELETE FROM cashflow_entries WHERE id = ${id}`;
}

/** 入力データを upsert */
export async function upsertEntry(
  areaId: string,
  entry: DailyEntry,
  category: string = "water"
): Promise<void> {
  await ensureSchema();
  await getSql()`
    INSERT INTO entries (area_id, entry_date, data, business_category, updated_at)
    VALUES (${areaId}, ${entry.date}, ${JSON.stringify(entry)}::jsonb, ${category}, NOW())
    ON CONFLICT (area_id, business_category, entry_date)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
}
