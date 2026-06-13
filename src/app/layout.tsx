import "./globals.css";
import Providers from "./providers";
import { Space_Grotesk } from "next/font/google";
import Script from "next/script";
import clsx from "clsx";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExternalLinkGuard from "@/components/layout/ExternalLinkGuard";
import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/urls";
import RouteAds, { RouteAdSlot } from "@/components/ads/RouteAds";
import RouteInstrumentation from "@/components/layout/RouteInstrumentation";
import { CORE_SEO_KEYWORDS, SITE_NAME, SITE_TAGLINE, safeJsonLd } from "@/lib/seo";

const appUrl = getBaseUrl();
const siteDescription =
  "Find Super Factory Manager code, SFM builds, Minecraft automation guides, and community posts for Mekanism, AE2, and other modded factories.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${SITE_NAME} - ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: siteDescription,
  applicationName: SITE_NAME,
  keywords: CORE_SEO_KEYWORDS,
  openGraph: {
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: siteDescription,
    url: appUrl,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: siteDescription,
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
  const adsClient = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ["Super Factory Manager Hub", "SuperFactoryManager Hub", "SFM Hub"],
    url: appUrl,
    description: siteDescription,
    inLanguage: "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: `${appUrl}/posts?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en" className={clsx(sans.variable)}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }}
        />
        {adsClient ? (
          <Script
            id="google-adsense"
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsClient}`}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body className="app-shell">
        <Providers>
          <RouteInstrumentation />
          <Header />

          <main className="relative flex-1">
            <div className="container-max relative py-8 sm:py-12">
              <RouteAds />
              <RouteAdSlot placement="mobile-top" />

              <ExternalLinkGuard />

              <div className="space-y-6 lg:space-y-10">
                <div className="space-y-12">{children}</div>
              </div>

              <RouteAdSlot placement="mobile-bottom" />
            </div>
          </main>

          <Footer />
        </Providers>
      </body>
    </html>
  );
}
