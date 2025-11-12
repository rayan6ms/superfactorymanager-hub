import "./globals.css";
import Providers from "./providers";
import { auth } from "@/lib/auth";
import { Space_Grotesk } from "next/font/google";
import clsx from "clsx";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata = { title: "superfactorymanager" };

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en" className={clsx(sans.variable)}>
      <body className="app-shell">
        <Header session={session} />

        <main className="flex-1">
          <div className="container-max space-y-12 py-12 sm:py-16">
            <Providers>{children}</Providers>
          </div>
        </main>

        <Footer />
      </body>
    </html>
  );
}
