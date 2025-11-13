import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  NOTIFICATION_PAGE_SIZE,
  getNotifications,
  type SerializedNotification,
} from "@/lib/notifications";
import { redirect } from "next/navigation";
import NotificationCenter from "@/components/notifications/NotificationCenter";

export const metadata = {
  title: "Notifications | superfactorymanager",
};

type NotificationData = {
  notifications: SerializedNotification[];
  unreadCount: number;
  nextCursor: string | null;
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?from=/notifications");
  }

  const user = await db.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) {
    redirect("/login?from=/notifications");
  }

  const data: NotificationData = await getNotifications(user.id, { take: NOTIFICATION_PAGE_SIZE });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-white/60">
          Stay on top of your posts, comments, and system updates from one place.
        </p>
      </div>
      <NotificationCenter
        initialNotifications={data.notifications}
        initialUnreadCount={data.unreadCount}
        initialCursor={data.nextCursor}
      />
    </div>
  );
}
