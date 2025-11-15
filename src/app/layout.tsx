import "./globals.css";
import Providers from "./providers";
import { auth } from "@/lib/auth";
import { Space_Grotesk } from "next/font/google";
import clsx from "clsx";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExternalLinkGuard from "@/components/layout/ExternalLinkGuard";
import { db } from "@/lib/db";
import { getNotificationPreview, type SerializedNotification } from "@/lib/notifications";

export const metadata = { title: "superfactorymanager" };

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  let notificationPreview: { notifications: SerializedNotification[]; unreadCount: number } | null = null;

  if (session?.user?.email) {
    const user = await db.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (user) {
      const preview = await getNotificationPreview(user.id);
      notificationPreview = preview;
    }
  }

  return (
    <html lang="en" className={clsx(sans.variable)}>
      <body className="app-shell">
        <Header session={session} notifications={notificationPreview} />

        <main className="flex-1">
          <div className="container-max space-y-12 py-12 sm:py-16">
            <Providers>
              <ExternalLinkGuard />
              {children}
            </Providers>
          </div>
        </main>

        <Footer />
      </body>
    </html>
  );
}
