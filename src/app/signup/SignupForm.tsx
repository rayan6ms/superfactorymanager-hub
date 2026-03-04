"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui/index";
import { Eye, EyeOff, Github, MailCheck } from "lucide-react";
import ResendVerificationButton from "@/components/auth/ResendVerificationButton";
import {
  USERNAME_HELP_TEXT,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsernameInput,
  type UsernameValidationCode,
} from "@/lib/usernames";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  form?: string;
};

type SignupFormProps = {
  next: string;
};

function mapUsernameError(code: UsernameValidationCode | "NAME_TAKEN"): string {
  switch (code) {
    case "NAME_REQUIRED":
      return "Name is required.";
    case "NAME_TOO_SHORT":
      return `Name must be at least ${USERNAME_MIN_LENGTH} characters.`;
    case "NAME_TOO_LONG":
      return `Name must be at most ${USERNAME_MAX_LENGTH} characters.`;
    case "NAME_INVALID":
      return "Use only letters, numbers, hyphens, or underscores. No spaces or symbols.";
    case "NAME_TAKEN":
      return "That name is already taken.";
    default:
      return "Please check the highlighted fields.";
  }
}

function mapSignupError(code: string): string {
  switch (code) {
    case "NAME_REQUIRED":
    case "NAME_TOO_SHORT":
    case "NAME_TOO_LONG":
    case "NAME_INVALID":
    case "NAME_TAKEN":
      return mapUsernameError(code as UsernameValidationCode | "NAME_TAKEN");
    case "EMAIL_REQUIRED":
      return "Email is required.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "PASSWORD_REQUIRED":
      return "Password is required.";
    case "PASSWORD_TOO_SHORT":
      return "Password must be at least 8 characters.";
    default:
      return "Please check the highlighted fields.";
  }
}

export default function SignupForm({ next }: SignupFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resendIdentifier, setResendIdentifier] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showResendVerification, setShowResendVerification] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: FieldErrors = {};
    const trimmedEmail = email.trim();
    const usernameValidation = validateUsernameInput(name);

    if (!usernameValidation.ok) {
      nextErrors.name = mapUsernameError(usernameValidation.code);
    }

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
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
    setSuccessMessage("");
    setShowResendVerification(false);
    setResendIdentifier("");

    const payload = {
      name: usernameValidation.ok ? usernameValidation.normalized : name.trim(),
      email: trimmedEmail,
      password,
    };

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (typeof data?.error === "string") {
        const code = data.error;
        if (code === "NAME_TAKEN") {
          setErrors({ name: mapUsernameError("NAME_TAKEN") });
        } else if (code === "Too many signup attempts. Please try again shortly.") {
          setErrors({ form: code });
        } else if (
          code === "NAME_REQUIRED" ||
          code === "NAME_TOO_SHORT" ||
          code === "NAME_TOO_LONG" ||
          code === "NAME_INVALID"
        ) {
          setErrors({ name: mapUsernameError(code) });
        } else {
          setErrors({ form: mapSignupError(code) });
        }
      } else if (data?.error && typeof data.error === "object" && !Array.isArray(data.error)) {
        const fieldErrors = data.error as Record<string, string[] | undefined>;
        setErrors({
          name: fieldErrors.name?.[0] ? mapSignupError(fieldErrors.name[0]) : undefined,
          email: fieldErrors.email?.[0] ? mapSignupError(fieldErrors.email[0]) : undefined,
          password: fieldErrors.password?.[0] ? mapSignupError(fieldErrors.password[0]) : undefined,
        });
      } else {
        setErrors({ form: "We couldn’t create your account. Please try again." });
      }
      setIsSubmitting(false);
      return;
    }

    if (data?.verificationEmailSent === false) {
      setSuccessMessage(
        `Your account was created, but we couldn’t send the verification email yet. Use resend to send it to ${trimmedEmail}.`,
      );
      setShowResendVerification(true);
      setResendIdentifier(trimmedEmail);
    } else {
      setSuccessMessage(`If your signup can be completed, a verification email has been sent to ${trimmedEmail}.`);
      setShowResendVerification(false);
      setResendIdentifier("");
    }

    setName("");
    if (data?.verificationEmailSent !== false) {
      setEmail("");
    }
    setPassword("");
    setIsSubmitting(false);
    router.refresh();
  }

  async function handleSocialSignup(provider: "google" | "github") {
    setIsSubmitting(true);
    setErrors({});
    setSuccessMessage("");
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
          <h1 className="text-2xl font-semibold text-white">Sign up</h1>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="name">
              Name
            </label>
            <Input
              id="name"
              placeholder="Name"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setErrors(prev => ({ ...prev, name: undefined, form: undefined }));
                setShowResendVerification(false);
                setResendIdentifier("");
              }}
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
            />
            <p className="mt-1 text-xs text-white/60">{USERNAME_HELP_TEXT}</p>
            {errors.name && (
              <p className="text-sm text-error" role="alert">
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="signup-email">
              Email
            </label>
            <Input
              id="signup-email"
              placeholder="Email"
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setErrors(prev => ({ ...prev, email: undefined, form: undefined }));
                setShowResendVerification(false);
                setResendIdentifier("");
              }}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && (
              <p className="text-sm text-error" role="alert">
                {errors.email}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="signup-password">
              Password
            </label>
            <Input
              id="signup-password"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setErrors(prev => ({ ...prev, password: undefined, form: undefined }));
                setShowResendVerification(false);
                setResendIdentifier("");
              }}
              autoComplete="new-password"
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
              <p className="text-sm text-error" role="alert">
                {errors.password}
              </p>
            )}
          </div>
          {errors.form && (
            <p className="text-sm text-error" role="alert">
              {errors.form}
            </p>
          )}
          {showResendVerification ? (
            <ResendVerificationButton identifier={resendIdentifier || email} />
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            Create account
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
              onClick={() => handleSocialSignup("google")}
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
              onClick={() => handleSocialSignup("github")}
              disabled={isSubmitting}
            >
              <Github className="h-5 w-5" aria-hidden />
              Continue with GitHub
            </Button>
          </div>
        </div>
        {successMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-left text-sm text-emerald-100">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{successMessage}</p>
          </div>
        )}
      </Card>
      <div className="w-full max-w-sm text-center text-sm text-white/70">
        Already have an account? <Link href="/login" className="underline">Log in</Link>
      </div>
    </main>
  );
}
