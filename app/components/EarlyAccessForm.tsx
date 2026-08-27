"use client";

import type { FormEvent } from "react";

const EARLY_ACCESS_EMAIL = "hello@trulot.com";

export function buildEarlyAccessMailto(
  email: string,
  propertyQuestion: string,
): string {
  const subject = encodeURIComponent("TruLot early access request");
  const body = encodeURIComponent(
    [
      `Email: ${email.trim()}`,
      "",
      "What are you trying to learn about a property?",
      propertyQuestion.trim() || "Not provided",
    ].join("\n"),
  );

  return `mailto:${EARLY_ACCESS_EMAIL}?subject=${subject}&body=${body}`;
}

export default function EarlyAccessForm() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const propertyQuestion = String(
      formData.get("propertyQuestion") ?? "",
    ).trim();

    window.location.href = buildEarlyAccessMailto(email, propertyQuestion);
  }

  return (
    <form onSubmit={handleSubmit} className="early-access-form">
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
          aria-describedby="form-message"
        />
      </div>

      <div className="form-field form-field-optional">
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

      <button type="submit">
        REQUEST EARLY ACCESS
        <span aria-hidden="true">↗</span>
      </button>

      <p id="form-message" className="form-message">
        Opens a draft email to {EARLY_ACCESS_EMAIL}.
      </p>
    </form>
  );
}
