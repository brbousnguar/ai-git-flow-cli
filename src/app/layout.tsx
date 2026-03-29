import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "GPT Git Tools",
  description: "Web app for commit, release, and JIRA deployment workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
