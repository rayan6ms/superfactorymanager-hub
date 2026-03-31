"use client";

import { useEffect } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="space-y-6 py-8">
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold text-white">Some live content is temporarily unavailable</h1>
        <p className="text-white/70">
          The site is still up, but a server-side dependency failed while loading this page. Try again in a moment or return to a public page.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-white/35 hover:text-white"
          >
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex rounded-xl border border-brand-400/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/25"
          >
            Return home
          </Link>
        </div>
      </Card>
    </main>
  );
}
