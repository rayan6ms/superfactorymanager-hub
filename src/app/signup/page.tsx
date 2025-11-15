import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignupForm from "./SignupForm";

type SignupPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function resolveNext(param: unknown): string {
  if (typeof param !== "string") return "/";
  if (!param.startsWith("/") || param.startsWith("//")) return "/";
  return param;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const nextParam = searchParams?.next;
  const next = Array.isArray(nextParam) ? nextParam[0] : nextParam;
  const safeNext = resolveNext(next);

  const session = await auth();
  if (session?.user) {
    redirect(safeNext);
  }

  return <SignupForm next={safeNext} />;
}
