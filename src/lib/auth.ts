import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { compare } from "bcrypt";
import { db } from "./db";
import { z } from "zod";
import type { Adapter } from "next-auth/adapters";
import { generateInitialAvatar, resolveProfileImage } from "./avatar";
import { generateAvailableUsername } from "./usernames.server";
import { createNotification } from "./notifications";
import { checkRateLimit, getClientRateLimitKey, hashRateLimitIdentifier } from "./request-security";
import { isAdminEmail } from "./admin";

const credsSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "IDENTIFIER_REQUIRED"),
  password: z
    .string()
    .min(1, "PASSWORD_REQUIRED")
    .min(8, "PASSWORD_TOO_SHORT"),
});

const sessionProfileUpdateSchema = z.object({
  user: z.object({
    name: z.string().trim().min(1).optional(),
    image: z.string().trim().max(4096).nullable().optional(),
  }).partial(),
});

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LIMIT_PER_IP = 60;
const LOGIN_LIMIT_PER_IDENTIFIER = 12;

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email / Username & Password",
    credentials: {
      identifier: { label: "Email or username", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const headers = request?.headers instanceof Headers ? request.headers : new Headers();
      const clientKey = getClientRateLimitKey(headers);
      const ipBucket = await checkRateLimit(`auth:login:client:${clientKey}`, {
        windowMs: LOGIN_WINDOW_MS,
        limit: LOGIN_LIMIT_PER_IP,
      });
      if (!ipBucket.allowed) {
        throw new Error("TOO_MANY_ATTEMPTS");
      }

      const parsed = credsSchema.safeParse({
        identifier: credentials?.identifier,
        password: credentials?.password,
      });

      if (!parsed.success) {
        throw new Error("INVALID_CREDENTIALS");
      }

      const { identifier, password } = parsed.data;
      const normalizedIdentifier = identifier.toLowerCase();
      const identifierKey = hashRateLimitIdentifier(normalizedIdentifier, "auth:login:identifier");
      const identifierBucket = await checkRateLimit(
        `auth:login:identifier:${identifierKey}`,
        {
          windowMs: LOGIN_WINDOW_MS,
          limit: LOGIN_LIMIT_PER_IDENTIFIER,
        },
      );
      if (!identifierBucket.allowed) {
        throw new Error("TOO_MANY_ATTEMPTS");
      }

      const userLookup = normalizedIdentifier.includes("@")
        ? { email: normalizedIdentifier }
        : { name: normalizedIdentifier };

      const user = await db.user.findUnique({
        where: userLookup,
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          passwordHash: true,
          emailVerified: true,
        },
      });

      if (!user?.passwordHash) {
        throw new Error("INVALID_CREDENTIALS");
      }

      const ok = await compare(password, user.passwordHash);
      if (!ok) {
        throw new Error("INVALID_CREDENTIALS");
      }

      if (!user.emailVerified) {
        throw new Error("EMAIL_NOT_VERIFIED");
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

async function ensurePasswordReminderNotification(userId: string, profilePath = "/profile") {
  try {
    const existing = await db.notification.findFirst({
      where: {
        userId,
        metadata: {
          equals: { kind: "password-reminder" },
        },
      },
    });

    if (existing) {
      return;
    }

    await createNotification({
      userId,
      title: "Secure your account",
      message: "Add a password so you can log in without your social account. Visit your profile to request a reset email.",
      link: profilePath,
      metadata: { kind: "password-reminder" },
    });
  } catch (error) {
    console.warn("Failed to create password reminder notification:", error);
  }
}

export const authOptions: NextAuthConfig = {
  adapter: PrismaAdapter(db) as Adapter,
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login" },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      if (!account) return true;

      if (account.provider === "credentials") {
        return true;
      }

      if (!user?.id) {
        return true;
      }

      try {
        const existing = await db.user.findUnique({
          where: { id: user.id as string },
          select: { id: true, name: true, email: true, image: true, passwordHash: true, emailVerified: true },
        });

        if (!existing) {
          return true;
        }

        const updateData: {
          emailVerified?: Date;
          name?: string | null;
          image?: string | null;
        } = {};

        if (!existing.emailVerified) {
          updateData.emailVerified = new Date();
        }

        let nextName = existing.name ?? user.name ?? existing.email ?? user.email ?? undefined;

        if (!existing.name) {
          const unique = await generateAvailableUsername(user.name ?? existing.name ?? null, existing.email ?? user.email ?? null, existing.id);
          updateData.name = unique;
          nextName = unique;
        }

        if (user.image) {
          const fallbackName = nextName ?? existing.email ?? user.email ?? "user";
          const seed = existing.email ?? user.email ?? existing.id;
          const fallbackAvatar = generateInitialAvatar({ name: fallbackName, seed });
          const resolved = await resolveProfileImage({ image: user.image, name: fallbackName, seed });

          if (resolved !== existing.image) {
            if (resolved === fallbackAvatar) {
              if (!existing.image) {
                updateData.image = resolved;
              }
            } else {
              updateData.image = resolved;
            }
          }
        }

        if (Object.keys(updateData).length > 0) {
          await db.user.update({
            where: { id: existing.id },
            data: updateData,
          });
        }

        if (!existing.passwordHash) {
          const notificationUsername = updateData.name ?? existing.name;
          const profilePath = notificationUsername ? `/profile/${encodeURIComponent(notificationUsername)}` : "/profile";
          await ensurePasswordReminderNotification(existing.id, profilePath);
        }
      } catch (err) {
        console.warn("OAuth signIn callback user update failed:", err);
        // Do NOT throw – just log and allow sign-in
      }

      return true;
    },

    async session({ session, token }) {
      if (!session.user) return session;

      if (token.sub) {
        session.user.id = token.sub;
      }

      if (token.name) {
        session.user.name = token.name as string;
      }
      if (token.email) {
        session.user.email = token.email as string;
      }
      if (typeof token.isAdmin === "boolean") {
        session.user.isAdmin = token.isAdmin;
      }
      const tokenWithImage = token as JWT & { image?: string | null };
      if (typeof tokenWithImage.image === "string" || tokenWithImage.image === null) {
        session.user.image = tokenWithImage.image;
      }

      return session;
    },

    async jwt({ token, user, trigger, session }): Promise<JWT> {
      if (trigger === "update") {
        const parsed = sessionProfileUpdateSchema.safeParse(session);
        if (parsed.success) {
          const nextUser = parsed.data.user;
          if (typeof nextUser?.name === "string" && nextUser.name) {
            token.name = nextUser.name;
          }
          if (nextUser && "image" in nextUser) {
            (token as JWT & { image?: string | null }).image = nextUser.image ?? null;
          }
        }
      }

      if (user) {
        if (user.name) {
          token.name = user.name;
        }
        if (user.email) {
          token.email = user.email;
        }
        token.isAdmin = isAdminEmail(user.email);
        if (typeof user.image === "string") {
          (token as JWT & { image?: string | null }).image = user.image;
        }
      }

      const tokenWithPicture = token as JWT & { picture?: string | null };
      if ("picture" in tokenWithPicture) {
        delete tokenWithPicture.picture;
      }
      return tokenWithPicture;
    },
  },
  events: {
    async createUser({ user }) {
      const userId = user.id as string | undefined;
      if (!userId) return;

      try {
        const existing = await db.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            passwordHash: true,
            emailVerified: true,
          },
        });

        if (!existing) return;

        const uniqueName = await generateAvailableUsername(user.name ?? existing.name ?? null, existing.email ?? user.email ?? null, existing.id);
        const seed = existing.email ?? user.email ?? existing.id;
        const imageSource = typeof user.image === "string" ? user.image : existing.image ?? undefined;
        const resolvedImage = imageSource
          ? await resolveProfileImage({ image: imageSource, name: uniqueName, seed })
          : generateInitialAvatar({ name: uniqueName, seed });

        await db.user.update({
          where: { id: existing.id },
          data: {
            name: uniqueName,
            image: resolvedImage,
            emailVerified: existing.emailVerified ?? new Date(),
          },
        });

        if (!existing.passwordHash) {
          await ensurePasswordReminderNotification(existing.id, `/profile/${encodeURIComponent(uniqueName)}`);
        }
      } catch (error) {
        console.warn("createUser event handling failed:", error);
      }
    },
  },
};

export const { auth, signIn, signOut, handlers } = NextAuth(authOptions);
export const GET = handlers.GET;
export const POST = handlers.POST;
