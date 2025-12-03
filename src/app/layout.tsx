import "./globals.css";
import Providers from "./providers";
import { auth } from "@/lib/auth";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import clsx from "clsx";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExternalLinkGuard from "@/components/layout/ExternalLinkGuard";
import { db } from "@/lib/db";
import { getNotificationPreview, type SerializedNotification } from "@/lib/notifications";
import GoogleAdSlot from "@/components/ads/GoogleAdSlot";

export const metadata = { title: "superfactorymanager" };

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  let notificationPreview: { notifications: SerializedNotification[]; unreadCount: number } | null = null;
  const adsEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT);

  if (session?.user?.email) {
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (user) {
      const preview = await getNotificationPreview(user.id);
      notificationPreview = preview;
    }
  }

  return (
    <html lang="en" className={clsx(sans.variable)}>
      <body className="app-shell">
        <Header session={session} notifications={notificationPreview} />

        <main className="relative flex-1">
          {adsEnabled && (
            <Script
              id="google-adsense-script"
              strategy="afterInteractive"
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT}`}
              crossOrigin="anonymous"
            />
          )}

          {adsEnabled && (
            <>
              <div className="hidden xl:block fixed left-4 top-24 z-20">
                <GoogleAdSlot
                  className="h-[600px] w-[180px]"
                  slot="6232979234"
                  layoutKey="left-rail"
                />
              </div>

              <div className="hidden xl:block fixed right-4 top-24 z-20">
                <GoogleAdSlot
                  className="h-[600px] w-[180px]"
                  slot="5105947433"
                  layoutKey="right-rail"
                />
              </div>
            </>
          )}

          <div className="container-max py-12 sm:py-16">
            <Providers>
              <ExternalLinkGuard />

              <div className="space-y-6 lg:space-y-10">
                {adsEnabled && (
                  <div className="space-y-4 lg:hidden">
                    <GoogleAdSlot
                      className="min-h-[120px] w-full"
                      slot="3606815892"
                      layoutKey="mobile-top"
                    />
                  </div>
                )}

                <div className="space-y-12">
                  {children}
                </div>

                {adsEnabled && (
                  <div className="space-y-4 lg:hidden">
                    <GoogleAdSlot
                      className="min-h-[120px] w-full"
                      slot="7536669655"
                      layoutKey="mobile-bottom"
                    />
                  </div>
                )}
              </div>
            </Providers>
          </div>
        </main>

        <Footer />
      </body>
    </html>
  );
}
