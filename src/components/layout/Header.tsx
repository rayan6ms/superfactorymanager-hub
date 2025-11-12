import Link from "next/link";
import Button from "@/components/ui/Button";
import Search from "@/components/ui/Search";
import { LogIn, LogOut, Plus } from "lucide-react";
import { signOut } from "@/lib/auth";
import type { Session } from "next-auth";

export default function Header({ session }: { session: Session | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/15 bg-[var(--surface)]/85 backdrop-blur-lg">
      <div className="container-max">
        <div
          className="items-center gap-4"
          style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}
        >
          <Link
            href="/"
            className="flex items-center gap-3 text-white"
            style={{ justifySelf: "start" }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#1B84F8] text-sm font-semibold">
              SF
            </span>
            <span className="text-base font-semibold tracking-tight">superfactorymanager</span>
          </Link>

          <div className="w-full max-w-xl" style={{ justifySelf: "center" }}>
            <Search />
          </div>

          <div className="flex items-center gap-2" style={{ justifySelf: "end" }}>
            <Link href="/posts/new" className="inline-flex">
              <Button size="sm" className="w-28 justify-center">
                <Plus /> New post
              </Button>
            </Link>

            {session?.user ? (
              <form
                className="inline-flex"
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button size="sm" variant="ghost" className="w-24 justify-center">
                  <LogOut /> Log out
                </Button>
              </form>
            ) : (
              <Link href="/login" className="inline-flex">
                <Button size="sm" variant="outline" className="w-24 justify-center">
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
