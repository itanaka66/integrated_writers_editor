import "./globals.css";

export const metadata = {
  title: "Integrated writers Editor (INE)",
  description: "AI-powered long-form writers development environment",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
