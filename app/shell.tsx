"use client";
import dynamic from "next/dynamic";
const DesktopApp = dynamic(() => import("../src/App"), { ssr: false, loading: () => <main className="flex min-h-screen items-center justify-center"><p>Opening Creatorize Suite…</p></main> });
export default function AppShell() { return <DesktopApp />; }
