"use client";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input } from "@/components/ui/index";
import { Eye, EyeOff, Github, MailWarning } from "lucide-react";

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
  const [infoMessage, setInfoMessage] = useState("");
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: FieldErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Email or username is required.";
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
    setInfoMessage("");

    const sanitizedIdentifier = email.trim();

    const res = await signIn("credentials", {
      redirect: false,
      identifier: sanitizedIdentifier,
      password,
      callbackUrl: next,
    });

    if (res?.error) {
      const message: FieldErrors = {};
      switch (res.error) {
        case "IDENTIFIER_REQUIRED":
        case "EMAIL_REQUIRED":
          message.email = "Email or username is required.";
          break;
        case "EMAIL_NOT_FOUND":
          message.email = "Account not found.";
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
        case "EMAIL_NOT_VERIFIED":
          message.form = undefined;
          setInfoMessage("Please verify your email address using the link we sent before logging in.");
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

  async function handleSocialLogin(provider: "google" | "github") {
    setIsSubmitting(true);
    setErrors({});
    setInfoMessage("");
    try {
      await signIn(provider, { callbackUrl: next });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-start gap-6 px-4 pb-12 pt-16">
      <Card className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">Login</h1>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="identifier">
              Email or username
            </label>
            <Input
              id="identifier"
              placeholder="Email or username"
              type="text"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setErrors(prev => ({ ...prev, email: undefined, form: undefined }));
              }}
              autoComplete="username"
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
        <div className="space-y-3 text-left">
          <div className="relative flex items-center">
            <div className="h-px flex-1 bg-white/15" />
            <span className="px-3 text-xs uppercase tracking-wide text-white/50">Or continue with</span>
            <div className="h-px flex-1 bg-white/15" />
          </div>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => handleSocialLogin("google")}
              disabled={isSubmitting}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#4285F4] text-xs font-bold text-white">
                G
              </span>
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => handleSocialLogin("github")}
              disabled={isSubmitting}
            >
              <Github className="h-5 w-5" aria-hidden />
              Continue with GitHub
            </Button>
          </div>
        </div>
        {infoMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-100">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{infoMessage}</p>
          </div>
        )}
      </Card>
      <div className="w-full max-w-sm text-center text-sm text-white/70">
        New here? <Link href="/signup" className="underline">Create an account</Link>
      </div>
    </main>
  );
}
