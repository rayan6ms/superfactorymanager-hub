import Link from "next/link";
import Button from "@/components/ui/Button";
import Search from "@/components/ui/Search";
import { LogIn, LogOut, Plus } from "lucide-react";
import { signOut } from "@/lib/auth";
import type { Session } from "next-auth";

export default function Header({ session }: { session: Session | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/15 bg-[var(--surface)]/85 py-3 backdrop-blur-lg">
      <div className="container-max">
        <div
          className="items-center gap-4"
          style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[var(--surface-2)]/85 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-[var(--surface-2)]"
            style={{ justifySelf: "start" }}
          >
            superfactorymanager
          </Link>

          <div className="w-full max-w-xl" style={{ justifySelf: "center" }}>
            <Search />
          </div>

          <div className="flex items-center gap-2" style={{ justifySelf: "end" }}>
            {session?.user && (
              <Link href="/posts/new" className="inline-flex">
                <Button size="md" className="justify-center px-4">
                  <Plus /> New post
                </Button>
              </Link>
            )}

            {session?.user ? (
              <form
                className="inline-flex"
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button size="md" variant="outline" className="justify-center px-4">
                  <LogOut /> Log out
                </Button>
              </form>
            ) : (
              <Link href="/login" className="inline-flex">
                <Button size="md" variant="outline" className="justify-center px-4">
                  <LogIn /> Log in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
