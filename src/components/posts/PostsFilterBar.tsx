"use client";
import { useMemo, useState } from "react";

const ORDER_OPTIONS = [
  { label: "Best match", value: "best" },
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Highest rating", value: "highest-rating" },
  { label: "Lowest rating", value: "lowest-rating" },
  { label: "Most views", value: "most-views" },
  { label: "Least views", value: "least-views" },
];

const RATING_OPTIONS = [
  { label: "Any rating", value: "" },
  { label: "5 stars", value: "5" },
  { label: "4 stars", value: "4" },
  { label: "3 stars", value: "3" },
  { label: "2 stars", value: "2" },
  { label: "1 star", value: "1" },
];

type Props = {
  categories: { key: string; name: string }[];
  gameVersions: string[];
  sfmByGame: Record<string, string[]>;
  initialQuery?: string;
  initialOrder?: string;
  initialMinRating?: string;
  initialCategory?: string;
  initialGameVersion?: string;
  initialSfmVersion?: string;
};

export default function PostsFilterBar({
  categories,
  gameVersions,
  sfmByGame,
  initialQuery = "",
  initialOrder = "most-views",
  initialMinRating = "",
  initialCategory = "",
  initialGameVersion = "",
  initialSfmVersion = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [order, setOrder] = useState(initialOrder || "most-views");
  const [minRating, setMinRating] = useState(initialMinRating);
  const [category, setCategory] = useState(initialCategory);
  const [gameVersion, setGameVersion] = useState(initialGameVersion);
  const [sfmVersion, setSfmVersion] = useState(initialSfmVersion);
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initialCategory || initialGameVersion || initialSfmVersion));

  const availableSfmVersions = useMemo(() => {
    if (!gameVersion) return [];
    return sfmByGame[gameVersion] ?? [];
  }, [gameVersion, sfmByGame]);

  const handleGameVersionChange = (value: string) => {
    setGameVersion(value);
    if (!value) {
      setSfmVersion("");
      return;
    }
    const allowed = sfmByGame[value] ?? [];
    if (sfmVersion && !allowed.includes(sfmVersion)) {
      setSfmVersion("");
    }
  };

  return (
    <form method="get" action="/posts" className="space-y-4 rounded-2xl border border-white/10 bg-(--surface)/80 p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label htmlFor="posts-search" className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            Search
          </label>
          <input
            id="posts-search"
            name="q"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search posts"
            className="mt-1 w-full rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-base text-white placeholder-white/50 focus:border-brand-400 focus:ring-2 focus:ring-brand-400"
          />
        </div>

        <div className="flex flex-1 flex-wrap gap-3 lg:justify-end">
          <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            Order by
            <select
              name="order"
              className="mt-1 rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-white"
              value={order}
              onChange={event => setOrder(event.target.value)}
            >
              {ORDER_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            Minimum rating
            <select
              name="minRating"
              className="mt-1 rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-white"
              value={minRating}
              onChange={event => setMinRating(event.target.value)}
            >
              {RATING_OPTIONS.map(option => (
                <option key={option.value || "any"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            onClick={() => setShowAdvanced(prev => !prev)}
          >
            {showAdvanced ? "Hide advanced options" : "Show advanced options"}
          </button>

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            Search
          </button>
        </div>
      </div>

      {showAdvanced && (
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            Category
            <select
              name="category"
              className="mt-1 rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-white"
              value={category}
              onChange={event => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map(option => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            Minecraft version
            <select
              name="gameVersion"
              className="mt-1 rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-white"
              value={gameVersion}
              onChange={event => handleGameVersionChange(event.target.value)}
            >
              <option value="">Any version</option>
              {gameVersions.map(version => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            SFM version
            <select
              name="sfmVersion"
              className="mt-1 rounded-xl border border-white/20 bg-(--surface-2)/80 px-3 py-2 text-white disabled:opacity-40"
              value={sfmVersion}
              onChange={event => setSfmVersion(event.target.value)}
              disabled={!gameVersion || !availableSfmVersions.length}
            >
              <option value="">Any version</option>
              {availableSfmVersions.map(version => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </form>
  );
}
