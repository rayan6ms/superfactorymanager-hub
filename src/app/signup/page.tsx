"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui/index";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Failed"); return; }
    await signIn("credentials", { email, password, callbackUrl: next });
  }

  return (
    <>
      <Card className="max-w-sm space-y-3">
        <form className="space-y-2" onSubmit={onSubmit}>
          <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit">Create account</Button>
        </form>
      </Card>
      <div className="text-sm text-center text-white/70">
        Already have an account? <Link href="/login" className="underline">Log in</Link>
      </div>
    </>
  );
}

