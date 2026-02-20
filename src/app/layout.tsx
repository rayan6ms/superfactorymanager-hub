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
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/urls";
import dynamic from "next/dynamic";

const GoogleAdSlot = dynamic(() => import("@/components/ads/GoogleAdSlot"), {
  ssr: false,
});

const appUrl = getBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "SFMHub",
    template: "%s | SFMHub",
  },
  description:
    "Community hub for SuperFactoryManager players to share builds, troubleshoot setups, and stay current with mod updates.",
  applicationName: "SFMHub",
  keywords: [
    "SuperFactoryManager",
    "Minecraft",
    "factory",
    "automation",
    "builds",
    "guides",
    "blueprints",
    "mods",
    "community",
  ],
  openGraph: {
    title: "SFMHub",
    description:
      "Discover curated SuperFactoryManager builds, guides, and troubleshooting tips from the community.",
    url: appUrl,
    siteName: "SFMHub",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SFMHub",
    description:
      "Discover curated SuperFactoryManager builds, guides, and troubleshooting tips from the community.",
    creator: "@SFMHub",
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
        <Analytics />
        <Header session={session} notifications={notificationPreview} />

        <main className="relative flex-1">
          {adsEnabled && (
            <>
              {/* Desktop side rails */}
              <div className="hidden xl:block fixed left-4 top-24 z-20">
                <GoogleAdSlot
                  className="h-150 w-40"
                  slot="6232979234"
                  format="fixed"
                  width={160}
                  height={600}
                />
              </div>

              <div className="hidden xl:block fixed right-4 top-24 z-20">
                <GoogleAdSlot
                  className="h-150 w-40"
                  slot="5105947433"
                  format="fixed"
                  width={160}
                  height={600}
                />
              </div>
            </>
          )}

          <div className="container-max py-12 sm:py-16">
            <Providers>
              <ExternalLinkGuard />

              <div className="space-y-6 lg:space-y-10">
                {/* Mobile top */}
                {adsEnabled && (
                  <div className="space-y-4 lg:hidden">
                    <GoogleAdSlot
                      className="min-h-30 w-full"
                      slot="3606815892"
                      format="auto"
                      fullWidthResponsive
                      layoutKey="mobile-top"
                    />
                  </div>
                )}

                <div className="space-y-12">{children}</div>

                {/* Mobile bottom */}
                {adsEnabled && (
                  <div className="space-y-4 lg:hidden">
                    <GoogleAdSlot
                      className="min-h-30 w-full"
                      slot="7536669655"
                      format="auto"
                      fullWidthResponsive
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