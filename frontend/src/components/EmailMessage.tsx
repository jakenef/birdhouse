import type {
  EmailAttachment,
  EmailMessage as EmailMessageModel,
} from "../types/email";

interface EmailMessageProps {
  message: EmailMessageModel;
  onOpenAttachment?: (attachment: EmailAttachment) => void | Promise<void>;
}

function formatSentTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatParticipant(email: string, name: string | null): string {
  if (name && name.trim().length > 0) {
    return `${name} <${email}>`;
  }

  return email;
}

export function EmailMessage({ message, onOpenAttachment }: EmailMessageProps) {
  return (
    <article className={`bh-email-message${message.direction === "outbound" ? " is-outbound" : ""}`}>
      <header className="bh-email-message__header">
        <div className="bh-email-message__header-left">
          <p className="bh-email-message__from">
            {formatParticipant(message.from.email, message.from.name)}
          </p>
          <p className="bh-email-message__to">
            To {message.to.map((participant) => participant.email).join(", ") || "Unknown"}
          </p>
        </div>

        <time className="bh-email-message__time" dateTime={message.sentAt}>
          {formatSentTime(message.sentAt)}
        </time>
      </header>

      <div className="bh-email-message__body">{message.bodyText}</div>

      {message.attachments.length > 0 ? (
        <ul className="bh-email-message__attachments" aria-label="Attachments">
          {message.attachments.map((attachment) => (
            <li key={attachment.id}>
              {onOpenAttachment ? (
                <button
                  type="button"
                  onClick={() => onOpenAttachment(attachment)}
                  aria-label={`Open ${attachment.filename}`}
                >
                  {attachment.filename}
                </button>
              ) : (
                <a href={attachment.download_url} target="_blank" rel="noopener noreferrer">
                  {attachment.filename}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
