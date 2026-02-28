import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { SendEmailInput } from "../types/email";

export type ComposerMode = "new" | "reply" | "forward";

interface EmailComposerProps {
  open: boolean;
  mode: ComposerMode;
  sending: boolean;
  canSend: boolean;
  disabledReason?: string;
  initialTo?: string[];
  initialSubject?: string;
  initialBody?: string;
  hideToField?: boolean;
  propertyId: string;
  onClose: () => void;
  onSend: (payload: SendEmailInput) => Promise<void>;
  replyToThreadId?: string;
  replyToMessageId?: string;
}

function toInputValue(recipients: string[] | undefined): string {
  return recipients?.join(", ") || "";
}

function parseRecipients(input: string): string[] {
  return input
    .split(/[;,\n]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function EmailComposer({
  open,
  mode,
  sending,
  canSend,
  disabledReason,
  initialTo,
  initialSubject,
  initialBody,
  hideToField,
  propertyId,
  onClose,
  onSend,
  replyToThreadId,
  replyToMessageId,
}: EmailComposerProps) {
  const [toValue, setToValue] = useState(toInputValue(initialTo));
  const [subjectValue, setSubjectValue] = useState(initialSubject || "");
  const [bodyValue, setBodyValue] = useState(initialBody || "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setToValue(toInputValue(initialTo));
    setSubjectValue(initialSubject || "");
    setBodyValue(initialBody || "");
    setErrorMessage(null);
  }, [open, initialTo, initialSubject, initialBody]);

  const title = useMemo(() => {
    if (mode === "reply") {
      return "Reply";
    }

    if (mode === "forward") {
      return "Forward";
    }

    return "Compose";
  }, [mode]);

  if (!open) {
    return null;
  }

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!canSend) {
      setErrorMessage(disabledReason || "Sending is unavailable.");
      return;
    }

    const recipients = parseRecipients(toValue);

    if (!hideToField && recipients.length === 0) {
      setErrorMessage("Add at least one recipient email in To.");
      return;
    }

    if (subjectValue.trim().length === 0) {
      setErrorMessage("Subject is required.");
      return;
    }

    if (bodyValue.trim().length === 0) {
      setErrorMessage("Body is required.");
      return;
    }

    const payload: SendEmailInput = {
      propertyId,
      to: recipients,
      subject: subjectValue.trim(),
      body: bodyValue,
      replyToThreadId,
      replyToMessageId,
    };

    try {
      await onSend(payload);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send email.");
    }
  };

  return (
    <div className="bh-email-composer-backdrop" onClick={onClose}>
      <section
        className="bh-email-composer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bh-email-composer__header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {!canSend && disabledReason ? (
          <p className="bh-email-composer__hint">{disabledReason}</p>
        ) : null}

        <form className="bh-email-composer__form" onSubmit={handleSend}>
          {hideToField ? null : (
            <label>
              To
              <input
                type="text"
                value={toValue}
                onChange={(event) => setToValue(event.target.value)}
                placeholder="name@company.com"
              />
            </label>
          )}

          <label>
            Subject
            <input
              type="text"
              value={subjectValue}
              onChange={(event) => setSubjectValue(event.target.value)}
              placeholder="Subject"
            />
          </label>

          <label>
            Message
            <textarea
              rows={9}
              value={bodyValue}
              onChange={(event) => setBodyValue(event.target.value)}
              placeholder="Write your message"
            />
          </label>

          {errorMessage ? (
            <p className="bh-email-composer__error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="bh-email-composer__actions">
            <button type="button" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" disabled={sending || !canSend}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
