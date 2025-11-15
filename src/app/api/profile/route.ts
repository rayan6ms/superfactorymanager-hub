import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateInitialAvatar, resolveProfileImage } from "@/lib/avatar";
import { validateUsernameInput } from "@/lib/usernames";
import { isUsernameTaken } from "@/lib/usernames.server";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "NAME_REQUIRED"),
  image: z
    .string()
    .trim()
    .max(2048, "IMAGE_URL_TOO_LONG")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  regenerateAvatar: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { name, image, regenerateAvatar } = parsed.data;
  const usernameValidation = validateUsernameInput(name);
  if (!usernameValidation.ok) {
    return NextResponse.json({ error: usernameValidation.code }, { status: 400 });
  }

  const normalizedName = usernameValidation.normalized;
  if (await isUsernameTaken(normalizedName, user.id)) {
    return NextResponse.json({ error: "NAME_TAKEN" }, { status: 409 });
  }

  const updateData: { name: string; image?: string | null } = { name: normalizedName };

  if (regenerateAvatar) {
    updateData.image = generateInitialAvatar({ name: normalizedName, seed: user.email });
  } else if (typeof image === "string") {
    if (!image) {
      updateData.image = generateInitialAvatar({ name: normalizedName, seed: user.email });
    } else if (!/^https?:\/\//i.test(image) && !image.startsWith("data:")) {
      return NextResponse.json({ error: "INVALID_IMAGE_URL" }, { status: 400 });
    } else if (image === user.image) {
      updateData.image = user.image;
    } else {
      updateData.image = await resolveProfileImage({
        image,
        name: normalizedName,
        seed: user.email ?? user.id,
      });
    }
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: updateData,
    select: { id: true, name: true, image: true, email: true },
  });

  return NextResponse.json({ user: updated });
}
