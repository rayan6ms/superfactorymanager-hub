import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotifications, markNotifications } from "@/lib/notifications";

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const takeCandidate = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const take = typeof takeCandidate === "number" && Number.isFinite(takeCandidate) ? takeCandidate : undefined;
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";

  const data = await getNotifications(userId, { take, cursor: cursor || undefined, unreadOnly });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payload = body as { ids?: unknown; read?: unknown };
  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];
  const read = payload.read !== false;

  const result = await markNotifications(userId, ids, read);
  return NextResponse.json(result);
}
