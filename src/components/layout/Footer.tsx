import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/15 bg-(--surface)/85">
      <div
        className="container-max py-6 text-sm text-white/65"
        style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}
      >
        <div />
        <div className="flex flex-col items-center gap-2 text-center">
          <Link href="/" className="text-white transition hover:text-brand-300">
            superfactorymanager
          </Link>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} superfactorymanager</p>
        </div>
        <div />
      </div>
    </footer>
  );
}
