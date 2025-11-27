"use client";

import { useState } from "react";
import { Card, Button, Input } from "@/components/ui";
import { MessageSquare, Send, User } from "lucide-react";

const MIN_MESSAGE = 10;

export default function ContactPage() {
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    if (message.trim().length < MIN_MESSAGE) {
      setError(`Please provide at least ${MIN_MESSAGE} characters so the moderators can review your note.`);
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          contactName: name.trim() || undefined,
          contactEmail: email.trim() || undefined,
        }),
      });

      if (!res.ok) {
        setError("We couldn't send your suggestion. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
      setMessage("");
      setName("");
      setEmail("");
    } catch (err) {
      console.error("Failed to submit suggestion", err);
      setError("Unexpected error submitting your suggestion.");
      setStatus("error");
    }
  }

  return (
    <main className="flex flex-col items-center gap-8 px-4 pb-16 pt-12">
      <div className="w-full max-w-4xl space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Support</p>
        <h1 className="text-3xl font-semibold text-white">Contact the team</h1>
        <p className="text-sm text-white/70">
          Share feedback, questions, or issues. Moderator suggestions will appear in the admin dashboard for review.
        </p>
      </div>

      <Card className="w-full max-w-3xl space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-white" htmlFor="name">
              <User className="h-4 w-4" />
              Name (optional)
            </label>
            <Input
              id="name"
              placeholder="How should we address you?"
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-white" htmlFor="email">
              <MessageSquare className="h-4 w-4" />
              Contact email (optional)
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-white" htmlFor="message">
              <Send className="h-4 w-4" />
              Suggestion for moderators
            </label>
            <textarea
              id="message"
              className="min-h-[180px] w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white placeholder:text-white/50 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
              placeholder="Tell us what you'd like to see or any issues you're running into."
              value={message}
              onChange={event => {
                setMessage(event.target.value);
                setError(null);
              }}
              required
            />
            <p className="text-xs text-white/50">This message will be routed to moderators on the suggestions page.</p>
            {error && <p className="text-sm text-error">{error}</p>}
          </div>

          <Button type="submit" className="w-full justify-center" disabled={status === "submitting"}>
            <Send className="h-4 w-4" />
            {status === "submitting" ? "Sending..." : status === "success" ? "Sent" : "Send suggestion"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
