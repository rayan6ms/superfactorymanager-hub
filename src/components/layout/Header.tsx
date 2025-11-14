import Link from "next/link";
import Button from "@/components/ui/Button";
import Search from "@/components/ui/Search";
import { LogIn, LogOut, Plus, UserRoundPen } from "lucide-react";
import { signOut } from "@/lib/auth";
import type { Session } from "next-auth";
import NotificationPreviewList from "@/components/notifications/NotificationPreviewList";
import type { SerializedNotification } from "@/lib/notifications";
import UserMenuAutoCloser from "@/components/layout/UserMenuAutoCloser";

type HeaderProps = {
  session: Session | null;
  notifications?: { notifications: SerializedNotification[]; unreadCount: number } | null;
};

export default function Header({ session, notifications }: HeaderProps) {
  const notificationItems = notifications?.notifications ?? [];
  const unreadCount = notifications?.unreadCount ?? 0;
  const user = session?.user ?? null;
  const avatarUrl = user?.image ?? null;
  const initial = (user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase() || "?";
  const displayName = (user?.name ?? user?.email ?? "").trim();

  return (
    <header className="sticky top-0 z-30 border-b border-white/15 bg-(--surface)/85 py-3 backdrop-blur-lg">
      <div className="container-max">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-(--surface-2)/85 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-(--surface-2)"
          >
            <span className="hidden sm:inline">superfactorymanager</span>
            <span className="sm:hidden">SFM</span>
          </Link>

          <div className="hidden flex-1 items-center justify-center lg:flex">
            <div className="w-full max-w-md">
              <Search className="max-w-md" />
            </div>
          </div>

          <UserMenuAutoCloser />
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            {user ? (
              <>
                {displayName && (
                  <Link
                    href="/profile"
                    className="hidden text-md font-medium text-white/80! hover:text-white sm:inline-flex"
                  >
                    {displayName}
                  </Link>
                )}
                <details className="relative" data-user-menu>
                  <summary className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-(--surface-2)/85 text-white transition hover:border-white/25 hover:bg-(--surface-2)/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&::-webkit-details-marker]:hidden">
                    {avatarUrl ? (
                      <span
                        className="h-10 w-10 rounded-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${avatarUrl})` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-semibold">
                        {initial}
                      </span>
                    )}
                    {unreadCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-semibold leading-none text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                    <span className="sr-only">Open user menu</span>
                  </summary>
                  <div className="absolute right-0 top-full mt-2 min-w-[20rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-(--surface-2)/95 p-4 shadow-lg">
                    <div className="flex flex-col gap-4">
                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between text-xs text-white/60">
                          <span className="font-semibold text-white">Notifications</span>
                          <span>{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</span>
                        </div>
                        <NotificationPreviewList
                          notifications={notificationItems}
                          emptyLabel="No notifications yet"
                          dense
                          className="max-h-72 overflow-y-auto pr-1"
                        />
                        <Link
                          href="/notifications"
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                        >
                          View all notifications
                        </Link>
                      </div>
                      <div className="grid gap-2">
                        <Link href="/posts/new" className="inline-flex">
                          <Button size="md" className="w-full justify-center gap-2">
                            <Plus /> New post
                          </Button>
                        </Link>
                        <Link href="/profile" className="inline-flex">
                          <Button size="md" variant="outline" className="w-full justify-center">
                            <UserRoundPen /> Edit profile
                          </Button>
                        </Link>
                        <form
                          className="inline-flex"
                          action={async () => {
                            "use server";
                            await signOut({ redirectTo: "/" });
                          }}
                        >
                          <Button size="md" variant="ghost" className="w-full justify-center text-red-200 hover:text-red-100">
                            <LogOut /> Log out
                          </Button>
                        </form>
                      </div>
                    </div>
                  </div>
                </details>
              </>
            ) : (
              <Link href="/login" className="inline-flex">
                <Button size="md" variant="outline" className="justify-center px-4">
                  <LogIn /> Log in
                </Button>
              </Link>
            )}
          </div>

          <details className="relative ml-auto lg:hidden" data-user-menu>
            <summary className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-(--surface-2)/85 text-white transition hover:border-white/25 hover:bg-(--surface-2)/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&::-webkit-details-marker]:hidden">
              {user ? (
                <>
                  {avatarUrl ? (
                    <span
                      className="h-10 w-10 rounded-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${avatarUrl})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-semibold">
                      {initial}
                    </span>
                  )}
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-semibold leading-none text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </>
              ) : (
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-semibold">
                  <LogIn className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              <span className="sr-only">Toggle navigation</span>
            </summary>
            <div className="absolute right-0 top-full mt-2 min-w-[16rem] rounded-xl border border-white/15 bg-(--surface-2)/95 p-4 shadow-lg">
              <div className="flex flex-col gap-4">
                {user && (
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
                {user && (
                  <Link href="/profile" className="inline-flex">
                    <Button size="md" variant="outline" className="w-full justify-center px-4">
                      <UserRoundPen /> Edit profile
                    </Button>
                  </Link>
                )}
                {user && (
                  <Link href="/posts/new" className="inline-flex">
                    <Button size="md" className="w-full justify-center px-4">
                      <Plus /> New post
                    </Button>
                  </Link>
                )}
                {user ? (
                  <form
                    className="inline-flex"
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <Button size="md" variant="ghost" className="w-full justify-center px-4 text-red-200 hover:text-red-100">
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
