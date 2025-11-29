import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-center">
      <Card className="space-y-4 bg-white/5 p-8 text-white shadow-lg shadow-black/30">
        <p className="text-sm uppercase tracking-[0.3em] text-white/50">404</p>
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-white/70">
          We couldn&apos;t find the page you&apos;re looking for. It may have been moved or deleted.
        </p>
        <div className="flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to home
          </Link>
        </div>
      </Card>
    </div>
  );
}
