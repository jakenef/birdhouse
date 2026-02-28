export type MailboxFilter =
  | "primary"
  | "all"
  | "starred"
  | "sent"
  | "drafts"
  | "trash";

export interface MailboxOption {
  id: MailboxFilter;
  label: string;
  count?: number;
  badgeText?: string;
  disabled?: boolean;
  reason?: string;
}

export interface EmailParticipant {
  email: string;
  name: string | null;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  download_url: string;
}

export interface ThreadListItem {
  id: string;
  subject: string;
  snippet: string;
  participants: EmailParticipant[];
  messageCount: number;
  hasAttachments: boolean;
  unread: boolean;
  updatedAt: string;
  createdAt: string;
  fromEmail: string;
  fromName: string | null;
}

export interface EmailMessage {
  id: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  attachments: EmailAttachment[];
  sentAt: string;
  read: boolean;
  direction: "inbound" | "outbound";
}

export interface ThreadDetail {
  id: string;
  subject: string;
  participants: EmailParticipant[];
  createdAt: string;
  messages: EmailMessage[];
}

export interface ListPropertyEmailsOptions {
  mailbox?: MailboxFilter;
  search?: string;
}

export interface ListPropertyEmailsResult {
  propertyEmail: string | null;
  threads: ThreadListItem[];
  mailboxOptions: MailboxOption[];
  capabilities: {
    canSend: boolean;
    canDelete: boolean;
    canStar: boolean;
    supportsMailboxServerFiltering: boolean;
  };
}

export interface SendEmailInput {
  propertyId: string;
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  bodyHtml?: string;
  replyToMessageId?: string;
  replyToThreadId?: string;
}

export interface SendEmailResult {
  id: string;
  threadId: string;
  sentAt: string;
  from: string;
  to: string[];
  subject: string;
}

export interface DeleteEmailInput {
  propertyId: string;
  threadId: string;
}

export interface DeleteEmailResult {
  deleted: boolean;
  localOnly: boolean;
  message: string;
}
