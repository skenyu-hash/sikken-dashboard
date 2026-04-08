import { NextResponse } from "next/server";
import { currentUser } from "../../lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      areaId: user.areaId,
    },
  });
}
