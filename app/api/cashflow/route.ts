import { NextResponse } from "next/server";
import { currentRole } from "../../lib/auth";
import { listCashflow, insertCashflow, deleteCashflow, type CashflowEntry } from "../../lib/db";

export const runtime = "nodejs";

const AREA_IDS = new Set([
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
]);

export async function GET(req: Request) {
  const role = await currentRole();
  if (role !== "executive") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!year || !month) return NextResponse.json({ error: "bad params" }, { status: 400 });

  try {
    const entries = await listCashflow(year, month);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const role = await currentRole();
  if (role !== "executive") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Partial<CashflowEntry> | null;
  if (!body || !body.areaId || !body.year || !body.month || !AREA_IDS.has(body.areaId)) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const e: CashflowEntry = {
    areaId: body.areaId,
    year: body.year,
    month: body.month,
    accountsReceivable: body.accountsReceivable ?? 0,
    accountsReceivableOverdue: body.accountsReceivableOverdue ?? 0,
    bankBalance: body.bankBalance ?? 0,
    loanBalance: body.loanBalance ?? 0,
    loanRepayment: body.loanRepayment ?? 0,
    scheduledPayments: body.scheduledPayments ?? 0,
    paymentDueDate: body.paymentDueDate ?? null,
    notes: body.notes ?? "",
  };

  try {
    await insertCashflow(e);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const role = await currentRole();
  if (role !== "executive") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "bad params" }, { status: 400 });

  try {
    await deleteCashflow(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
