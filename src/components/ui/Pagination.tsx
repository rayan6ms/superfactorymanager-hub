import Link from "next/link";
import { getTotalPages } from "@/lib/pagination";

const baseButtonClasses =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition";

function buildButtonClasses(disabled: boolean) {
  if (disabled) {
    return `${baseButtonClasses} cursor-not-allowed border-white/10 bg-white/5 text-white/40`;
  }
  return `${baseButtonClasses} border-white/20 bg-white/5 text-white/80 hover:border-white/35 hover:text-white`;
}

type PaginationProps = {
  currentPage: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
  className?: string;
};

export default function Pagination({
  currentPage,
  pageSize,
  total,
  buildHref,
  className,
}: PaginationProps) {
  const totalPages = getTotalPages(total, pageSize);
  if (totalPages <= 1) return null;

  const page = Math.min(Math.max(currentPage, 1), totalPages);
  const prevPage = Math.max(page - 1, 1);
  const nextPage = Math.min(page + 1, totalPages);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className ?? ""}`}>
      <p className="text-sm text-white/60">
        Page {page} of {totalPages} · {total} {total === 1 ? "item" : "items"}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(prevPage)}
          aria-disabled={page === 1}
          className={buildButtonClasses(page === 1)}
        >
          Previous
        </Link>
        <Link
          href={buildHref(nextPage)}
          aria-disabled={page === totalPages}
          className={buildButtonClasses(page === totalPages)}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
