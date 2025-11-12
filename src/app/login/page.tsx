"use client";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input } from "@/components/ui/index";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await signIn("credentials", { redirect: true, email, password, callbackUrl: next });
    if ((res as any)?.error) alert((res as any).error);
  }

  return (
    <>
      <Card className="max-w-sm space-y-3">
        <form className="space-y-2" onSubmit={onSubmit}>
          <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit">Login</Button>
        </form>
      </Card>
      <div className="text-sm text-center text-white/70">
        New here? <Link href="/signup" className="underline">Create an account</Link>
      </div>
    </>
  );
}