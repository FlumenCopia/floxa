import type { Metadata, Viewport } from "next";
import ToastProvider from "./ToastProvider";
import PwaProvider from "./PwaProvider";
import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import "../components/dashboard/projectWizard.css";

export const viewport: Viewport = {
  themeColor: "#000704",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Floxa",
  description: "Floxa dashboard, client portal, and branding workspace",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Floxa",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <ToastProvider />
        <PwaProvider />
      </body>
    </html>
  );
}

