"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Loader2, Send, WrapText, AlignLeft } from "lucide-react";
import { CodeBox } from "@/components/CodeBox";
import { Button, Card, Input } from "@/components/ui";

type CodeImprovementFormProps = {
  slug: string;
  baseCommitId?: string | null;
  initialCode: string;
};

export default function CodeImprovementForm({ slug, baseCommitId, initialCode }: CodeImprovementFormProps) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [message, setMessage] = useState("");
  const [wrapLines, setWrapLines] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setResult("idle");
    if (!message.trim()) {
      setError("Explain what you changed so the author can review it quickly.");
      return;
    }
    if (!code.trim()) {
      setError("Paste the code you want to propose.");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch(`/api/posts/${slug}/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, message, baseCommitId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "We couldn't send your contribution just yet.");
        setResult("error");
        return;
      }
      setResult("success");
      setMessage("");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit your contribution.";
      setError(message);
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-white">Suggest an improvement</h2>
        <p className="text-sm text-white/70">
          Paste your updated code and describe what changed. The author will get a notification to review your pull request.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs font-semibold text-white/70">
        <button
          type="button"
          onClick={() => setWrapLines(true)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition",
            wrapLines ? "bg-brand-500 text-white" : "hover:text-white",
          )}
        >
          <WrapText className="h-3.5 w-3.5" /> Wrap lines
        </button>
        <button
          type="button"
          onClick={() => setWrapLines(false)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition",
            !wrapLines ? "bg-brand-500 text-white" : "hover:text-white",
          )}
        >
          <AlignLeft className="h-3.5 w-3.5" /> Horizontal scroll
        </button>
      </div>

      <CodeBox value={code} onChange={setCode} wrapLines={wrapLines} />

      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium text-white/80">
          Review message
        </label>
        <Input
          id="message"
          value={message}
          onChange={event => setMessage(event.target.value)}
          placeholder="Describe the fixes, improvements, or reasoning"
          maxLength={280}
        />
        <p className="text-xs text-white/50">Give context so the author knows what to test. Minimum 10 characters.</p>
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {result === "success" && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Your contribution was sent! The author will be notified shortly.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="lg" className="w-full sm:w-auto" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {submitting ? "Sending..." : "Send improvement"}
        </Button>
      </div>
    </Card>
  );
}
