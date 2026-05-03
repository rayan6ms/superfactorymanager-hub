"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import clsx from "clsx";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button, Input, Card } from "@/components/ui";
import { Loader2, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import {
  USERNAME_HELP_TEXT,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsernameInput,
  type UsernameValidationCode,
} from "@/lib/usernames";
import { supportedAvatarHostLabels } from "@/lib/avatar-hosts";

const BIO_MAX_LENGTH = 300;
const MAX_IMAGE_VALUE_LENGTH = 4096;

type ProfileSettingsProps = {
  initialUser: {
    name: string | null;
    email: string;
    image: string | null;
    bio: string | null;
    emailNotificationsEnabled: boolean;
    emailNotifyPost: boolean;
    emailNotifySystem: boolean;
    emailNotifyReport: boolean;
  };
};

type Status = "idle" | "loading" | "success" | "error";
type ResetStatus = "idle" | "loading" | "sent" | "error";

type FormErrors = {
  name?: string;
  image?: string;
  bio?: string;
  form?: string;
};

export default function ProfileSettings({ initialUser }: ProfileSettingsProps) {
  const [name, setName] = useState(initialUser.name ?? "");
  const [image, setImage] = useState(initialUser.image ?? "");
  const [preview, setPreview] = useState(initialUser.image ?? "");
  const [bio, setBio] = useState(initialUser.bio ?? "");
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(
    initialUser.emailNotificationsEnabled,
  );
  const [emailNotifyPost, setEmailNotifyPost] = useState(initialUser.emailNotifyPost);
  const [emailNotifySystem, setEmailNotifySystem] = useState(initialUser.emailNotifySystem);
  const [emailNotifyReport, setEmailNotifyReport] = useState(initialUser.emailNotifyReport);
  const [status, setStatus] = useState<Status>("idle");
  const [resetStatus, setResetStatus] = useState<ResetStatus>("idle");
  const [avatarUploadStatus, setAvatarUploadStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FormErrors>({});
  const statusResetTimeoutRef = useRef<number | null>(null);
  const resetBlinkTimeoutRef = useRef<number | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { update: updateSession } = useSession();

  const [highlightReset, setHighlightReset] = useState(false);

  const isLoading = status === "loading";
  const resetLoading = resetStatus === "loading";
  const avatarUploadLoading = avatarUploadStatus === "loading";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const fromNotifications =
      params.get("from") === "notifications" ||
      params.get("source") === "notifications" ||
      params.has("fromNotifications") ||
      document.referrer.includes("/notifications");

    if (fromNotifications) {
      setHighlightReset(true);
      if (resetBlinkTimeoutRef.current) {
        window.clearTimeout(resetBlinkTimeoutRef.current);
      }
      resetBlinkTimeoutRef.current = window.setTimeout(() => setHighlightReset(false), 8000);
    }

    return () => {
      if (resetBlinkTimeoutRef.current) {
        window.clearTimeout(resetBlinkTimeoutRef.current);
      }
    };
  }, []);

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
    const trimmedImage = image.trim();

    if (!regenerateAvatar) {
      if (/^data:image\//i.test(trimmedImage) || /^blob:/i.test(trimmedImage)) {
        setErrors({ image: "Upload the image file first, then save your profile." });
        return;
      }

      if (trimmedImage.length > MAX_IMAGE_VALUE_LENGTH) {
        setErrors({ image: "Image URL is too long. Upload the file instead." });
        return;
      }
    }

    setErrors({});
    setStatus("loading");

    const payload: Record<string, unknown> = { name: normalizedName };
    const trimmedBio = bio.trim();

    if (trimmedBio) {
      payload.bio = trimmedBio;
    }
    payload.emailNotificationsEnabled = emailNotificationsEnabled;
    payload.emailNotifyPost = emailNotifyPost;
    payload.emailNotifySystem = emailNotifySystem;
    payload.emailNotifyReport = emailNotifyReport;

    if (regenerateAvatar) {
      payload.regenerateAvatar = true;
    } else {
      payload.image = trimmedImage;
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
        const errorMessage =
          typeof data?.error === "string" ? data.error : "We couldn’t update your profile.";

        if (
          errorMessage === "NAME_REQUIRED" ||
          errorMessage === "NAME_TOO_SHORT" ||
          errorMessage === "NAME_TOO_LONG" ||
          errorMessage === "NAME_INVALID" ||
          errorMessage === "NAME_TAKEN"
        ) {
          const code = errorMessage as UsernameValidationCode | "NAME_TAKEN";
          setErrors({ name: usernameErrorMessage(code) });
        } else if (errorMessage === "BIO_TOO_LONG") {
          setErrors({ bio: `Bio must be ${BIO_MAX_LENGTH} characters or fewer.` });
        } else if (errorMessage === "IMAGE_URL_TOO_LONG") {
          setErrors({
            image: "Image URL is too long. Try a shorter URL or upload a smaller image.",
          });
        } else if (errorMessage === "INVALID_IMAGE_URL") {
          setErrors({
            image: "Please provide a valid HTTPS image URL.",
          });
        } else if (errorMessage === "UNSUPPORTED_IMAGE_HOST") {
          setErrors({
            image: `Supported avatar hosts: ${supportedAvatarHostLabels.join(", ")}.`,
          });
        } else {
          console.error("Unexpected profile update error", errorMessage);
          setErrors({ form: "We couldn’t update your profile. Please try again." });
        }
        setStatus("error");
        return;
      }

      const data = (await res.json()) as {
        user: {
          name: string | null;
          image: string | null;
          emailNotificationsEnabled: boolean;
          emailNotifyPost: boolean;
          emailNotifySystem: boolean;
          emailNotifyReport: boolean;
        };
      };
      setName(data.user.name ?? "");
      setImage(data.user.image ?? "");
      setPreview(data.user.image ?? "");
      setEmailNotificationsEnabled(data.user.emailNotificationsEnabled);
      setEmailNotifyPost(data.user.emailNotifyPost);
      setEmailNotifySystem(data.user.emailNotifySystem);
      setEmailNotifyReport(data.user.emailNotifyReport);
      await updateSession({
        user: {
          name: data.user.name,
          image: data.user.image,
        },
      });
      setStatus("success");
      setAvatarUploadStatus("idle");
      router.refresh();

      if (statusResetTimeoutRef.current !== null) {
        window.clearTimeout(statusResetTimeoutRef.current);
      }
      statusResetTimeoutRef.current = window.setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Failed to update profile", error);
      setErrors({ form: "We couldn’t update your profile. Please try again." });
      setStatus("error");
    }
  }

  async function handleResetPassword() {
    if (resetBlinkTimeoutRef.current) {
      window.clearTimeout(resetBlinkTimeoutRef.current);
    }
    setHighlightReset(false);
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

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarUploadStatus("loading");
    setErrors(prev => ({ ...prev, image: undefined, form: undefined }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage =
          typeof data?.error === "string" ? data.error : "We couldn’t upload your avatar.";
        setErrors({ image: errorMessage });
        setAvatarUploadStatus("error");
        return;
      }

      const nextUrl = typeof data?.url === "string" ? data.url : "";
      if (!nextUrl) {
        setErrors({ image: "We couldn’t upload your avatar." });
        setAvatarUploadStatus("error");
        return;
      }

      setImage(nextUrl);
      setPreview(nextUrl);
      setAvatarUploadStatus("success");
    } catch (error) {
      console.error("Failed to upload avatar", error);
      setErrors({ image: "We couldn’t upload your avatar. Please try again." });
      setAvatarUploadStatus("error");
    }
  }

  const avatarImageControls = (
    <div>
      <label className="text-sm font-semibold text-white">Avatar image URL</label>
      <Input
        value={image}
        onChange={event => {
          setImage(event.target.value);
          setPreview(event.target.value);
          setAvatarUploadStatus("idle");
          setErrors(prev => ({ ...prev, image: undefined, form: undefined }));
        }}
        placeholder="https://avatars.githubusercontent.com/u/123456"
        className="mt-1"
        aria-invalid={Boolean(errors.image)}
      />
      <p className="mt-1 text-xs text-white/60">
        Supported hosts: {supportedAvatarHostLabels.join(", ")}.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => avatarFileInputRef.current?.click()}
          disabled={isLoading || avatarUploadLoading}
        >
          {avatarUploadLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Upload image
        </Button>
        {avatarUploadStatus === "success" && (
          <span className="text-xs text-emerald-300">Upload complete. Save changes to apply it.</span>
        )}
      </div>
      {errors.image && <p className="mt-1 text-sm text-error">{errors.image}</p>}
      <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/70">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-2"
          onClick={() => submitProfile(true)}
          disabled={isLoading || avatarUploadLoading}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Use letter avatar
        </Button>
      </div>
    </div>
  );

  const bioControls = (
    <div>
      <label className="text-sm font-semibold text-white">Bio</label>
      <textarea
        value={bio}
        onChange={event => {
          const nextBio = event.target.value.slice(0, BIO_MAX_LENGTH);
          setBio(nextBio);
          setErrors(prev => ({ ...prev, bio: undefined, form: undefined }));
        }}
        placeholder="Tell the community about your play style, favorite builds, or goals."
        rows={4}
        className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/40"
        aria-invalid={Boolean(errors.bio)}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-white/60">
        <span>
          {bio.length} / {BIO_MAX_LENGTH} characters
        </span>
        <span className="italic text-white/50">Shown on your posts and profile</span>
      </div>
      {errors.bio && <p className="mt-1 text-sm text-error">{errors.bio}</p>}
    </div>
  );

  const emailNotificationControls = (
    <div className="space-y-4 rounded-xl border border-white/15 bg-white/5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Email notifications</h3>
        <p className="mt-1 text-xs text-white/60">
          Choose which unread notifications should also be delivered to your verified email.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <span className="text-sm font-medium text-white">Receive notifications via email?</span>
        <input
          type="checkbox"
          checked={emailNotificationsEnabled}
          onChange={event => setEmailNotificationsEnabled(event.target.checked)}
          className="h-4 w-4 rounded border-white/30 bg-transparent text-brand-500 focus:ring-brand-400/60"
        />
      </label>

      <div
        className={clsx(
          "space-y-2 rounded-lg border border-white/10 bg-black/20 p-3",
          !emailNotificationsEnabled && "opacity-60",
        )}
      >
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-white/85">Post activity</span>
          <input
            type="checkbox"
            checked={emailNotifyPost}
            onChange={event => setEmailNotifyPost(event.target.checked)}
            disabled={!emailNotificationsEnabled}
            className="h-4 w-4 rounded border-white/30 bg-transparent text-brand-500 focus:ring-brand-400/60 disabled:cursor-not-allowed"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-white/85">System updates</span>
          <input
            type="checkbox"
            checked={emailNotifySystem}
            onChange={event => setEmailNotifySystem(event.target.checked)}
            disabled={!emailNotificationsEnabled}
            className="h-4 w-4 rounded border-white/30 bg-transparent text-brand-500 focus:ring-brand-400/60 disabled:cursor-not-allowed"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-white/85">Report updates</span>
          <input
            type="checkbox"
            checked={emailNotifyReport}
            onChange={event => setEmailNotifyReport(event.target.checked)}
            disabled={!emailNotificationsEnabled}
            className="h-4 w-4 rounded border-white/30 bg-transparent text-brand-500 focus:ring-brand-400/60 disabled:cursor-not-allowed"
          />
        </label>
      </div>
    </div>
  );

  useEffect(() => {
    return () => {
      if (statusResetTimeoutRef.current !== null) {
        window.clearTimeout(statusResetTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Card className="space-y-6 p-6">
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAvatarFileChange}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={() => avatarFileInputRef.current?.click()}
          disabled={isLoading || avatarUploadLoading}
          className="group relative h-24 w-24 self-center overflow-hidden rounded-full border border-white/15 bg-white/5 text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0b14] disabled:cursor-not-allowed disabled:opacity-70 sm:self-auto"
          aria-label="Upload profile picture"
          title="Upload profile picture"
        >
          {preview ? (
            <Image
              src={preview}
              alt={name || "Profile avatar"}
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white/70">
              {(name || initialUser.email).charAt(0).toUpperCase()}
            </div>
          )}
          <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/45 group-focus-visible:bg-black/45" />
          <span className="absolute inset-0 inline-flex items-center justify-center drop-shadow-lg">
            {avatarUploadLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Pencil className="h-4 w-4" aria-hidden />
            )}
          </span>
        </button>

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
              maxLength={USERNAME_MAX_LENGTH}
            />
            <p className="mt-1 text-xs text-white/60">{USERNAME_HELP_TEXT}</p>
            {errors.name && <p className="mt-1 text-sm text-error">{errors.name}</p>}
          </div>

          <div className="hidden sm:block">{bioControls}</div>
          <div className="hidden sm:block">{avatarImageControls}</div>
        </div>
      </div>

      <div className="space-y-4 sm:hidden">
        {bioControls}
        {avatarImageControls}
      </div>

      {emailNotificationControls}

      {errors.form && <p className="text-sm text-error">{errors.form}</p>}
      {status === "success" && <p className="text-sm text-emerald-300">Profile updated successfully.</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-sm text-white/70">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={clsx(
              "gap-2 transition",
              highlightReset && "animate-pulse ring-2 ring-brand-300 ring-offset-2 ring-offset-[#0f0b14]",
            )}
            onClick={handleResetPassword}
            disabled={resetLoading}
          >
            {resetLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            Send email to reset password
          </Button>
          {resetStatus === "sent" && <span className="text-emerald-300">Email sent!</span>}
          {resetStatus === "error" && <span className="text-error">Couldn’t send email.</span>}
        </div>

        <Button onClick={() => submitProfile(false)} disabled={isLoading || avatarUploadLoading} className="gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save changes
        </Button>
      </div>
    </Card>
  );
}
