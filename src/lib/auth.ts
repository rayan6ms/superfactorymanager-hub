import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcrypt";
import { db } from "./db";
import { z } from "zod";

const credsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "EMAIL_REQUIRED")
    .email("INVALID_EMAIL"),
  password: z
    .string()
    .min(1, "PASSWORD_REQUIRED")
    .min(8, "PASSWORD_TOO_SHORT"),
});

export const authOptions: NextAuthConfig = {
  adapter: PrismaAdapter(db) as any,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credsSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });

        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new Error(issue?.message ?? "INVALID_CREDENTIALS");
        }

        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          throw new Error("EMAIL_NOT_FOUND");
        }

        const ok = await compare(password, user.passwordHash);
        if (!ok) {
          throw new Error("WRONG_PASSWORD");
        }

        return { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null };
      },
    }),
  ],
  pages: { signIn: "/login" },
  secret: process.env.AUTH_SECRET,
};

export const { auth, signIn, signOut, handlers } = NextAuth(authOptions);
export const GET = handlers.GET;
export const POST = handlers.POST;