"use client";
import { useState } from "react";
import { useAuthRequired } from "@/components/auth/AuthRequiredProvider";

function getErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data) {
    const msg = (data as any).error;
    if (typeof msg === "string" && msg) return msg;
  }
  if (data && typeof data === "object" && "message" in data) {
    const msg = (data as any).message;
    if (typeof msg === "string" && msg) return msg;
  }
  return fallback;
}

export default function StarRating({
  slug,
  initial = 0,
  avg = 0,
  count = 0,
  isAuthor = false,
}: { slug: string; initial?: number; avg?: number; count?: number; isAuthor?: boolean }) {

  const { apiFetchJson } = useAuthRequired();

  const [hover, setHover] = useState<number | null>(null);
  const [my, setMy] = useState(initial);
  const [curAvg, setCurAvg] = useState(avg);
  const [rc, setRc] = useState(count);
  const [busy, setBusy] = useState(false);

  const send = async (v: number) => {
    if (isAuthor || busy) return;
    setBusy(true);
    const { res, data } = await apiFetchJson<{ rating: number; ratingCount: number; my: number }>(
      `/api/posts/${slug}/rate`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: v }) }
    );
    setBusy(false);
    if (!res.ok) { alert(getErrorMessage(data, "Rating failed")); return; }
    setMy((data as any)?.my ?? v);
    setCurAvg((data as any)?.rating ?? curAvg);
    setRc((data as any)?.ratingCount ?? rc);
  };

  const clear = async () => {
    if (isAuthor || busy || my === 0) return;
    setBusy(true);
    const { res, data } = await apiFetchJson<{ rating: number; ratingCount: number }>(
      `/api/posts/${slug}/rate`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) { alert(getErrorMessage(data, "Remove failed")); return; }
    setMy(0);
    setCurAvg((data as any)?.rating ?? curAvg);
    setRc((data as any)?.ratingCount ?? rc);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {[1, 2, 3, 4, 5].map(n => {
          const active = (hover ?? 0) >= n || my >= n || (!my && Math.round(curAvg) >= n);
          return (
            <button key={n}
              disabled={busy || isAuthor}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} onClick={() => send(n)}
              aria-label={`Rate ${n}`} className={`px-0.5 ${isAuthor ? "cursor-not-allowed opacity-60" : ""}`}>
              <span className={active ? "text-yellow-500" : "text-gray-400"}>★</span>
            </button>
          );
        })}
      </div>
      <div className="text-xs opacity-70">({curAvg.toFixed(1)} / {rc})</div>
      {!isAuthor && (
        <button
          disabled={busy || my === 0}
          onClick={clear}
          className="text-xs underline disabled:opacity-40"
          title={my ? `Remove my ${my}-star rating` : "No rating yet"}
        >
          Clear
        </button>
      )}
      {isAuthor && <span className="text-xs opacity-60">(author)</span>}
    </div>
  );
}
