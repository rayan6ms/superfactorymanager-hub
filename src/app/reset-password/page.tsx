"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Button, Input } from "@/components/ui";
import { Mail } from "lucide-react";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = "idle" | "submitting" | "success";

type Errors = {
  email?: string;
  form?: string;
};

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errors, setErrors] = useState<Errors>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (state === "submitting") return;

    const nextErrors: Errors = {};
    if (!email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!emailRegex.test(email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setState("submitting");
    setErrors({});

    try {
      const res = await fetch("/api/auth/password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.error === "EMAIL_SEND_FAILED") {
          setErrors({ form: "We couldn’t send the reset email. Please try again later." });
        } else {
          setErrors({ form: "Unable to send reset email. Please try again." });
        }
        setState("idle");
        return;
      }

      // success
      setState("success");
    } catch (error) {
      console.error("Reset email request failed", error);
      setErrors({ form: "Unable to send reset email. Please try again." });
      setState("idle");
    }
  }

  return (
    <main className="flex flex-col items-center justify-start gap-6 px-4 pb-12 pt-16">
      <Card className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-white">Forgot password</h1>
          <p className="text-sm text-white/70">
            Enter the email address associated with your account and we&apos;ll send you a reset link.
          </p>
        </div>
        {state === "success" ? (
          <div className="space-y-3 text-center text-sm text-white/80">
            <p>Email sent to <span className="font-semibold">{email.trim()}</span>.</p>
            <p>Please check your inbox and follow the link to finish resetting your password.</p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white" htmlFor="email">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={event => {
                  setEmail(event.target.value);
                  setErrors(prev => ({ ...prev, email: undefined, form: undefined }));
                }}
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && (
                <p className="text-sm text-red-500" role="alert">
                  {errors.email}
                </p>
              )}
            </div>
            {errors.form && (
              <p className="text-sm text-red-500" role="alert">
                {errors.form}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={state === "submitting"}>
              <Mail aria-hidden />
              Send me a reset link
            </Button>
          </form>
        )}
      </Card>
      <div className="w-full max-w-sm text-center text-sm text-white/70">
        Remembered it? <Link href="/login" className="underline">Back to login</Link>
      </div>
    </main>
  );
}
