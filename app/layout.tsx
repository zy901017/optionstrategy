export const metadata = {
  title: "Option Strategy Dashboard v2",
  description: "Diagonal/PMCC decision using Term IV structure & Total IV Rank"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
