import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { compare } from "bcrypt";
import { db } from "./db";
import { z } from "zod";
import type { Adapter } from "next-auth/adapters";

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

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email / Username & Password",
    credentials: {
      identifier: { label: "Email or username", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = credsSchema.safeParse({
        identifier: credentials?.identifier,
        password: credentials?.password,
      });

      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(issue?.message ?? "INVALID_CREDENTIALS");
      }

      const { identifier, password } = parsed.data;

      const user = await db.user.findFirst({
        where: {
          OR: [
            { email: identifier },
            { name: identifier },
          ],
        },
      });

      if (!user?.passwordHash) {
        throw new Error("EMAIL_NOT_FOUND");
      }

      const ok = await compare(password, user.passwordHash);
      if (!ok) {
        throw new Error("WRONG_PASSWORD");
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
      allowDangerousEmailAccountLinking: true,
    })
  );
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
        });

        if (!existing) {
          return true;
        }

        await db.user.update({
          where: { id: existing.id },
          data: {
            emailVerified: existing.emailVerified ?? new Date(),
            name: user.name ?? existing.name,
            image: user.image ?? existing.image,
          },
        });
      } catch (err) {
        console.warn("OAuth signIn callback user update failed:", err);
        // Do NOT throw – just log and allow sign-in
      }

      return true;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
        if (token.picture) {
          session.user.image = token.picture as string;
        }
        if (token.name) {
          session.user.name = token.name as string;
        }
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) {
        token.name = user.name ?? token.name;
        token.picture = user.image ?? token.picture;
      }
      return token;
    },
  }
};

export const { auth, signIn, signOut, handlers } = NextAuth(authOptions);
export const GET = handlers.GET;
export const POST = handlers.POST;
