import Link from "next/link";
import Button from "@/components/ui/Button";
import Search from "@/components/ui/Search";
import { LogIn, LogOut, Menu, Plus } from "lucide-react";
import { signOut } from "@/lib/auth";
import type { Session } from "next-auth";
import NotificationBell from "./NotificationBell";
import NotificationPreviewList from "@/components/notifications/NotificationPreviewList";
import type { SerializedNotification } from "@/lib/notifications";

type HeaderProps = {
  session: Session | null;
  notifications?: { notifications: SerializedNotification[]; unreadCount: number } | null;
};

export default function Header({ session, notifications }: HeaderProps) {
  const notificationItems = notifications?.notifications ?? [];
  const unreadCount = notifications?.unreadCount ?? 0;

  return (
    <header className="sticky top-0 z-30 border-b border-white/15 bg-[var(--surface)]/85 py-3 backdrop-blur-lg">
      <div className="container-max">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-[var(--surface-2)]/85 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-[var(--surface-2)]"
          >
            <span className="hidden sm:inline">superfactorymanager</span>
            <span className="sm:hidden">SFM</span>
          </Link>

          <div className="hidden flex-1 items-center justify-center lg:flex">
            <div className="w-full max-w-md">
              <Search className="max-w-md" />
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            {session?.user && (
              <NotificationBell
                initialNotifications={notificationItems}
                initialUnreadCount={unreadCount}
              />
            )}
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

          <details className="relative ml-auto lg:hidden">
            <summary className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-[var(--surface-2)]/85 text-white transition hover:border-white/25 hover:bg-[var(--surface-2)]/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&::-webkit-details-marker]:hidden">
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Toggle navigation</span>
            </summary>
            <div className="absolute right-0 top-full mt-2 min-w-[16rem] rounded-xl border border-white/15 bg-[var(--surface-2)]/95 p-4 shadow-lg">
              <div className="flex flex-col gap-4">
                {session?.user && (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span className="font-semibold text-white">Notifications</span>
                      <span>{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</span>
                    </div>
                    <NotificationPreviewList
                      notifications={notificationItems}
                      emptyLabel="No notifications yet"
                      dense
                      className="max-h-64 overflow-y-auto pr-1"
                    />
                    <Link
                      href="/notifications"
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                    >
                      View all notifications
                    </Link>
                  </div>
                )}
                <div className="w-full">
                  <Search className="w-full" />
                </div>
                {session?.user && (
                  <Link href="/posts/new" className="inline-flex">
                    <Button size="md" className="w-full justify-center px-4">
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
                    <Button size="md" variant="outline" className="w-full justify-center px-4">
                      <LogOut /> Log out
                    </Button>
                  </form>
                ) : (
                  <Link href="/login" className="inline-flex">
                    <Button size="md" variant="outline" className="w-full justify-center px-4">
                      <LogIn /> Log in
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
