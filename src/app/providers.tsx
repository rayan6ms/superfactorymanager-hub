"use client";
import { SessionProvider } from "next-auth/react";
import AuthRequiredProvider from "@/components/auth/AuthRequiredProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthRequiredProvider>
        {children}
      </AuthRequiredProvider>
    </SessionProvider>
  );
}
