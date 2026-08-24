import { Suspense } from "react";

import { BRAND_NAME } from "@/lib/branding";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div className="mb-8 text-center">
        <h1 className="font-mono text-2xl font-bold tracking-tight text-white">{BRAND_NAME}</h1>
        <p className="mt-1 text-sm text-neutral-500">Pre-market intelligence.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
