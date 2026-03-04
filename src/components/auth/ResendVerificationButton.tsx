"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type ResendVerificationButtonProps = {
  identifier: string;
  className?: string;
};

export default function ResendVerificationButton({
  identifier,
  className,
}: ResendVerificationButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmedIdentifier = identifier.trim();

  async function handleClick() {
    if (!trimmedIdentifier) {
      setMessage("Enter your email or username first.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmedIdentifier }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.error === "EMAIL_SEND_FAILED") {
          setMessage("We couldn't send a new verification email right now. Try again in a moment.");
        } else if (typeof data?.error === "string") {
          setMessage(data.error);
        } else {
          setMessage("We couldn't send a new verification email right now. Try again in a moment.");
        }
        return;
      }

      setMessage("If that account still needs verification, a new email is on the way.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center"
        onClick={handleClick}
        disabled={isSubmitting || !trimmedIdentifier}
      >
        {isSubmitting ? "Sending..." : "Resend verification email"}
      </Button>
      {message ? <p className="mt-2 text-xs text-white/75">{message}</p> : null}
    </div>
  );
}
