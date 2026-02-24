"use client";

import { useState } from "react";

const ORDER_OPTIONS = [
  { label: "Best match", value: "best" },
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Recently updated", value: "recently-updated" },
  { label: "Least recently updated", value: "least-recently-updated" },
  { label: "Name (A-Z)", value: "name-asc" },
  { label: "Name (Z-A)", value: "name-desc" },
];

type Props = {
  action?: string;
  hiddenParams?: Record<string, string>;
  initialQuery?: string;
  initialOrder?: string;
  initialUsername?: string;
};

export default function BuildsFilterBar({
  action = "/builds",
  hiddenParams,
  initialQuery = "",
  initialOrder = "best",
  initialUsername = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [order, setOrder] = useState(initialOrder || "best");
  const [username, setUsername] = useState(initialUsername);

  return (
    <form method="get" action={action} className="space-y-4 rounded-2xl border border-white/10 bg-(--surface)/80 p-5 shadow-soft">
      {hiddenParams
        ? Object.entries(hiddenParams).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)
        : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto] lg:items-end">
        <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
          Search
          <input
            id="builds-search"
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search builds"
            className="mt-1 w-full rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-base text-white placeholder-white/50 focus:border-brand-400 focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
          Order by
          <select
            name="order"
            className="mt-1 w-full rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-white"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          >
            {ORDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
          Author
          <input
            name="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Filter by username"
            className="mt-1 w-full rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-base text-white placeholder-white/50 focus:border-brand-400 focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          Search
        </button>
      </div>
    </form>
  );
}
