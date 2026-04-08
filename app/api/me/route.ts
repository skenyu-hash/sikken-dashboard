import { NextResponse } from "next/server";
import { currentRole } from "../../lib/auth";

export async function GET() {
  const role = await currentRole();
  if (!role) return NextResponse.json({ role: null }, { status: 401 });
  return NextResponse.json({ role });
}
