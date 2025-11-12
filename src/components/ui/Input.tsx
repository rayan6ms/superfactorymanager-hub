import { forwardRef, InputHTMLAttributes, useMemo } from "react";
import { clsx } from "clsx";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const Input = forwardRef<HTMLInputElement, Props>(
  ({ className, leftIcon, rightIcon, ...props }, ref) => {
    const padClass = useMemo(() => {
      return clsx(
        leftIcon && "pl-9",
        rightIcon && "pr-9"
      );
    }, [leftIcon, rightIcon]);

    return (
      <div className="relative w-full">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-white/50 pointer-events-none [&>svg]:h-4 [&>svg]:w-4">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={clsx(
            "w-full h-12 rounded-2xl border border-white/10 bg-[var(--surface-2)]/80 px-4 text-[0.95rem] font-medium text-white",
            "placeholder:text-white/40 transition focus:border-brand-400/80 focus:ring-2 focus:ring-brand-400 focus:ring-offset-0",
            "hover:border-white/20",
            padClass,
            className
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/50 pointer-events-none [&>svg]:h-4 [&>svg]:w-4">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
export default Input;
