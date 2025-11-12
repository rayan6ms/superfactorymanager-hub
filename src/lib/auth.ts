import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcrypt";
import { db } from "./db";
import { z } from "zod";

const credsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
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
        const parsed = credsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

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