import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "./components/NavBar";
import { MobileHeader } from "./components/MobileHeader";
import { MobileKpiBar } from "./components/MobileKpiBar";
import { RoleProvider } from "./components/RoleProvider";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "経営OS",
  description: "Sikken Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RoleProvider>
          <div className="hide-mobile"><NavBar /></div>
          <div className="show-mobile"><MobileHeader /></div>
          {children}
          <MobileKpiBar />
          <div className="show-mobile" style={{ height: 96 }} />
        </RoleProvider>
      </body>
    </html>
  );
}
