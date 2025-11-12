"use client";
import { signIn } from "next-auth/react";
import Button from "@/components/ui/Button";

export default function LoginModal({ open, onClose, message = "You need to log in to continue.", }: { open: boolean; onClose: () => void; message?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="surface w-full max-w-sm space-y-3 p-4">
        <h2 className="text-lg font-semibold">Login required</h2>
        <p className="text-sm text-white/80">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() =>
              signIn(undefined, {
                callbackUrl: typeof window !== "undefined" ? window.location.href : "/",
              })
            }
          >
            Log in
          </Button>
        </div>
      </div>
    </div>
  );
}
