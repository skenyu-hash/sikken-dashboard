import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { currentUser } from "./lib/auth";
import { NavBar } from "./components/NavBar";
import { RoleProvider } from "./components/RoleProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "経営OS",
  description: "Sikken Management Dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  const role = user?.role ?? null;
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RoleProvider>
          <NavBar role={role} userName={user?.name ?? null} />
          {children}
        </RoleProvider>
      </body>
    </html>
  );
}
