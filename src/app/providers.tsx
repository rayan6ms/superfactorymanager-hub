"use client";
import AuthRequiredProvider from "@/components/auth/AuthRequiredProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthRequiredProvider>
      {children}
    </AuthRequiredProvider>
  );
}