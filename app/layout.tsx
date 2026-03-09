import type { Metadata } from "next";
import "./globals.css";
import { DevToolbar } from "@/components/dev/DevToolbar";

const metadata: Metadata = {
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
        {process.env.NODE_ENV === 'development' && <DevToolbar />}
      </body>
    </html>
  );
}
