import type { ThreadListItem } from "../types/email";

interface InboxThreadRowProps {
  thread: ThreadListItem;
  onOpenThread: (threadId: string) => void;
}

function formatThreadTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function InboxThreadRow({ thread, onOpenThread }: InboxThreadRowProps) {
  return (
    <li>
      <button
        type="button"
        className={`bh-inbox-row${thread.unread ? " is-unread" : ""}`}
        onClick={() => onOpenThread(thread.id)}
      >
        <div className="bh-inbox-row__content">
          <p className="bh-inbox-row__from">{thread.fromName || thread.fromEmail}</p>
          <p className="bh-inbox-row__subject">{thread.subject}</p>
          <p className="bh-inbox-row__snippet">{thread.snippet}</p>
        </div>

        <div className="bh-inbox-row__meta">
          <time dateTime={thread.updatedAt}>{formatThreadTime(thread.updatedAt)}</time>
          {thread.unread ? <span className="bh-inbox-row__dot" aria-hidden="true" /> : null}
          {thread.hasAttachments ? <AttachmentIcon /> : null}
        </div>
      </button>
    </li>
  );
}

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bh-inbox-row__attachment">
      <path
        d="M8.1 12.8 14 6.9a2.7 2.7 0 0 1 3.8 3.8l-6.4 6.4a4.1 4.1 0 1 1-5.8-5.8l6.2-6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
