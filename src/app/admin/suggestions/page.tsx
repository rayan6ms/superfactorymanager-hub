import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Card, Badge } from "@/components/ui";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { Inbox, Mail, User } from "lucide-react";

async function loadSuggestions() {
  return db.suggestion.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });
}

export default async function AdminSuggestionsPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const suggestions = await loadSuggestions();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Admin</p>
        <h1 className="text-3xl font-semibold text-white">User suggestions</h1>
        <p className="text-sm text-white/70">
          Messages submitted through the contact page appear here for moderators to review.
        </p>
      </div>

      <Card className="divide-y divide-white/10 p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Latest messages</h2>
            <p className="text-sm text-white/60">Newest submissions appear first.</p>
          </div>
          <Badge className="border border-white/20 text-white/80">
            {suggestions.length} item{suggestions.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-white/60">
            <Inbox className="h-8 w-8" aria-hidden />
            <p>No suggestions yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {suggestions.map(suggestion => (
              <li key={suggestion.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                    <User className="h-4 w-4" />
                    {suggestion.author?.name || suggestion.contactName || suggestion.author?.email || "Anonymous"}
                  </div>
                  {suggestion.contactEmail && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
                      <Mail className="h-3.5 w-3.5" />
                      {suggestion.contactEmail}
                    </span>
                  )}
                  <span className="text-xs text-white/60">
                    {formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-white/90">{suggestion.message}</pre>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
