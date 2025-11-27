import Link from "next/link";
import Button from "@/components/ui/Button";
import Search from "@/components/ui/Search";
import { BookOpen, History, LogIn, LogOut, MessagesSquare, Plus, UserRoundPen } from "lucide-react";
import { signOut } from "@/lib/auth";
import type { Session } from "next-auth";
import type { SerializedNotification } from "@/lib/notifications";
import UserMenuAutoCloser from "@/components/layout/UserMenuAutoCloser";
import HeaderNotifications from "@/components/layout/HeaderNotifications";
import NotificationBadge from "@/components/layout/NotificationBadge";

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
    <header className="sticky top-0 z-30 border-b border-white/15">
      <div className="blur-header py-3">
        <div className="container-max">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-(--surface-2)/85 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-(--surface-2)"
            >
              <span className="hidden sm:inline">superfactorymanager</span>
              <span className="sm:hidden">SFM</span>
            </Link>

            <div className="hidden flex-1 items-center justify-center lg:flex" data-header-search>
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
                    <summary className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-(--surface-2)/85 text-white transition hover:border-white/25 hover:bg-(--surface-2)/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&::-webkit-details-marker]:hidden" role="button" tabIndex={0}>
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
                      <NotificationBadge initialCount={unreadCount} />
                      <span className="sr-only">Open user menu</span>
                    </summary>
                    <div className="absolute right-0 top-full mt-2 min-w-[20rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-(--surface)/80 p-4 shadow-lg backdrop-blur-lg">
                      <div className="flex flex-col gap-4">
                        <HeaderNotifications
                          initialNotifications={notificationItems}
                          initialUnreadCount={unreadCount}
                        />
                        <div className="grid gap-2">
                          <div className="-mx-4">
                            <div className="flex justify-center gap-1 px-1">
                              <Link href="/guide" className="inline-flex">
                                <Button size="sm" variant="ghost" className="w-full justify-center gap-2 px-2.5!">
                                  <BookOpen className="h-4 w-4" /> Guide
                                </Button>
                              </Link>
                              <Link href="/contact" className="inline-flex">
                                <Button size="sm" variant="ghost" className="w-full justify-center gap-2 px-2.5!">
                                  <MessagesSquare className="h-4 w-4" /> Contact
                                </Button>
                              </Link>
                              <Link href="/changelog" className="inline-flex">
                                <Button size="sm" variant="ghost" className="w-full justify-center gap-2 px-2.5!">
                                  <History className="h-4 w-4" /> Changelog
                                </Button>
                              </Link>
                            </div>
                          </div>
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
                    <NotificationBadge initialCount={unreadCount} />
                  </>
                ) : (
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-semibold">
                    <LogIn className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <span className="sr-only">Toggle navigation</span>
              </summary>
              <div className="absolute right-0 top-full mt-2 min-w-[20rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-(--surface)/80 p-4 shadow-lg backdrop-blur-lg">
                <div className="flex flex-col gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Search posts</p>
                    <Search className="w-full" />
                  </div>
                  {user && (
                    <HeaderNotifications
                      initialNotifications={notificationItems}
                      initialUnreadCount={unreadCount}
                      scrollClassName="max-h-64"
                    />
                  )}
                  <div className="grid gap-2">
                    <div className="-mx-4">
                      <div className="flex justify-center gap-1 px-1">
                        <Link href="/guide" className="inline-flex">
                          <Button size="sm" variant="ghost" className="w-full justify-center gap-2 px-2.5!">
                            <BookOpen className="h-4 w-4" /> Guide
                          </Button>
                        </Link>
                        <Link href="/contact" className="inline-flex">
                          <Button size="sm" variant="ghost" className="w-full justify-center gap-2 px-2.5!">
                            <MessagesSquare className="h-4 w-4" /> Contact
                          </Button>
                        </Link>
                        <Link href="/changelog" className="inline-flex">
                          <Button size="sm" variant="ghost" className="w-full justify-center gap-2 px-2.5!">
                            <History className="h-4 w-4" /> Changelog
                          </Button>
                        </Link>
                      </div>
                    </div>
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
                  </div>
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
      </div>
    </header>
  );
}
