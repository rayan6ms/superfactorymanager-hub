"use client";
import Input from "./Input";
import { Search } from "lucide-react";
// keep className extension simple; avoid clsx so Tailwind v4 static extraction is robust

type Props = {
  action?: string;
  method?: "get" | "post";
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
};

export default function SearchBar({
  action = "/",
  method = "get",
  name = "q",
  placeholder = "Search posts",
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
          className="h-12 rounded-l-xl rounded-r-none border-white/20 border-r-0"
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-12 flex-none items-center justify-center gap-2 rounded-r-xl -ml-px border border-brand-700 bg-brand-700 px-5 text-sm font-semibold text-white leading-none transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&_svg]:block [&_svg]:h-3.5 [&_svg]:w-3.5"
      >
        <Search />
        Search
      </button>
    </form>
  );
}
