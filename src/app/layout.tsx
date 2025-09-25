
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from './sessionProvider';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Luisterslim",
  description: "Nederlandse AI voor het notuleren en samenvatten van audio",
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* SessionProvider wraps the application */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
