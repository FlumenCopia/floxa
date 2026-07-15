import type { Metadata } from "next";
import { Geist_Mono, Jost } from "next/font/google";
import ToastProvider from "./ToastProvider";
import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import "../components/dashboard/projectWizard.css";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Floxa",
  description: "Floxa dashboard and login",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jost.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
