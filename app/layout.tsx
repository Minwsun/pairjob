import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PairJob — Explainable Talent Matching",
  description: "AI chuẩn hóa JD và CV thành matching có thể giải thích.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
