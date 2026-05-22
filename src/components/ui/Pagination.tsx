import Link from "next/link";
import type { MouseEvent } from "react";
import { getTotalPages } from "@/lib/pagination";

const baseButtonClasses =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition";

function buildButtonClasses(disabled: boolean) {
  if (disabled) {
    return `${baseButtonClasses} cursor-not-allowed pointer-events-none border-white/10 bg-white/5 text-white/40`;
  }
  return `${baseButtonClasses} border-white/20 bg-white/5 text-white/80 hover:border-white/35 hover:text-white`;
}

type PaginationProps = {
  currentPage: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
  className?: string;
  linkRel?: string;
  onPageChange?: (page: number) => void;
};

export default function Pagination({
  currentPage,
  pageSize,
  total,
  buildHref,
  className,
  linkRel,
  onPageChange,
}: PaginationProps) {
  const totalPages = getTotalPages(total, pageSize);
  if (totalPages <= 1) return null;

  const page = Math.min(Math.max(currentPage, 1), totalPages);
  const prevPage = Math.max(page - 1, 1);
  const nextPage = Math.min(page + 1, totalPages);

  const isPrevDisabled = page === 1;
  const isNextDisabled = page === totalPages;

  const handleNavigate =
    (targetPage: number) =>
      (event: MouseEvent<HTMLAnchorElement>) => {
        if (!onPageChange) return;
        event.preventDefault();
        if (targetPage === page) return;
        onPageChange(targetPage);
      };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className ?? ""}`}>
      <p className="text-sm text-white/60">
        Page {page} of {totalPages} · {total} {total === 1 ? "item" : "items"}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(prevPage)}
          rel={linkRel}
          aria-disabled={isPrevDisabled}
          tabIndex={isPrevDisabled ? -1 : 0}
          onClick={onPageChange && !isPrevDisabled ? handleNavigate(prevPage) : undefined}
          className={buildButtonClasses(isPrevDisabled)}
        >
          Previous
        </Link>

        <Link
          href={buildHref(nextPage)}
          rel={linkRel}
          aria-disabled={isNextDisabled}
          tabIndex={isNextDisabled ? -1 : 0}
          onClick={onPageChange && !isNextDisabled ? handleNavigate(nextPage) : undefined}
          className={buildButtonClasses(isNextDisabled)}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
