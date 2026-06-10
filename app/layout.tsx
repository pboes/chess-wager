import type { Metadata, Viewport } from "next";
import { DM_Sans, Noto_Sans } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/wallet/wallet-provider";

// Lichess UI font (Noto Sans) for the interface; Circles brand font (DM Sans)
// for display/brand moments. Self-hosted at build time (no runtime requests).
const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stakemate — Circles Mini-App",
  description:
    "Challenge a connected player, stake gCRC, play on Lichess. Winner takes the pot.",
  icons: {
    icon: "/chess-puzzle-avatar-512.png",
    apple: "/chess-puzzle-avatar-512.png",
  },
  openGraph: {
    title: "Stakemate",
    description: "Stake gCRC, play on Lichess, winner takes the pot. A Circles mini-app.",
    images: ["/chess-puzzle-avatar-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#161512",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${notoSans.variable} ${dmSans.variable}`}>
      <body>
        <WalletProvider>
          <div className="min-h-dvh px-4 pb-12 pt-5">
            <main>{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
