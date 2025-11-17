"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { Loader2, RefreshCw, Upload, ShieldCheck, UserRoundPen } from "lucide-react";
import {
  USERNAME_HELP_TEXT,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsernameInput,
  type UsernameValidationCode,
} from "@/lib/usernames";

type ProfileSettingsProps = {
  initialUser: {
    name: string | null;
    email: string;
    image: string | null;
  };
};

type Status = "idle" | "loading" | "success" | "error";

type ResetStatus = "idle" | "loading" | "sent" | "error";

type FormErrors = {
  name?: string;
  image?: string;
  form?: string;
};

export default function ProfileSettings({ initialUser }: ProfileSettingsProps) {
  const [name, setName] = useState(initialUser.name ?? "");
  const [image, setImage] = useState(initialUser.image ?? "");
  const [preview, setPreview] = useState(initialUser.image ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [resetStatus, setResetStatus] = useState<ResetStatus>("idle");
  const [errors, setErrors] = useState<FormErrors>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const isLoading = status === "loading";
  const resetLoading = resetStatus === "loading";

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImage(reader.result);
        setPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function usernameErrorMessage(code: UsernameValidationCode | "NAME_TAKEN") {
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
        return "Please check this field.";
    }
  }

  async function submitProfile(regenerateAvatar = false) {
    const validation = validateUsernameInput(name);
    if (!validation.ok) {
      setErrors({ name: usernameErrorMessage(validation.code) });
      return;
    }

    const normalizedName = validation.normalized;

    setErrors({});
    setStatus("loading");

    const payload: Record<string, unknown> = { name: normalizedName };

    if (regenerateAvatar) {
      payload.regenerateAvatar = true;
    } else {
      payload.image = image;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorMessage = typeof data?.error === "string" ? data.error : "We couldn’t update your profile.";
        if (
          errorMessage === "NAME_REQUIRED" ||
          errorMessage === "NAME_TOO_SHORT" ||
          errorMessage === "NAME_TOO_LONG" ||
          errorMessage === "NAME_INVALID" ||
          errorMessage === "NAME_TAKEN"
        ) {
          const code = errorMessage as UsernameValidationCode | "NAME_TAKEN";
          setErrors({ name: usernameErrorMessage(code) });
        } else if (errorMessage === "IMAGE_URL_TOO_LONG" || errorMessage === "INVALID_IMAGE_URL") {
          setErrors({ image: "Please provide a valid image URL." });
        } else {
          setErrors({ form: errorMessage });
        }
        setStatus("error");
        return;
      }

      const data = (await res.json()) as { user: { name: string | null; image: string | null } };
      setName(data.user.name ?? "");
      setImage(data.user.image ?? "");
      setPreview(data.user.image ?? "");
      setStatus("success");
      router.refresh();
      setTimeout(() => setStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to update profile", error);
      setErrors({ form: "We couldn’t update your profile. Please try again." });
      setStatus("error");
    }
  }

  async function handleResetPassword() {
    setResetStatus("loading");
    try {
      const res = await fetch("/api/auth/password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: initialUser.email }),
      });
      if (!res.ok) throw new Error("Request failed");
      setResetStatus("sent");
      setTimeout(() => setResetStatus("idle"), 3000);
    } catch (error) {
      console.error("Failed to request password reset", error);
      setResetStatus("error");
    }
  }

  return (
    <Card className="space-y-6 p-6">
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-white/5">
          {preview ? (
            <Image src={preview} alt={name || "Profile avatar"} fill sizes="96px" className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white/70">
              {(name || initialUser.email).charAt(0).toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-1 right-1 inline-flex items-center justify-center rounded-full border border-white/30 bg-black/60 p-1 text-white transition hover:border-white/60 hover:bg-black/80"
          >
            <UserRoundPen className="h-4 w-4" aria-hidden />
            <span className="sr-only">Change avatar image</span>
          </button>
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <label className="text-sm font-semibold text-white">Username</label>
            <Input
              value={name}
              onChange={event => {
                setName(event.target.value);
                setErrors(prev => ({ ...prev, name: undefined, form: undefined }));
              }}
              placeholder="Your name"
              className="mt-1"
              aria-invalid={Boolean(errors.name)}
            />
            <p className="mt-1 text-xs text-white/60">{USERNAME_HELP_TEXT}</p>
            {errors.name && <p className="mt-1 text-sm text-error">{errors.name}</p>}
          </div>
          <div>
            <label className="text-sm font-semibold text-white">Avatar image URL</label>
            <Input
              value={image}
              onChange={event => {
                setImage(event.target.value);
                setPreview(event.target.value);
                setErrors(prev => ({ ...prev, image: undefined, form: undefined }));
              }}
              placeholder="https://example.com/avatar.png"
              className="mt-1"
              aria-invalid={Boolean(errors.image)}
            />
            {errors.image && <p className="mt-1 text-sm text-error">{errors.image}</p>}
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/70">
              <label className="inline-flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" aria-hidden /> Upload image
                </Button>
              </label>
              <Button type="button" size="sm" variant="ghost" className="gap-2" onClick={() => submitProfile(true)} disabled={isLoading}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Use letter avatar
              </Button>
            </div>
          </div>
        </div>
      </div>
      {errors.form && <p className="text-sm text-error">{errors.form}</p>}
      {status === "success" && <p className="text-sm text-emerald-300">Profile updated successfully.</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button onClick={() => submitProfile(false)} disabled={isLoading} className="gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save changes
        </Button>
        <div className="flex items-center gap-3 text-sm text-white/70">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleResetPassword}
            disabled={resetLoading}
          >
            {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            Send email to reset password
          </Button>
          {resetStatus === "sent" && <span className="text-emerald-300">Email sent!</span>}
          {resetStatus === "error" && <span className="text-error">Couldn’t send email.</span>}
        </div>
      </div>
    </Card>
  );
}
