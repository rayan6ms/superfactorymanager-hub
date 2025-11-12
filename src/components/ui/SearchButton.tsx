import clsx from "clsx";
import { Search } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export default function SearchButton({ className, children = "Search", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className={clsx(
        "inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]",
        className
      )}
      {...rest}
    >
      <Search className="h-4 w-4" />
      {children}
    </button>
  );
}
