"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Badge, Card } from "@/components/ui";
import { CodeBox } from "@/components/CodeBox";
import type { ChangelogEntry } from "@/lib/changelog";

function formatDate(date: Date | null) {
  if (!date) return null;
  try {
    return format(date, "PPP");
  } catch {
    return null;
  }
}

/**
 * Remove a single pair of leading/trailing ``` fences from a code string.
 * Supports things like:
 * ```ts
 * ...code...
 * ```
 * or
 * ```
 * ...code...
 * ```
 */
function stripCodeFences(body?: string | null): string {
  if (!body) return "";

  const lines = body.split(/\r?\n/);
  let start = 0;
  let end = lines.length;

  if (lines[start]?.trim().startsWith("```")) {
    start += 1;
  }

  if (end > start && lines[end - 1]?.trim().startsWith("```")) {
    end -= 1;
  }

  return lines.slice(start, end).join("\n").trimEnd();
}

export default function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const [bodies, setBodies] = useState<Record<string, string>>({});

  const getBodyForEntry = (entry: ChangelogEntry) => {
    const key = String(entry.id);
    if (Object.prototype.hasOwnProperty.call(bodies, key)) {
      return bodies[key];
    }
    return stripCodeFences((entry as any).body);
  };

  const handleBodyChange = (entryId: string | number, next: string) => {
    const key = String(entryId);
    setBodies(prev => ({
      ...prev,
      [key]: next,
    }));
  };

  if (!entries.length) {
    return (
      <Card className="p-6 text-center text-white/70">
        No changelog entries available yet.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map(entry => {
        const key = String(entry.id);
        const codeValue = getBodyForEntry(entry);

        return (
          <Card key={key} className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white">
                  {entry.title || entry.versionCode}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                    {entry.versionCode}
                  </span>
                  {formatDate(entry.publishedAt) && (
                    <span>Published {formatDate(entry.publishedAt)}</span>
                  )}
                </div>
              </div>
              {entry.isLatest && (
                <Badge className="border border-emerald-400/50 bg-emerald-500/20 text-emerald-100">
                  Latest
                </Badge>
              )}
            </div>

            <CodeBox
              value={codeValue}
              onChange={next => handleBodyChange(entry.id, next)}
            />
          </Card>
        );
      })}
    </div>
  );
}
