export const metadata = {
  title: "Option Strategy Decision Dashboard",
  description: "Auto-select PMCC / Diagonal / Condor / Spread based on IV/Greeks/Trend"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
