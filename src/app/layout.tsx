import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';

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
        {/* ClerkProvider should wrap the application inside the body */}
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
