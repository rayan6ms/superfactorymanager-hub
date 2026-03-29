import type { Prisma } from "@prisma/client";
import { db } from "./db";

type SessionUser = {
  id?: string | null;
  email?: string | null;
} | null | undefined;

export async function getCurrentUserFromSession<T extends Prisma.UserSelect>(
  sessionUser: SessionUser,
  select: T,
): Promise<Prisma.UserGetPayload<{ select: T }> | null> {
  if (sessionUser?.id) {
    return db.user.findUnique({
      where: { id: sessionUser.id },
      select,
    });
  }

  if (sessionUser?.email) {
    return db.user.findUnique({
      where: { email: sessionUser.email },
      select,
    });
  }

  return null;
}
