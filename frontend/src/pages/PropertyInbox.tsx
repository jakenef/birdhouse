import { useCallback, useEffect, useMemo, useState } from "react";

import { EmailComposer, type ComposerMode } from "../components/EmailComposer";
import { InboxDrawer } from "../components/InboxDrawer";
import { InboxThreadRow } from "../components/InboxThreadRow";
import { InboxTopBar } from "../components/InboxTopBar";
import {
  consumeInboxToast,
  listPropertyEmails,
  sendEmail,
} from "../services/inbox";
import type {
  ListPropertyEmailsResult,
  MailboxFilter,
  SendEmailInput,
  ThreadListItem,
} from "../types/email";

interface PropertyInboxProps {
  propertyId: string;
  onOpenThread: (threadId: string) => void;
}

function searchMatches(thread: ThreadListItem, search: string): boolean {
  if (search.trim().length === 0) {
    return true;
  }

  const query = search.toLowerCase();

  return (
    thread.subject.toLowerCase().includes(query) ||
    thread.snippet.toLowerCase().includes(query) ||
    (thread.fromName || "").toLowerCase().includes(query) ||
    thread.fromEmail.toLowerCase().includes(query)
  );
}

export function PropertyInbox({
  propertyId,
  onOpenThread,
}: PropertyInboxProps) {
  const [inbox, setInbox] = useState<ListPropertyEmailsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeMailbox, setActiveMailbox] = useState<MailboxFilter>("primary");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode] = useState<ComposerMode>("new");
  const [sendingCompose, setSendingCompose] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [demoThreads, setDemoThreads] = useState<ThreadListItem[]>([]);
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await listPropertyEmails(propertyId, {
        mailbox: activeMailbox,
      });
      setInbox(response);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load inbox.",
      );
    } finally {
      setLoading(false);
    }
  }, [propertyId, activeMailbox]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    const toast = consumeInboxToast(propertyId);
    if (!toast) {
      return;
    }

    setToastMessage(toast);
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [propertyId, inbox]);

  const visibleThreads = useMemo(() => {
    const baseThreads = inbox?.threads || [];
    const allThreads = [...demoThreads, ...baseThreads];

    if (allThreads.length === 0) {
      return [];
    }

    return allThreads.filter(
      (thread) =>
        thread.mailboxLabel === activeMailbox && searchMatches(thread, search),
    );
  }, [inbox, demoThreads, activeMailbox, search]);

  const fillDemoInbox = () => {
    const mockThreads: ThreadListItem[] = [
      {
        id: "demo-thread-1",
        subject: "Earnest Money Deposit Confirmation",
        fromName: "Sarah Johnson",
        fromEmail: "sarah@titleco.com",
        snippet:
          "We've received your earnest money deposit and it's being held in escrow...",
        sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        read: false,
        hasAttachments: true,
        mailboxLabel: "primary" as const,
        pipelineLabel: "earnest_money" as const,
      },
      {
        id: "demo-thread-2",
        subject: "Inspection Report Available",
        fromName: "Mike Chen",
        fromEmail: "mike@homeinspectors.com",
        snippet:
          "The full inspection report is now ready for your review. Overall the property is in good condition...",
        sentAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        read: false,
        hasAttachments: true,
        mailboxLabel: "primary" as const,
        pipelineLabel: "due_diligence_inspection" as const,
      },
      {
        id: "demo-thread-3",
        subject: "Title Search Complete",
        fromName: "Laura Martinez",
        fromEmail: "laura@titleco.com",
        snippet:
          "Good news! The preliminary title report came back clean with no major issues...",
        sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        read: true,
        hasAttachments: true,
        mailboxLabel: "primary" as const,
        pipelineLabel: "title_escrow" as const,
      },
    ];
    setDemoThreads(mockThreads);
  };

  const handleComposeSend = async (payload: SendEmailInput) => {
    setSendingCompose(true);
    try {
      await sendEmail(payload);
      await loadInbox();
    } finally {
      setSendingCompose(false);
    }
  };

  return (
    <section
      className="property-page bh-inbox-page"
      aria-label="Property inbox list"
    >
      <div className="demo-controls">
        {demoControlsOpen && (
          <div className="demo-controls__content">
            <button
              type="button"
              className="demo-controls__button"
              onClick={fillDemoInbox}
              disabled={demoThreads.length > 0}
            >
              Fill Inbox
            </button>
            {demoThreads.length > 0 && (
              <button
                type="button"
                className="demo-controls__button demo-controls__button--secondary"
                onClick={() => setDemoThreads([])}
              >
                Clear Demo
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="demo-controls__toggle"
          onClick={() => setDemoControlsOpen(!demoControlsOpen)}
          aria-expanded={demoControlsOpen}
          aria-label="Demo controls"
        >
          {demoControlsOpen ? "◀" : "▶"}
        </button>
      </div>

      <InboxTopBar
        searchValue={search}
        onSearchChange={setSearch}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {toastMessage ? <p className="bh-inbox-toast">{toastMessage}</p> : null}

      {loading ? (
        <ul className="bh-inbox-skeleton-list" aria-label="Loading inbox">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index} className="bh-inbox-skeleton-item" />
          ))}
        </ul>
      ) : errorMessage ? (
        <div className="state-card" role="alert">
          <h2>Unable to load inbox</h2>
          <p>{errorMessage}</p>
          <button
            type="button"
            className="state-card__action"
            onClick={() => void loadInbox()}
          >
            Retry
          </button>
        </div>
      ) : visibleThreads.length === 0 ? (
        <div className="state-card" role="status" aria-live="polite">
          <h2>No emails yet</h2>
          <p>
            Forward emails/documents to the property inbox to start the thread.
          </p>
        </div>
      ) : (
        <div className="bh-inbox-list-wrap" aria-label="Email thread list">
          <ul className="bh-inbox-list">
            {visibleThreads.map((thread) => (
              <InboxThreadRow
                key={thread.id}
                thread={thread}
                onOpenThread={onOpenThread}
              />
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        className="bh-inbox-compose-fab"
        onClick={() => setComposeOpen(true)}
        aria-label="Compose"
      >
        <ComposeIcon />
        Compose
      </button>

      <InboxDrawer
        open={drawerOpen}
        activeMailbox={activeMailbox}
        mailboxOptions={inbox?.mailboxOptions || []}
        propertyEmail={inbox?.propertyEmail || null}
        propertyLabel="Property inbox"
        onClose={() => setDrawerOpen(false)}
        onSelectMailbox={(mailbox) => {
          setActiveMailbox(mailbox);
        }}
      />

      <EmailComposer
        open={composeOpen}
        mode={composeMode}
        sending={sendingCompose}
        canSend={inbox?.capabilities.canSend ?? true}
        propertyId={propertyId}
        onClose={() => setComposeOpen(false)}
        onSend={handleComposeSend}
      />
    </section>
  );
}

function ComposeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.8 17.7 17.3 4.2a2 2 0 0 1 2.9 2.9L6.7 20.6 3 21l.8-3.3ZM13 6.8l4.2 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
