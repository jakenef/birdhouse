import { useEffect } from "react";

import type { ClosingStepData } from "../../types/pipeline";

interface ClosingActionModalProps {
  open: boolean;
  closing: ClosingStepData | null;
  loading: boolean;
  submitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirmComplete: () => Promise<void>;
}

function formatConfidence(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return `${Math.round(value * 100)}% confidence`;
}

function formatStatusLabel(status: ClosingStepData["stepStatus"]): string {
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

export function ClosingActionModal({
  open,
  closing,
  loading,
  submitting,
  errorMessage,
  onClose,
  onConfirmComplete,
}: ClosingActionModalProps) {
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

  const confidenceLabel = formatConfidence(closing?.latestEmailAnalysis.confidence || null);

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
        aria-labelledby="closing-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bh-earnest-modal__header">
          <div>
            <p className="bh-earnest-modal__eyebrow">Pipeline Action</p>
            <div className="bh-earnest-modal__title-row">
              <h2 id="closing-modal-title">Closing</h2>
              <span
                className={`bh-earnest-modal__status-pill bh-earnest-modal__status-pill--${closing?.stepStatus || "locked"}`}
              >
                {closing ? formatStatusLabel(closing.stepStatus) : "Loading"}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </div>

        {loading ? (
          <div className="bh-earnest-modal__state">Loading closing details...</div>
        ) : null}

        {!loading && closing ? (
          <>
            {closing.promptToUser ? (
              <div className="bh-earnest-modal__prompt">{closing.promptToUser}</div>
            ) : null}

            {closing.evidenceDocument.filename ? (
              <div className="bh-earnest-modal__meta-grid">
                <div className="bh-earnest-modal__meta-card">
                  <span className="bh-earnest-modal__meta-label">Closing Document</span>
                  <strong>{closing.evidenceDocument.filename}</strong>
                  <span>ALTA statement detected</span>
                </div>
              </div>
            ) : null}

            {closing.latestEmailAnalysis.summary ||
            closing.latestEmailAnalysis.reason ||
            confidenceLabel ? (
              <div className="bh-earnest-modal__analysis">
                <div className="bh-earnest-modal__analysis-header">
                  <span>AI Summary</span>
                  {confidenceLabel ? <span>{confidenceLabel}</span> : null}
                </div>
                {closing.latestEmailAnalysis.summary ? (
                  <p>{closing.latestEmailAnalysis.summary}</p>
                ) : null}
                {closing.latestEmailAnalysis.reason ? (
                  <p className="bh-earnest-modal__analysis-reason">
                    {closing.latestEmailAnalysis.reason}
                  </p>
                ) : null}
                {closing.latestEmailAnalysis.threadId ? (
                  <a
                    className="bh-earnest-modal__thread-link"
                    href={`/property/${encodeURIComponent(closing.propertyId)}/inbox/${encodeURIComponent(closing.latestEmailAnalysis.threadId)}`}
                  >
                    View related email
                  </a>
                ) : null}
              </div>
            ) : null}

            {closing.pendingUserAction === "confirm_closing_complete" ? (
              <div className="bh-earnest-modal__confirm-card">
                <h3>Closing document received</h3>
                <p>
                  An ALTA closing document was received. If this deal is closed,
                  mark the pipeline complete.
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
                    {submitting ? "Saving..." : "Mark Complete"}
                  </button>
                </div>
              </div>
            ) : null}

            {closing.pendingUserAction === "none" ? (
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
