import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DevToolbar } from "@/components/dev/DevToolbar";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "FAJO ERP",
  description: "Hotel Management System",
  manifest: '/manifest.json',
  themeColor: '#0f172a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FAJO ERP',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {children}
        {(process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_SHOW_DEV === 'true') && <DevToolbar />}
      </body>
    </html>
  );
}
