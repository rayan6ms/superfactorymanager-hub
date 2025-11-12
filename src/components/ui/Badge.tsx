export default function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-white/5 border border-base-700/70 px-2 py-0.5 text-xs text-white/80">
      {children}
    </span>
  );
}
