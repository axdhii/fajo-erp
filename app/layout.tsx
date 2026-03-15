import type { Metadata } from "next";
import "./globals.css";
import { DevToolbar } from "@/components/dev/DevToolbar";

export const metadata: Metadata = {
  title: "FAJO ERP",
  description: "Hotel Management System",
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
