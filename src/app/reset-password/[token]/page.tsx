"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Input } from "@/components/ui";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

const passwordSchema = /^(?=.{8,}).*$/;

type LoadState = "loading" | "ready" | "invalid" | "submitting" | "success";

type Errors = {
  password?: string;
  form?: string;
};

export default function ResetPasswordConfirmPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [state, setState] = useState<LoadState>("loading");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    const token = params.token;
    if (!token) {
      setState("invalid");
      return;
    }

    let active = true;
    setState("loading");

    fetch(`/api/auth/password/reset?token=${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) {
          throw new Error("Invalid token");
        }
        const data = await res.json();
        if (active) {
          setEmail(data.email);
          setState("ready");
        }
      })
      .catch(err => {
        console.error("Failed to validate reset token", err);
        if (active) {
          setState("invalid");
        }
      });

    return () => {
      active = false;
    };
  }, [params.token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state !== "ready" && state !== "submitting") return;

    const nextErrors: Errors = {};
    if (!passwordSchema.test(password)) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setState("submitting");

    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });

      if (!res.ok) {
        throw new Error("Reset failed");
      }

      setState("success");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error) {
      console.error("Password reset failed", error);
      setErrors({ form: "We couldn't reset your password. Try again or request a new link." });
      setState("ready");
    }
  }

  return (
    <main className="flex flex-col items-center justify-start gap-6 px-4 pb-12 pt-16">
      <Card className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-white">Reset password</h1>
          <p className="text-sm text-white/70">
            {state === "success"
              ? "Your password has been updated. Redirecting to login..."
              : "Choose a new password to finish resetting your account."}
          </p>
        </div>
        {state === "loading" && <p className="text-center text-sm text-white/70">Checking your reset link...</p>}
        {state === "invalid" && (
          <div className="space-y-3 text-center text-sm text-white/80">
            <p>This reset link is invalid or has expired.</p>
            <p>
              <Link href="/reset-password" className="underline">
                Request a new password reset
              </Link>
            </p>
          </div>
        )}
        {(state === "ready" || state === "submitting") && (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                value={email}
                readOnly
                leftIcon={<Mail aria-hidden />}
                className="cursor-not-allowed text-white/70"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white" htmlFor="password">
                New password
              </label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={password}
                onChange={event => {
                  setPassword(event.target.value);
                  setErrors(prev => ({ ...prev, password: undefined, form: undefined }));
                }}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                leftIcon={<Lock aria-hidden />}
                rightInteractive
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="rounded-full p-1 text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface-2)"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </button>
                }
              />
              {errors.password && (
                <p className="text-sm text-red-500" role="alert">
                  {errors.password}
                </p>
              )}
            </div>
            {errors.form && (
              <p className="text-sm text-red-500" role="alert">
                {errors.form}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={state === "submitting"}>
              Reset password
            </Button>
          </form>
        )}
        {state === "success" && (
          <div className="space-y-3 text-center text-sm text-white/80">
            <p>Your password has been reset.</p>
            <p>You&apos;ll be redirected to the login page shortly.</p>
          </div>
        )}
      </Card>
    </main>
  );
}
