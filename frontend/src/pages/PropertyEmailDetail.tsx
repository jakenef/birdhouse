import { useCallback, useEffect, useMemo, useState } from "react";

import { EmailComposer, type ComposerMode } from "../components/EmailComposer";
import { EmailMessage } from "../components/EmailMessage";
import { PropertyHomeButton } from "../components/PropertyHomeButton";
import { getPropertyDocuments } from "../services/documents";
import { deleteEmail, getEmailThread, sendEmail } from "../services/inbox";
import type { EmailAttachment, SendEmailInput, ThreadDetail } from "../types/email";
import type { Document } from "../types/document";

interface PropertyEmailDetailProps {
  propertyId: string;
  threadId: string;
  onBackToHome: () => void;
  onBackToInbox: () => void;
}

interface AttachmentViewerState {
  attachment: EmailAttachment;
  resolvedUrl: string | null;
  resolving: boolean;
  errorMessage: string | null;
}

function getPropertyEmail(thread: ThreadDetail): string | null {
  const outbound = thread.messages.find((message) => message.direction === "outbound");
  return outbound?.from.email || null;
}

function replyRecipients(thread: ThreadDetail, propertyEmail: string | null): string[] {
  const newestInbound = [...thread.messages]
    .filter((message) => message.direction === "inbound")
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];

  if (newestInbound) {
    return [newestInbound.from.email];
  }

  const participant = thread.participants.find(
    (candidate) => candidate.email !== propertyEmail,
  );

  return participant ? [participant.email] : [];
}

function buildForwardBody(thread: ThreadDetail): string {
  const latest = thread.messages[thread.messages.length - 1];
  if (!latest) {
    return "";
  }

  return [
    "\n\n---------- Forwarded message ----------",
    `From: ${latest.from.name || latest.from.email} <${latest.from.email}>`,
    `Date: ${latest.sentAt}`,
    `Subject: ${latest.subject}`,
    `To: ${latest.to.map((recipient) => recipient.email).join(", ")}`,
    "",
    latest.bodyText,
  ].join("\n");
}

export function PropertyEmailDetail({
  propertyId,
  threadId,
  onBackToHome,
  onBackToInbox,
}: PropertyEmailDetailProps) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [composerSending, setComposerSending] = useState(false);
  const [viewerState, setViewerState] = useState<AttachmentViewerState | null>(null);
  const [propertyDocuments, setPropertyDocuments] = useState<Document[] | null>(null);

  const loadThread = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await getEmailThread(propertyId, threadId);
      setDetail(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load thread.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, threadId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    setPropertyDocuments(null);
  }, [propertyId]);

  const propertyEmail = useMemo(() => {
    if (!detail) {
      return null;
    }

    return getPropertyEmail(detail);
  }, [detail]);

  const latestMessageId = detail?.messages[detail.messages.length - 1]?.id;

  const replyTo = useMemo(() => {
    if (!detail) {
      return [];
    }

    return replyRecipients(detail, propertyEmail);
  }, [detail, propertyEmail]);

  const composerDefaults = useMemo(() => {
    if (!detail) {
      return {
        to: [] as string[],
        subject: "",
        body: "",
      };
    }

    if (composerMode === "forward") {
      const subject = /^fwd:/i.test(detail.subject)
        ? detail.subject
        : `Fwd: ${detail.subject}`;

      return {
        to: [],
        subject,
        body: buildForwardBody(detail),
      };
    }

    const subject = /^re:/i.test(detail.subject)
      ? detail.subject
      : `Re: ${detail.subject}`;

    return {
      to: replyTo,
      subject,
      body: "",
    };
  }, [composerMode, detail, replyTo]);

  const handleDelete = async () => {
    await deleteEmail({ propertyId, threadId });
    onBackToInbox();
  };

  const handleComposerSend = async (payload: SendEmailInput) => {
    setComposerSending(true);
    try {
      await sendEmail({
        ...payload,
        replyToThreadId: composerMode === "reply" ? threadId : undefined,
        replyToMessageId: composerMode === "reply" ? latestMessageId : undefined,
      });
      await loadThread();
    } finally {
      setComposerSending(false);
    }
  };

  const closeViewer = () => {
    setViewerState(null);
  };

  const getCachedPropertyDocuments = useCallback(async (): Promise<Document[]> => {
    if (propertyDocuments) {
      return propertyDocuments;
    }

    const response = await getPropertyDocuments(propertyId);
    setPropertyDocuments(response.property.documents);
    return response.property.documents;
  }, [propertyDocuments, propertyId]);

  const resolveAttachmentUrl = useCallback(
    async (attachment: EmailAttachment): Promise<string | null> => {
      const directUrl = attachment.download_url;
      if (!directUrl.includes("/inbox/")) {
        return directUrl;
      }

      try {
        const documents = await getCachedPropertyDocuments();
        const match = findDocumentMatch(attachment, documents);
        return match?.download_url || null;
      } catch {
        return null;
      }
    },
    [getCachedPropertyDocuments],
  );

  const openAttachment = useCallback(
    async (attachment: EmailAttachment) => {
      setViewerState({
        attachment,
        resolvedUrl: null,
        resolving: true,
        errorMessage: null,
      });

      const resolvedUrl = await resolveAttachmentUrl(attachment);
      if (resolvedUrl) {
        setViewerState({
          attachment,
          resolvedUrl,
          resolving: false,
          errorMessage: null,
        });
        return;
      }

      setViewerState({
        attachment,
        resolvedUrl: null,
        resolving: false,
        errorMessage:
          "This attachment route is unavailable in the current backend mock, and no matching property document was found.",
      });
    },
    [resolveAttachmentUrl],
  );

  return (
    <section className="property-page bh-email-detail-page" aria-label="Property email detail">
      <PropertyHomeButton onClick={onBackToHome} />

      <header className="bh-email-detail-header">
        <button type="button" className="back-link" onClick={onBackToInbox}>
          <ChevronLeftIcon />
          Inbox
        </button>

        <div className="bh-email-detail-header__actions">
          <button
            type="button"
            className="bh-email-detail-action"
            onClick={handleDelete}
            title="Delete (mock: local only)"
          >
            <TrashIcon />
          </button>
          <button
            type="button"
            className="bh-email-detail-action"
            onClick={() => {
              setComposerMode("reply");
              setComposerOpen(true);
            }}
            title="Reply"
          >
            <ReplyIcon />
          </button>
          <button
            type="button"
            className="bh-email-detail-action"
            onClick={() => {
              setComposerMode("forward");
              setComposerOpen(true);
            }}
            title="Forward"
          >
            <ForwardIcon />
          </button>
        </div>
      </header>

      {loading ? (
        <ul className="bh-inbox-skeleton-list" aria-label="Loading thread">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="bh-inbox-skeleton-item" />
          ))}
        </ul>
      ) : errorMessage ? (
        <div className="state-card" role="alert">
          <h2>Unable to load thread</h2>
          <p>{errorMessage}</p>
          <button type="button" className="state-card__action" onClick={() => void loadThread()}>
            Retry
          </button>
        </div>
      ) : !detail ? (
        <div className="state-card">
          <h2>Thread unavailable</h2>
          <p>This email thread could not be loaded.</p>
        </div>
      ) : (
        <>
          <section className="bh-email-detail-subject">
            <h1>{detail.subject}</h1>
            <p>
              {detail.participants.map((participant) => participant.name || participant.email).join(", ")}
            </p>
          </section>

          <div className="bh-email-detail-messages" aria-label="Thread messages">
            {detail.messages.map((message) => (
              <EmailMessage
                key={message.id}
                message={message}
                onOpenAttachment={openAttachment}
              />
            ))}
          </div>
        </>
      )}

      {viewerState ? (
        <div className="document-viewer-backdrop" onClick={closeViewer}>
          <section
            className="document-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Attachment viewer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="document-viewer__header">
              <div className="document-viewer__meta">
                <h2>{viewerState.attachment.filename}</h2>
                <p>{viewerState.attachment.mime_type}</p>
              </div>
              <button type="button" className="document-viewer__close" onClick={closeViewer}>
                Close
              </button>
            </header>

            <div className="document-viewer__content">
              {viewerState.resolving ? (
                <div className="document-viewer__fallback">
                  <p>Opening attachment...</p>
                </div>
              ) : viewerState.resolvedUrl && isPdfAttachment(viewerState.attachment) ? (
                <iframe
                  src={`${viewerState.resolvedUrl}#toolbar=1&navpanes=0&view=FitH`}
                  title={viewerState.attachment.filename}
                />
              ) : viewerState.resolvedUrl ? (
                <div className="document-viewer__fallback">
                  <p>This file type cannot be previewed inline yet.</p>
                  <a href={viewerState.resolvedUrl} download={viewerState.attachment.filename}>
                    Download file
                  </a>
                </div>
              ) : (
                <div className="document-viewer__fallback">
                  <p>{viewerState.errorMessage || "Unable to open this attachment."}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <EmailComposer
        open={composerOpen}
        mode={composerMode}
        sending={composerSending}
        canSend={true}
        propertyId={propertyId}
        initialTo={composerDefaults.to}
        initialSubject={composerDefaults.subject}
        initialBody={composerDefaults.body}
        hideToField={composerMode === "reply"}
        replyToThreadId={composerMode === "reply" ? threadId : undefined}
        replyToMessageId={composerMode === "reply" ? latestMessageId : undefined}
        onClose={() => setComposerOpen(false)}
        onSend={handleComposerSend}
      />
    </section>
  );
}

function isPdfAttachment(attachment: EmailAttachment): boolean {
  return attachment.mime_type.toLowerCase().includes("pdf");
}

function toComparableFileKey(filename: string): string {
  const lower = filename.trim().toLowerCase();
  const withoutQuery = lower.split("?")[0];
  const withoutExt = withoutQuery.replace(/\.[a-z0-9]+$/i, "");
  return withoutExt.replace(/[^a-z0-9]/g, "");
}

function findDocumentMatch(
  attachment: EmailAttachment,
  documents: Document[],
): Document | null {
  const attachmentName = attachment.filename.trim().toLowerCase();
  const exactMatch =
    documents.find(
      (document) => document.filename.trim().toLowerCase() === attachmentName,
    ) || null;
  if (exactMatch) {
    return exactMatch;
  }

  const attachmentKey = toComparableFileKey(attachment.filename);
  return (
    documents.find(
      (document) => toComparableFileKey(document.filename) === attachmentKey,
    ) || null
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.72 5.22a1 1 0 0 1 .06 1.41L9.42 12l5.36 5.37a1 1 0 0 1-1.41 1.41l-6.07-6.07a1 1 0 0 1 0-1.42l6.07-6.07a1 1 0 0 1 1.35 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 7h11l-.8 11.2a1.3 1.3 0 0 1-1.3 1.2H8.6a1.3 1.3 0 0 1-1.3-1.2L6.5 7Zm2-2.4h7M10 10.2v6.5m4-6.5v6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m9.2 7.2-4.6 4.8 4.6 4.8M5 12h8.5c3.2 0 5.5 2 5.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m14.8 7.2 4.6 4.8-4.6 4.8M19 12h-8.5c-3.2 0-5.5 2-5.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
