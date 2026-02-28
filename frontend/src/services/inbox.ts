import type {
  DeleteEmailInput,
  DeleteEmailResult,
  EmailAttachment,
  EmailMessage,
  EmailParticipant,
  ListPropertyEmailsOptions,
  ListPropertyEmailsResult,
  MailboxFilter,
  MailboxOption,
  SendEmailInput,
  SendEmailResult,
  ThreadDetail,
  ThreadListItem,
} from "../types/email";

const DELETED_THREADS_PREFIX = "property_inbox_deleted_threads";
const INBOX_TOAST_PREFIX = "property_inbox_toast";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEmailParticipant(value: unknown): value is EmailParticipant {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    (typeof value.name === "string" || value.name === null)
  );
}

function isEmailAttachment(value: unknown): value is EmailAttachment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.filename === "string" &&
    typeof value.mime_type === "string" &&
    typeof value.size_bytes === "number" &&
    typeof value.download_url === "string"
  );
}

type ApiThread = {
  id: string;
  subject: string;
  participants: EmailParticipant[];
  preview: string;
  message_count: number;
  has_attachments: boolean;
  unread: boolean;
  last_message_at: string;
  last_message_from: string;
  created_at: string;
};

type ApiListResponse = {
  property_email: string | null;
  threads: ApiThread[];
};

function isApiThread(value: unknown): value is ApiThread {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subject === "string" &&
    Array.isArray(value.participants) &&
    value.participants.every((participant) => isEmailParticipant(participant)) &&
    typeof value.preview === "string" &&
    typeof value.message_count === "number" &&
    typeof value.has_attachments === "boolean" &&
    typeof value.unread === "boolean" &&
    typeof value.last_message_at === "string" &&
    typeof value.last_message_from === "string" &&
    typeof value.created_at === "string"
  );
}

function isApiListResponse(value: unknown): value is ApiListResponse {
  return (
    isRecord(value) &&
    (typeof value.property_email === "string" || value.property_email === null) &&
    Array.isArray(value.threads) &&
    value.threads.every((thread) => isApiThread(thread))
  );
}

type ApiThreadDetail = {
  id: string;
  subject: string;
  participants: EmailParticipant[];
  created_at: string;
};

type ApiMessage = {
  id: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  subject: string;
  body_text: string;
  body_html: string | null;
  attachments: EmailAttachment[];
  sent_at: string;
  read: boolean;
  direction: "inbound" | "outbound";
};

type ApiDetailResponse = {
  thread: ApiThreadDetail;
  messages: ApiMessage[];
};

function isApiThreadDetail(value: unknown): value is ApiThreadDetail {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subject === "string" &&
    Array.isArray(value.participants) &&
    value.participants.every((participant) => isEmailParticipant(participant)) &&
    typeof value.created_at === "string"
  );
}

function isApiMessage(value: unknown): value is ApiMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isEmailParticipant(value.from) &&
    Array.isArray(value.to) &&
    value.to.every((recipient) => isEmailParticipant(recipient)) &&
    Array.isArray(value.cc) &&
    value.cc.every((recipient) => isEmailParticipant(recipient)) &&
    typeof value.subject === "string" &&
    typeof value.body_text === "string" &&
    (typeof value.body_html === "string" || value.body_html === null) &&
    Array.isArray(value.attachments) &&
    value.attachments.every((attachment) => isEmailAttachment(attachment)) &&
    typeof value.sent_at === "string" &&
    typeof value.read === "boolean" &&
    (value.direction === "inbound" || value.direction === "outbound")
  );
}

function isApiDetailResponse(value: unknown): value is ApiDetailResponse {
  return (
    isRecord(value) &&
    isApiThreadDetail(value.thread) &&
    Array.isArray(value.messages) &&
    value.messages.every((message) => isApiMessage(message))
  );
}

type ApiSendResponse = {
  message: {
    id: string;
    thread_id: string;
    sent_at: string;
    from: string;
    to: string[];
    subject: string;
  };
};

function isApiSendResponse(value: unknown): value is ApiSendResponse {
  return (
    isRecord(value) &&
    isRecord(value.message) &&
    typeof value.message.id === "string" &&
    typeof value.message.thread_id === "string" &&
    typeof value.message.sent_at === "string" &&
    typeof value.message.from === "string" &&
    Array.isArray(value.message.to) &&
    value.message.to.every((recipient) => typeof recipient === "string") &&
    typeof value.message.subject === "string"
  );
}

function normalizeThread(
  thread: ApiThread,
  propertyEmail: string | null,
): ThreadListItem {
  const sender = thread.participants.find(
    (participant) => participant.email === thread.last_message_from,
  );

  return {
    id: thread.id,
    subject: thread.subject,
    snippet: thread.preview,
    participants: thread.participants,
    messageCount: thread.message_count,
    hasAttachments: thread.has_attachments,
    unread: thread.unread,
    updatedAt: thread.last_message_at,
    createdAt: thread.created_at,
    fromEmail: thread.last_message_from,
    fromName:
      sender?.email === propertyEmail
        ? "You"
        : sender?.name || sender?.email || thread.last_message_from,
  };
}

function normalizeMessage(apiMessage: ApiMessage): EmailMessage {
  return {
    id: apiMessage.id,
    from: apiMessage.from,
    to: apiMessage.to,
    cc: apiMessage.cc,
    subject: apiMessage.subject,
    bodyText: apiMessage.body_text,
    bodyHtml: apiMessage.body_html,
    attachments: apiMessage.attachments,
    sentAt: apiMessage.sent_at,
    read: apiMessage.read,
    direction: apiMessage.direction,
  };
}

function getDeletedThreadStorageKey(propertyId: string): string {
  return `${DELETED_THREADS_PREFIX}:${propertyId}`;
}

function readDeletedThreadIds(propertyId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(getDeletedThreadStorageKey(propertyId));
    if (!raw) {
      return new Set<string>();
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function writeDeletedThreadIds(propertyId: string, ids: Set<string>): void {
  window.localStorage.setItem(
    getDeletedThreadStorageKey(propertyId),
    JSON.stringify(Array.from(ids)),
  );
}

function mailboxMatchesThread(
  mailbox: MailboxFilter,
  thread: ThreadListItem,
  propertyEmail: string | null,
): boolean {
  if (mailbox === "primary" || mailbox === "all") {
    return true;
  }

  if (mailbox === "sent") {
    return propertyEmail !== null && thread.fromEmail === propertyEmail;
  }

  return false;
}

function searchMatches(search: string, thread: ThreadListItem): boolean {
  if (search.trim().length === 0) {
    return true;
  }

  const query = search.toLowerCase();

  return (
    thread.subject.toLowerCase().includes(query) ||
    thread.snippet.toLowerCase().includes(query) ||
    (thread.fromName || "").toLowerCase().includes(query) ||
    thread.fromEmail.toLowerCase().includes(query) ||
    thread.participants.some((participant) =>
      `${participant.name || ""} ${participant.email}`
        .toLowerCase()
        .includes(query),
    )
  );
}

function buildMailboxOptions(threads: ThreadListItem[], propertyEmail: string | null): MailboxOption[] {
  const sentCount =
    propertyEmail === null
      ? 0
      : threads.filter((thread) => thread.fromEmail === propertyEmail).length;

  return [
    { id: "primary", label: "Primary", count: threads.length },
    { id: "sent", label: "Sent", count: sentCount },
    { id: "starred", label: "Starred", disabled: true, reason: "Not supported by backend mock endpoints" },
    { id: "drafts", label: "Drafts", disabled: true, reason: "No drafts endpoint in backend mock" },
    { id: "trash", label: "Trash", disabled: true, reason: "Delete is local-only in mock mode" },
  ];
}

export async function listPropertyEmails(
  propertyId: string,
  options?: ListPropertyEmailsOptions,
): Promise<ListPropertyEmailsResult> {
  const response = await fetch(
    `/api/properties/${encodeURIComponent(propertyId)}/inbox`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch inbox (${response.status}).`);
  }

  const payload: unknown = await response.json();

  if (!isApiListResponse(payload)) {
    throw new Error("Invalid inbox response payload.");
  }

  const normalizedThreads = payload.threads.map((thread) =>
    normalizeThread(thread, payload.property_email),
  );

  const deletedThreadIds = readDeletedThreadIds(propertyId);

  const mailbox = options?.mailbox || "primary";
  const filteredThreads = normalizedThreads
    .filter((thread) => !deletedThreadIds.has(thread.id))
    .filter((thread) => mailboxMatchesThread(mailbox, thread, payload.property_email))
    .filter((thread) => searchMatches(options?.search || "", thread))
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return {
    propertyEmail: payload.property_email,
    threads: filteredThreads,
    mailboxOptions: buildMailboxOptions(normalizedThreads, payload.property_email),
    capabilities: {
      canSend: true,
      canDelete: false,
      canStar: false,
      supportsMailboxServerFiltering: false,
    },
  };
}

export async function getEmailThread(
  propertyId: string,
  threadId: string,
): Promise<ThreadDetail> {
  const response = await fetch(
    `/api/properties/${encodeURIComponent(propertyId)}/inbox/${encodeURIComponent(threadId)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch thread (${response.status}).`);
  }

  const payload: unknown = await response.json();

  if (!isApiDetailResponse(payload)) {
    throw new Error("Invalid thread response payload.");
  }

  return {
    id: payload.thread.id,
    subject: payload.thread.subject,
    participants: payload.thread.participants,
    createdAt: payload.thread.created_at,
    messages: payload.messages
      .map((message) => normalizeMessage(message))
      .sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
      ),
  };
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const response = await fetch(
    `/api/properties/${encodeURIComponent(input.propertyId)}/inbox/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
        body_html: input.bodyHtml,
        reply_to_message_id: input.replyToMessageId,
        reply_to_thread_id: input.replyToThreadId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to send email (${response.status}).`);
  }

  const payload: unknown = await response.json();

  if (!isApiSendResponse(payload)) {
    throw new Error("Invalid send response payload.");
  }

  return {
    id: payload.message.id,
    threadId: payload.message.thread_id,
    sentAt: payload.message.sent_at,
    from: payload.message.from,
    to: payload.message.to,
    subject: payload.message.subject,
  };
}

export async function deleteEmail(
  input: DeleteEmailInput,
): Promise<DeleteEmailResult> {
  const deletedThreadIds = readDeletedThreadIds(input.propertyId);
  deletedThreadIds.add(input.threadId);
  writeDeletedThreadIds(input.propertyId, deletedThreadIds);

  window.sessionStorage.setItem(
    `${INBOX_TOAST_PREFIX}:${input.propertyId}`,
    "Mock: deleted locally",
  );

  return {
    deleted: true,
    localOnly: true,
    message: "Mock: deleted locally",
  };
}

export function consumeInboxToast(propertyId: string): string | null {
  const key = `${INBOX_TOAST_PREFIX}:${propertyId}`;
  const value = window.sessionStorage.getItem(key);
  if (!value) {
    return null;
  }

  window.sessionStorage.removeItem(key);
  return value;
}
