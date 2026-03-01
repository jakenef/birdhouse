import { useEffect, useState } from "react";

import type { EarnestStepData } from "../../types/pipeline";

interface EarnestActionModalProps {
  open: boolean;
  earnest: EarnestStepData | null;
  loading: boolean;
  submitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSendDraft: (input: { subject: string; body: string }) => Promise<void>;
  onConfirmComplete: () => Promise<void>;
}

function formatConfidence(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return `${Math.round(value * 100)}% confidence`;
}

function formatStatusLabel(status: EarnestStepData["stepStatus"]): string {
  switch (status) {
    case "action_needed":
      return "Action Needed";
    case "waiting_for_parties":
      return "Waiting";
    case "completed":
      return "Completed";
    default:
      return "Locked";
  }
}

export function EarnestActionModal({
  open,
  earnest,
  loading,
  submitting,
  errorMessage,
  onClose,
  onSendDraft,
  onConfirmComplete,
}: EarnestActionModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSubject(earnest?.draft.subject || "");
    setBody(earnest?.draft.body || "");
    setLocalError(null);
  }, [earnest, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, submitting]);

  if (!open) {
    return null;
  }

  const confidenceLabel = formatConfidence(earnest?.latestEmailAnalysis.confidence || null);
  const canSend =
    earnest?.pendingUserAction === "send_earnest_email" &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !submitting;

  return (
    <div
      className="bh-earnest-modal-backdrop"
      onClick={() => {
        if (!submitting) {
          onClose();
        }
      }}
    >
      <div
        className="bh-earnest-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="earnest-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bh-earnest-modal__header">
          <div>
            <p className="bh-earnest-modal__eyebrow">Pipeline Action</p>
            <div className="bh-earnest-modal__title-row">
              <h2 id="earnest-modal-title">Earnest Money</h2>
              <span
                className={`bh-earnest-modal__status-pill bh-earnest-modal__status-pill--${earnest?.stepStatus || "locked"}`}
              >
                {earnest ? formatStatusLabel(earnest.stepStatus) : "Loading"}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </div>

        {loading ? (
          <div className="bh-earnest-modal__state">Loading earnest details...</div>
        ) : null}

        {!loading && earnest ? (
          <>
            {earnest.promptToUser ? (
              <div className="bh-earnest-modal__prompt">{earnest.promptToUser}</div>
            ) : null}

            {earnest.contact || earnest.attachment ? (
              <div className="bh-earnest-modal__meta-grid">
                {earnest.contact ? (
                  <div className="bh-earnest-modal__meta-card">
                    <span className="bh-earnest-modal__meta-label">Contact</span>
                    <strong>{earnest.contact.name}</strong>
                    <span>{earnest.contact.email}</span>
                    {earnest.contact.company ? <span>{earnest.contact.company}</span> : null}
                  </div>
                ) : null}

                {earnest.attachment ? (
                  <div className="bh-earnest-modal__meta-card">
                    <span className="bh-earnest-modal__meta-label">Attachment</span>
                    <strong>{earnest.attachment.filename}</strong>
                    <span>Purchase contract included on send</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {earnest.latestEmailAnalysis.summary ||
            earnest.latestEmailAnalysis.reason ||
            confidenceLabel ? (
              <div className="bh-earnest-modal__analysis">
                <div className="bh-earnest-modal__analysis-header">
                  <span>AI Summary</span>
                  {confidenceLabel ? <span>{confidenceLabel}</span> : null}
                </div>
                {earnest.latestEmailAnalysis.summary ? (
                  <p>{earnest.latestEmailAnalysis.summary}</p>
                ) : null}
                {earnest.latestEmailAnalysis.reason ? (
                  <p className="bh-earnest-modal__analysis-reason">
                    {earnest.latestEmailAnalysis.reason}
                  </p>
                ) : null}
                {earnest.latestEmailAnalysis.threadId ? (
                  <a
                    className="bh-earnest-modal__thread-link"
                    href={`/property/${encodeURIComponent(earnest.propertyId)}/inbox/${encodeURIComponent(earnest.latestEmailAnalysis.threadId)}`}
                  >
                    View related email
                  </a>
                ) : null}
              </div>
            ) : null}

            {earnest.pendingUserAction === "send_earnest_email" ? (
              <form
                className="bh-earnest-modal__form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (subject.trim().length === 0 || body.trim().length === 0) {
                    setLocalError("Subject and message are required.");
                    return;
                  }

                  setLocalError(null);
                  await onSendDraft({ subject: subject.trim(), body: body.trim() });
                }}
              >
                <label>
                  Subject
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    disabled={submitting}
                  />
                </label>

                <label>
                  Message
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={10}
                    disabled={submitting}
                  />
                </label>

                {errorMessage || localError ? (
                  <p className="bh-earnest-modal__error">{errorMessage || localError}</p>
                ) : null}

                <div className="bh-earnest-modal__actions">
                  <button type="button" onClick={onClose} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="submit" disabled={!canSend}>
                    {submitting ? "Sending..." : "Send Email"}
                  </button>
                </div>
              </form>
            ) : null}

            {earnest.pendingUserAction === "confirm_earnest_complete" ? (
              <div className="bh-earnest-modal__confirm-card">
                <h3>Follow escrow instructions</h3>
                <p>
                  Escrow sent wiring instructions. Follow the instructions, then
                  mark Earnest complete when you're done.
                </p>

                {errorMessage ? <p className="bh-earnest-modal__error">{errorMessage}</p> : null}

                <div className="bh-earnest-modal__actions">
                  <button type="button" onClick={onClose} disabled={submitting}>
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void onConfirmComplete()}
                  >
                    {submitting ? "Saving..." : "Mark Earnest Complete"}
                  </button>
                </div>
              </div>
            ) : null}

            {earnest.pendingUserAction === "none" ? (
              <div className="bh-earnest-modal__state">
                No user action is needed right now.
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
