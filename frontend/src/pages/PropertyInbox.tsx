import { useCallback, useEffect, useMemo, useState } from "react";

import { EmailComposer, type ComposerMode } from "../components/EmailComposer";
import { InboxDrawer } from "../components/InboxDrawer";
import { InboxThreadRow } from "../components/InboxThreadRow";
import { InboxTopBar } from "../components/InboxTopBar";
import { PropertyHomeButton } from "../components/PropertyHomeButton";
import { consumeInboxToast, listPropertyEmails, sendEmail } from "../services/inbox";
import type {
  ListPropertyEmailsResult,
  MailboxFilter,
  SendEmailInput,
  ThreadListItem,
} from "../types/email";

interface PropertyInboxProps {
  propertyId: string;
  onBackToHome: () => void;
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
  onBackToHome,
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

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await listPropertyEmails(propertyId, {
        mailbox: activeMailbox,
      });
      setInbox(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load inbox.");
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
    if (!inbox) {
      return [];
    }

    return inbox.threads.filter((thread) => searchMatches(thread, search));
  }, [inbox, search]);

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
    <section className="property-page bh-inbox-page" aria-label="Property inbox list">
      <PropertyHomeButton onClick={onBackToHome} />

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
          <button type="button" className="state-card__action" onClick={() => void loadInbox()}>
            Retry
          </button>
        </div>
      ) : visibleThreads.length === 0 ? (
        <div className="state-card" role="status" aria-live="polite">
          <h2>No emails yet</h2>
          <p>Forward emails/documents to the property inbox to start the thread.</p>
        </div>
      ) : (
        <div className="bh-inbox-list-wrap" aria-label="Email thread list">
          <ul className="bh-inbox-list">
            {visibleThreads.map((thread) => (
              <InboxThreadRow key={thread.id} thread={thread} onOpenThread={onOpenThread} />
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
