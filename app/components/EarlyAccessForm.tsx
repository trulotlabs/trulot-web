"use client";

import { useActionState } from "react";
import {
  requestEarlyAccess,
  type EarlyAccessState,
} from "@/app/actions";

const initialEarlyAccessState: EarlyAccessState = {
  status: "idle",
  message: "",
};

export default function EarlyAccessForm() {
  const [state, formAction, isPending] = useActionState(
    requestEarlyAccess,
    initialEarlyAccessState,
  );

  if (state.status === "success") {
    return (
      <div className="form-success" role="status">
        <span className="form-success-mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <p>You&apos;re on the list.</p>
          <span>We&apos;ll be in touch as early access opens.</span>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="early-access-form">
      <div className="form-field">
        <label htmlFor="early-access-email">Email address</label>
        <input
          id="early-access-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          maxLength={254}
          aria-describedby={state.status === "error" ? "form-message" : undefined}
        />
      </div>

      <div className="form-field">
        <label htmlFor="property-question">
          What are you trying to learn about a property?
          <span>Optional</span>
        </label>
        <textarea
          id="property-question"
          name="propertyQuestion"
          rows={2}
          maxLength={500}
          placeholder="A short note"
        />
      </div>

      <div className="form-honeypot" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button type="submit" disabled={isPending}>
        {isPending ? "REQUESTING…" : "REQUEST EARLY ACCESS"}
        <span aria-hidden="true">↗</span>
      </button>

      <p
        id="form-message"
        className="form-message"
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message}
      </p>
    </form>
  );
}
