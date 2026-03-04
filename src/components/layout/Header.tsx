"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut as clientSignOut, useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Search from "@/components/ui/Search";
import {
  BookOpen,
  Code2,
  History,
  LogIn,
  LogOut,
  MessagesSquare,
  Plus,
  UserRoundPen,
  Menu,
} from "lucide-react";
import type { SerializedNotification } from "@/lib/notifications-shared";
import UserMenuAutoCloser from "@/components/layout/UserMenuAutoCloser";
import HeaderNotifications from "@/components/layout/HeaderNotifications";
import NotificationBadge from "@/components/layout/NotificationBadge";
import Image from "next/image";
import { NOTIFICATION_PREVIEW_LIMIT } from "@/lib/notifications-shared";

type NotificationsResponse = {
  unreadCount?: number;
  notifications?: SerializedNotification[];
};

export default function Header() {
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const [notificationItems, setNotificationItems] = useState<SerializedNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated" || !user?.id) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const params = new URLSearchParams({
          limit: String(NOTIFICATION_PREVIEW_LIMIT),
          unreadOnly: "1",
        });
        const res = await fetch(`/api/notifications?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) return;

        const data = await res.json() as NotificationsResponse;
        if (Array.isArray(data.notifications)) {
          setNotificationItems(data.notifications);
        }
        if (typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load header notifications:", error);
      }
    })();

    return () => controller.abort();
  }, [status, user?.id]);

  const visibleNotificationItems = user ? notificationItems : [];
  const visibleUnreadCount = user ? unreadCount : 0;

  const username = user?.name?.trim() || null;
  const avatarUrl = user?.image ?? null;
  const initial = (user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase() || "?";
  const displayName = (user?.name ?? user?.email ?? "").trim();
  const profileHref = username ? `/profile/${encodeURIComponent(username)}` : "/profile";
  const editProfileHref = "/profile/edit";

  return (
    <header className="sticky top-0 z-30 border-b border-white/15">
      <div className="blur-header py-3">
        <div className="container-max">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="
                inline-flex shrink-0 items-center gap-2
                rounded-xl border
                border-white/20
                bg-(--surface-2)
                px-3 py-2 text-sm
                decoration-brand-400
                transition
                hover:bg-(--surface-2)
              "
            >
              <Image className="bg-white/30 px-0.5 rounded-full" src="/favicon.ico" alt="logo" width={20} height={20} />
              <span className="bg-linear-to-b from-red-400 to-brand-500 bg-clip-text text-transparent font-extrabold">
                SFMHub
              </span>
            </Link>

            <div
              className="hidden flex-1 items-center justify-center lg:flex"
              data-header-search
            >
              <div className="w-full max-w-md">
                <Search className="max-w-md" />
              </div>
            </div>

            <UserMenuAutoCloser />

            <div className="ml-auto flex items-center gap-2">
              {user && displayName && (
                <Link
                  href={profileHref}
                  className="hidden text-md font-medium text-white/80! hover:text-white lg:inline-flex"
                >
                  {displayName}
                </Link>
              )}

              <details className="relative" data-user-menu>
                <summary className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-(--surface-2)/85 text-white transition hover:border-white/25 hover:bg-(--surface-2)/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 [&::-webkit-details-marker]:hidden">
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
                      <NotificationBadge initialCount={visibleUnreadCount} />
                    </>
                  ) : (
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-semibold">
                      <Menu className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                  <span className="sr-only">Open menu</span>
                </summary>

                <div className="absolute right-0 top-full mt-2 min-w-2xs w-xs max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-neutral-900/40 p-4 shadow-lg backdrop-blur-lg">
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2 lg:hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        Search posts and builds
                      </p>
                      <Search className="w-full" />
                    </div>

                    {user && (
                      <HeaderNotifications
                        initialNotifications={visibleNotificationItems}
                        initialUnreadCount={visibleUnreadCount}
                        scrollClassName="max-h-64"
                      />
                    )}

                    <div className="grid gap-2">
                      <div className="-mx-4">
                        <div className="flex justify-center gap-1 px-1">
                          <Link href="/guide" className="inline-flex">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full justify-center gap-2 px-2.5!"
                            >
                              <BookOpen className="h-4 w-4" /> Guide
                            </Button>
                          </Link>
                          <Link href="/contact" className="inline-flex">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full justify-center gap-2 px-2.5!"
                            >
                              <MessagesSquare className="h-4 w-4" /> Contact
                            </Button>
                          </Link>
                          <Link href="/changelog" className="inline-flex">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full justify-center gap-2 px-2.5!"
                            >
                              <History className="h-4 w-4" /> Changelog
                            </Button>
                          </Link>
                        </div>
                      </div>

                      <Link href="/code-editor" className="inline-flex">
                        <Button
                          size="md"
                          variant="outline"
                          className="w-full justify-center"
                        >
                          <Code2 /> Code editor
                        </Button>
                      </Link>

                      {user && (
                        <Link href="/posts/new" className="inline-flex">
                          <Button size="md" className="w-full justify-center gap-2">
                            <Plus /> New post
                          </Button>
                        </Link>
                      )}

                      {user && (
                        <Link href={editProfileHref} className="inline-flex">
                          <Button
                            size="md"
                            variant="outline"
                            className="w-full justify-center"
                          >
                            <UserRoundPen /> Edit profile
                          </Button>
                        </Link>
                      )}
                    </div>

                    {user ? (
                      <div className="inline-flex">
                        <Button
                          size="md"
                          variant="ghost"
                          className="w-full justify-center text-red-200 hover:text-red-100"
                          onClick={() => void clientSignOut({ callbackUrl: "/" })}
                        >
                          <LogOut /> Log out
                        </Button>
                      </div>
                    ) : (
                      <Link href="/login" className="inline-flex">
                        <Button
                          size="md"
                          variant="outline"
                          className="w-full justify-center px-4"
                        >
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
      </div>
    </header>
  );
}
