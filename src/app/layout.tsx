import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Home Fixr connects apprentices and early-career electricians, plumbers, and HVAC technicians with experienced tradespeople. Find a mentor, explore ride-along opportunities, and ask questions in the community. Community, not a marketplace.";

// metadataBase makes the relative OG/Twitter image URLs below absolute, which
// is what Reddit, Facebook, and iMessage need to render a link preview.
export const metadata: Metadata = {
  metadataBase: new URL("https://home-fixr.com"),
  title: {
    default: "Home Fixr — mentorship for the skilled trades",
    template: "%s · Home Fixr",
  },
  description: DESCRIPTION,
  applicationName: "Home Fixr",
  keywords: [
    "trades mentorship",
    "plumbing apprentice",
    "HVAC apprentice",
    "electrician apprentice",
    "early-career tradespeople",
    "skilled trades community",
  ],
  openGraph: {
    type: "website",
    siteName: "Home Fixr",
    url: "/",
    title: "Home Fixr — mentorship for the skilled trades",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Home Fixr — mentorship for the skilled trades",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
