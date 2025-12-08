import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-(--surface)/30 backdrop-blur-sm">
      <div className="container-max grid space-y-1 py-4 text-center text-xs text-white/60 sm:text-sm">
        <Link href="/" className="mx-auto text-sm font-semibold text-white transition hover:text-brand-300">
          SFMHub
        </Link>
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
