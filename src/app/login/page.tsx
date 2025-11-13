"use client";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input } from "@/components/ui/index";
import { Eye, EyeOff } from "lucide-react";

type FieldErrors = {
  email?: string;
  password?: string;
  form?: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: FieldErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const sanitizedEmail = email.trim();

    const res = await signIn("credentials", { redirect: false, email: sanitizedEmail, password, callbackUrl: next });

    if (res?.error) {
      const message: FieldErrors = {};
      switch (res.error) {
        case "EMAIL_REQUIRED":
        case "INVALID_EMAIL":
          message.email = res.error === "EMAIL_REQUIRED" ? "Email is required." : "Enter a valid email address.";
          break;
        case "EMAIL_NOT_FOUND":
          message.email = "Email not registered.";
          break;
        case "PASSWORD_REQUIRED":
          message.password = "Password is required.";
          break;
        case "PASSWORD_TOO_SHORT":
          message.password = "Password must be at least 8 characters.";
          break;
        case "WRONG_PASSWORD":
          message.password = "Incorrect password.";
          break;
        default:
          message.form = "Unable to sign you in. Please try again.";
      }
      setErrors(message);
      setIsSubmitting(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-start gap-6 px-4 pb-12 pt-16">
      <Card className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">Login</h1>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              placeholder="Email"
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
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
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setErrors(prev => ({ ...prev, password: undefined, form: undefined }));
              }}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              rightInteractive
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="rounded-full p-1 text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]"
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
            <div className="text-right text-sm">
              <Link href="/reset-password" className="text-white/70 underline-offset-4 transition hover:text-white hover:underline">
                Forgot your password?
              </Link>
            </div>
          </div>
          {errors.form && (
            <p className="text-sm text-red-500" role="alert">
              {errors.form}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            Login
          </Button>
        </form>
      </Card>
      <div className="w-full max-w-sm text-center text-sm text-white/70">
        New here? <Link href="/signup" className="underline">Create an account</Link>
      </div>
    </main>
  );
}
