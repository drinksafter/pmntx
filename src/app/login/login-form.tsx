"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";

import { signIn, signUp, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialState
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUp,
    initialState
  );

  const state = mode === "sign-in" ? signInState : signUpState;
  const action = mode === "sign-in" ? signInAction : signUpAction;
  const pending = mode === "sign-in" ? signInPending : signUpPending;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex gap-1 rounded-lg bg-neutral-900 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className={`flex-1 rounded-md py-1.5 ${mode === "sign-in" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("sign-up")}
          className={`flex-1 rounded-md py-1.5 ${mode === "sign-up" ? "bg-neutral-700 text-white" : "text-neutral-400"}`}
        >
          Create account
        </button>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-neutral-400">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-neutral-400">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-400"
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-red-400">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p role="status" className="text-sm text-emerald-400">
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-white py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {pending ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
