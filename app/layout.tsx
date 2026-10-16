import type { Metadata } from "next";
import "./utilities.css";
import "../src/style.css";
export const metadata: Metadata = { title: "Creatorize Suite", description: "A local video production studio for your channels." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
