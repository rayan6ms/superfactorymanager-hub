import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-(--surface)/30 backdrop-blur-sm">
      <div className="container-max space-y-1 py-4 text-center text-xs text-white/60 sm:text-sm">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Link href="/" className="text-sm font-semibold text-white transition hover:text-brand-300">
            SFMHub
          </Link>
          <span className="text-white/35" aria-hidden="true">
            /
          </span>
          <a
            href="https://github.com/rayan6ms"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-white/70 transition hover:text-brand-300"
          >
            rayan6ms
          </a>
        </div>
        <p className="text-white/50">
          Copyright © 2025 SFMHub. All rights reserved.
        </p>
        <p className="text-white/50 uppercase tracking-wide">
          NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
        </p>
        <p className="text-white/50">
          This site is NOT associated with the SuperFactoryManager mod dev team.
        </p>
        <p className="text-white/50">
          This website does not own or claim ownership of any content posted on it; all content has been provided by registered users.
        </p>
      </div>
    </footer>
  );
}
