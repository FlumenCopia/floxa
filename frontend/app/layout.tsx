import type { Metadata } from "next";
import ToastProvider from "./ToastProvider";
import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import "../components/dashboard/projectWizard.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
