"use client";
import Input from "./Input";
import { Search } from "lucide-react";

type Props = {
  action?: string;
  method?: "get" | "post";
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
};

export default function SearchBar({
  action = "/search",
  method = "get",
  name = "q",
  placeholder = "Search posts and builds",
  defaultValue,
  className,
}: Props) {
  return (
    <form
      action={action}
      method={method}
      className={`flex w-full flex-nowrap items-center${className ? ` ${className}` : ""}`}
    >
      <div className="flex-1 min-w-0">
        <Input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="h-10! rounded-l-lg! rounded-r-none! border-white/20 border-r-0"
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-10 flex-none items-center justify-center gap-2 rounded-r-lg -ml-px border border-white/20 bg-brand-600 px-3 text-sm font-semibold text-white leading-none transition hover:border-white/30 hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&_svg]:block [&_svg]:h-3.5 [&_svg]:w-3.5"
      >
        <Search />
        <span className="hidden xl:inline">Search</span>
        <span className="sr-only xl:hidden">Search</span>
      </button>
    </form>
  );
}
