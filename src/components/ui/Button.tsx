"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight transition-all duration-200 text-center leading-none " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed " +
  "[&_svg]:block [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        solid: "bg-brand-600 text-white hover:bg-brand-500",
        outline: "border border-base-700/70 text-white/85 hover:bg-white/5 hover:text-white",
        ghost: "text-white/70 hover:text-white hover:bg-white/5",
        transparent: "text-white/70 hover:text-white bg-white/10 hover:bg-white/20",
      },
      size: {
        sm: "h-8 px-4 text-sm [&_svg]:h-3.5 [&_svg]:w-3.5",
        md: "h-10 px-5 text-sm [&_svg]:h-3.5 [&_svg]:w-3.5",
        lg: "h-11 px-6 text-base [&_svg]:h-4 [&_svg]:w-4",
        icon: "h-10 w-10 p-0 [&_svg]:h-5 [&_svg]:w-5",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  }
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export default function Button({ className, variant, size, ...rest }: Props) {
  return <button className={clsx(button({ variant, size }), className)} {...rest} />;
}
