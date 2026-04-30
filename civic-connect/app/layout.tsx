import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageViewTracker from "@/components/PageViewTracker";
import { getCurrentUser } from "@/lib/user-tracking";

export const metadata: Metadata = {
  title: "CivicConnect — Understand Your Laws",
  description:
    "AI-powered plain-language summaries of U.S. federal legislation, party stances, and pathways to civic action.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser().catch(() => null);

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Libre+Franklin:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Navbar accountEmail={currentUser?.email ?? null} />
        <PageViewTracker />
        <main className="flex-1 bg-[#f6f1e7]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
