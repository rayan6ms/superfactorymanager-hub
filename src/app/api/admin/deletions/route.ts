import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { flagAsDeleted, purgeExpiredDeletionsIfNeeded, restoreDeletion } from "@/lib/deletions";
import { revalidateSeoPaths } from "@/lib/seo-revalidate";

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await purgeExpiredDeletionsIfNeeded();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, targetId, action } = (body as Record<string, unknown>) ?? {};

  if (type !== "post" && type !== "comment") {
    return NextResponse.json({ error: "Unsupported target type" }, { status: 400 });
  }

  if (action !== "flag" && action !== "restore") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  if (!targetId || typeof targetId !== "string") {
    return NextResponse.json({ error: "Missing target id" }, { status: 400 });
  }

  try {
    if (action === "flag") {
      const result = await flagAsDeleted(type, targetId, { auto: false });
      if (type === "post") {
        try {
          revalidateSeoPaths();
        } catch (error) {
          console.error("Failed to revalidate SEO routes after post flag:", error);
        }
      }
      return NextResponse.json({ success: true, slug: result.slug, action: "flag" });
    }

    const result = await restoreDeletion(type, targetId);
    if (type === "post") {
      try {
        revalidateSeoPaths();
      } catch (error) {
        console.error("Failed to revalidate SEO routes after post restore:", error);
      }
    }
    return NextResponse.json({ success: true, slug: result.slug, action: "restore" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
