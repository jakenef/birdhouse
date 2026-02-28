import type { MailboxFilter, MailboxOption } from "../types/email";

interface InboxDrawerProps {
  open: boolean;
  activeMailbox: MailboxFilter;
  mailboxOptions: MailboxOption[];
  propertyEmail?: string | null;
  propertyLabel?: string | null;
  onClose: () => void;
  onSelectMailbox: (mailbox: MailboxFilter) => void;
}

export function InboxDrawer({
  open,
  activeMailbox,
  mailboxOptions,
  propertyEmail,
  propertyLabel,
  onClose,
  onSelectMailbox,
}: InboxDrawerProps) {
  return (
    <>
      <div
        className={`bh-inbox-drawer-scrim${open ? " is-open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`bh-inbox-drawer${open ? " is-open" : ""}`}
        aria-hidden={!open}
        aria-label="Mailbox filters"
      >
        <div className="bh-inbox-drawer__header">
          <div className="bh-inbox-drawer__title-row">
            <InboxGlyph />
            <h2>Inbox</h2>
          </div>
          <p className="bh-inbox-drawer__subhead">
            {propertyLabel || "Property mailbox"}
          </p>
          {propertyEmail ? (
            <p className="bh-inbox-drawer__email-chip">{propertyEmail}</p>
          ) : null}
        </div>

        <ul className="bh-inbox-drawer__list">
          {mailboxOptions.map((option) => {
            const active = option.id === activeMailbox;

            return (
              <li key={option.id}>
                <button
                  type="button"
                  className={`bh-inbox-drawer__item${active ? " is-active" : ""}${option.disabled ? " is-disabled" : ""}`}
                  onClick={() => {
                    if (!option.disabled) {
                      onSelectMailbox(option.id);
                    }
                    onClose();
                  }}
                  disabled={option.disabled}
                  title={option.reason || option.label}
                >
                  <span className="bh-inbox-drawer__item-left">
                    <MailboxIcon id={option.id} />
                    <span>{option.label}</span>
                  </span>
                  {option.badgeText ? (
                    <span className="bh-inbox-drawer__badge">{option.badgeText}</span>
                  ) : typeof option.count === "number" ? (
                    <span className="bh-inbox-drawer__count">{option.count}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}

function InboxGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.2 8.2A1.2 1.2 0 0 1 6.4 7h11.2a1.2 1.2 0 0 1 1.2 1.2v8.9a1.7 1.7 0 0 1-1.7 1.7H6.9a1.7 1.7 0 0 1-1.7-1.7V8.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M5.2 12.1h4.1l1.5 2h3.4l1.5-2h4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailboxIcon({ id }: { id: MailboxFilter }) {
  if (id === "starred") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3.6 2.8 5.6 6.2.9-4.5 4.3 1 6.2L12 17.7 6.5 20.6l1-6.2L3 10.1l6.2-.9L12 3.6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (id === "sent") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12.2 20 4.5l-4 15-4.2-5-4.4-.2L4 12.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (id === "drafts") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.8A1.3 1.3 0 0 1 5.8 5.5h12.4a1.3 1.3 0 0 1 1.3 1.3v10.4a1.3 1.3 0 0 1-1.3 1.3H5.8a1.3 1.3 0 0 1-1.3-1.3V6.8Zm1 0L12 11.3l6.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }

  if (id === "trash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 7h11l-.8 11.2a1.3 1.3 0 0 1-1.3 1.2H8.6a1.3 1.3 0 0 1-1.3-1.2L6.5 7Zm2-2.4h7M10 10.2v6.5m4-6.5v6.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7A1.5 1.5 0 0 1 6 5.5h12A1.5 1.5 0 0 1 19.5 7v8.8a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7V7Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4.5 11.6h4.2l1.5 2h3.6l1.5-2h4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
