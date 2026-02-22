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

import AdsShell from "@/components/ads/AdsShell";

const appUrl = getBaseUrl();
const adsClient = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;

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
      <head>
        {adsClient ? (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsClient}`}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body className="app-shell">
        <Analytics />
        <Header session={session} notifications={notificationPreview} />

        <main className="relative flex-1">
          <div className="container-max relative py-8 sm:py-12">
            <AdsShell placement="desktop-rails" />
            <AdsShell placement="mobile-top" />

            <Providers>
              <ExternalLinkGuard />

              <div className="space-y-6 lg:space-y-10">
                <div className="space-y-12">{children}</div>
              </div>
            </Providers>

            <AdsShell placement="mobile-bottom" />
          </div>
        </main>

        <Footer />
      </body>
    </html>
  );
}
