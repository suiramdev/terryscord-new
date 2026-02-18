import { createFileRoute } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

const createModeSwitchHandler =
  (
    setShowSignIn: Dispatch<SetStateAction<boolean>>,
    nextValue: boolean
  ): (() => void) =>
  (): void => {
    setShowSignIn(nextValue);
  };

const RouteComponent = () => {
  const [showSignIn, setShowSignIn] = useState(false);

  return showSignIn ? (
    <SignInForm
      onSwitchToSignUp={createModeSwitchHandler(setShowSignIn, false)}
    />
  ) : (
    <SignUpForm
      onSwitchToSignIn={createModeSwitchHandler(setShowSignIn, true)}
    />
  );
};

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});
