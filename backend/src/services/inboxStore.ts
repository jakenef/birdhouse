import { randomUUID } from "crypto";
import { eq, and, desc, or, sql } from "drizzle-orm";

import { db } from "../db";
import { inboxMessages, type NewInboxMessage } from "../db/schema";
import { normalizeSubject, subjectThreadId } from "../utils/emailThreading";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredInboxMessage {
  id: string;
  resend_email_id: string | null;
  property_id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  to: Array<{ email: string; name: string | null }>;
  cc: Array<{ email: string; name: string | null }>;
  bcc: Array<{ email: string; name: string | null }>;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  references: string[];
  has_attachments: boolean;
  read: boolean;
  sent_at: string;
  read_at: string | null;
  created_at: string;
}

export interface InboxThread {
  id: string;
  subject: string;
  participants: Array<{ email: string; name: string | null }>;
  preview: string;
  message_count: number;
  has_attachments: boolean;
  unread: boolean;
  last_message_at: string;
  last_message_from: string;
  created_at: string;
}

export interface CreateInboxMessageInput {
  resendEmailId?: string;
  propertyId: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  fromName?: string | null;
  to: Array<{ email: string; name: string | null }>;
  cc?: Array<{ email: string; name: string | null }>;
  bcc?: Array<{ email: string; name: string | null }>;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  hasAttachments?: boolean;
  sentAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `im_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function parseJsonArray(
  json: string | null | undefined,
): Array<{ email: string; name: string | null }> {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function rowToStored(
  row: typeof inboxMessages.$inferSelect,
): StoredInboxMessage {
  return {
    id: row.id,
    resend_email_id: row.resendEmailId,
    property_id: row.propertyId,
    thread_id: row.threadId,
    direction: row.direction as "inbound" | "outbound",
    from_email: row.fromEmail,
    from_name: row.fromName,
    to: parseJsonArray(row.toJson),
    cc: parseJsonArray(row.ccJson),
    bcc: parseJsonArray(row.bccJson),
    subject: row.subject,
    body_text: row.bodyText,
    body_html: row.bodyHtml,
    message_id: row.messageId,
    in_reply_to: row.inReplyTo,
    references: parseStringArray(row.referencesJson),
    has_attachments: row.hasAttachments === 1,
    read: row.read === 1,
    sent_at: row.sentAt,
    read_at: row.readAt,
    created_at: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// InboxStore
// ---------------------------------------------------------------------------

export class InboxStore {
  /**
   * Compute the thread_id for a new message.
   *
   * 1. If inReplyTo or references[] match an existing message_id in
   *    inbox_messages for this property → use that message's thread_id.
   * 2. Otherwise, generate a deterministic thread_id from normalised
   *    subject + property_id (subject-based fallback).
   */
  async computeThreadId(input: {
    propertyId: string;
    subject: string;
    inReplyTo?: string | null;
    references?: string[];
  }): Promise<string> {
    // Strategy 1: match against In-Reply-To header
    if (input.inReplyTo) {
      const parent = await db
        .select({ threadId: inboxMessages.threadId })
        .from(inboxMessages)
        .where(
          and(
            eq(inboxMessages.propertyId, input.propertyId),
            eq(inboxMessages.messageId, input.inReplyTo),
          ),
        )
        .limit(1);
      if (parent.length > 0) return parent[0].threadId;
    }

    // Strategy 1b: match against References headers (walk from newest to oldest)
    if (input.references && input.references.length > 0) {
      for (const ref of [...input.references].reverse()) {
        const match = await db
          .select({ threadId: inboxMessages.threadId })
          .from(inboxMessages)
          .where(
            and(
              eq(inboxMessages.propertyId, input.propertyId),
              eq(inboxMessages.messageId, ref),
            ),
          )
          .limit(1);
        if (match.length > 0) return match[0].threadId;
      }
    }

    // Strategy 2: subject-based fallback
    const normalized = normalizeSubject(input.subject);
    const candidateThreadId = subjectThreadId(normalized, input.propertyId);

    // Check if any message already has this thread_id
    const existing = await db
      .select({ threadId: inboxMessages.threadId })
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.propertyId, input.propertyId),
          eq(inboxMessages.threadId, candidateThreadId),
        ),
      )
      .limit(1);

    if (existing.length > 0) return candidateThreadId;

    // New thread — return the deterministic subject-based ID so future
    // emails with the same subject will also land here.
    return candidateThreadId;
  }

  /**
   * Check if a Resend email ID already exists in inbox_messages (dedup).
   */
  async existsByResendId(resendEmailId: string): Promise<boolean> {
    const rows = await db
      .select({ id: inboxMessages.id })
      .from(inboxMessages)
      .where(eq(inboxMessages.resendEmailId, resendEmailId))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Insert a new inbox message.
   */
  async createMessage(
    input: CreateInboxMessageInput,
  ): Promise<StoredInboxMessage> {
    const threadId = await this.computeThreadId({
      propertyId: input.propertyId,
      subject: input.subject,
      inReplyTo: input.inReplyTo,
      references: input.references,
    });

    const id = generateId();
    const now = new Date().toISOString();

    const row: NewInboxMessage = {
      id,
      resendEmailId: input.resendEmailId ?? null,
      propertyId: input.propertyId,
      threadId,
      direction: input.direction,
      fromEmail: input.fromEmail,
      fromName: input.fromName ?? null,
      toJson: JSON.stringify(input.to),
      ccJson: JSON.stringify(input.cc ?? []),
      bccJson: JSON.stringify(input.bcc ?? []),
      subject: input.subject,
      bodyText: input.bodyText ?? null,
      bodyHtml: input.bodyHtml ?? null,
      messageId: input.messageId ?? null,
      inReplyTo: input.inReplyTo ?? null,
      referencesJson: JSON.stringify(input.references ?? []),
      hasAttachments: input.hasAttachments ? 1 : 0,
      read: input.direction === "outbound" ? 1 : 0,
      sentAt: input.sentAt,
      readAt: input.direction === "outbound" ? now : null,
      createdAt: now,
    };

    await db.insert(inboxMessages).values(row);

    const inserted = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.id, id))
      .limit(1);
    return rowToStored(inserted[0]);
  }

  /**
   * List all threads for a property, sorted by most recent message.
   */
  async listThreadsByPropertyId(propertyId: string): Promise<InboxThread[]> {
    // Get all messages for this property, ordered by sent_at desc
    const rows = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.propertyId, propertyId))
      .orderBy(desc(inboxMessages.sentAt))
      .all();

    if (rows.length === 0) return [];

    // Group by thread_id
    const threadMap = new Map<
      string,
      Array<typeof inboxMessages.$inferSelect>
    >();
    for (const row of rows) {
      const existing = threadMap.get(row.threadId) ?? [];
      existing.push(row);
      threadMap.set(row.threadId, existing);
    }

    // Build thread summaries
    const threads: InboxThread[] = [];
    for (const [threadId, messages] of threadMap) {
      // Messages are already sorted desc by sent_at (from the query)
      const latest = messages[0];
      const oldest = messages[messages.length - 1];

      // Collect unique participants
      const participantMap = new Map<
        string,
        { email: string; name: string | null }
      >();
      for (const msg of messages) {
        participantMap.set(msg.fromEmail, {
          email: msg.fromEmail,
          name: msg.fromName,
        });
        for (const p of parseJsonArray(msg.toJson)) {
          if (!participantMap.has(p.email)) {
            participantMap.set(p.email, p);
          }
        }
      }

      const preview = (latest.bodyText ?? latest.bodyHtml ?? "").slice(0, 120);

      threads.push({
        id: threadId,
        subject: oldest.subject, // Use original subject from first message
        participants: Array.from(participantMap.values()),
        preview,
        message_count: messages.length,
        has_attachments: messages.some((m) => m.hasAttachments === 1),
        unread: messages.some((m) => m.read === 0 && m.direction === "inbound"),
        last_message_at: latest.sentAt,
        last_message_from: latest.fromEmail,
        created_at: oldest.sentAt,
      });
    }

    // Sort threads by last_message_at descending
    threads.sort(
      (a, b) =>
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime(),
    );

    return threads;
  }

  /**
   * Get all messages in a thread.
   */
  async getThread(
    propertyId: string,
    threadId: string,
  ): Promise<StoredInboxMessage[]> {
    const rows = await db
      .select()
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.propertyId, propertyId),
          eq(inboxMessages.threadId, threadId),
        ),
      )
      .orderBy(inboxMessages.sentAt)
      .all();

    return rows.map(rowToStored);
  }

  /**
   * Find a single message by ID.
   */
  async findById(messageId: string): Promise<StoredInboxMessage | null> {
    const rows = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.id, messageId))
      .limit(1);
    return rows.length > 0 ? rowToStored(rows[0]) : null;
  }

  /**
   * Find a message by its email Message-ID header within a property.
   */
  async findByMessageId(
    propertyId: string,
    messageId: string,
  ): Promise<StoredInboxMessage | null> {
    const rows = await db
      .select()
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.propertyId, propertyId),
          eq(inboxMessages.messageId, messageId),
        ),
      )
      .limit(1);
    return rows.length > 0 ? rowToStored(rows[0]) : null;
  }

  /**
   * Toggle read/unread status for a message.
   */
  async markRead(
    messageId: string,
    read: boolean,
  ): Promise<StoredInboxMessage | null> {
    const now = new Date().toISOString();
    await db
      .update(inboxMessages)
      .set({
        read: read ? 1 : 0,
        readAt: read ? now : null,
      })
      .where(eq(inboxMessages.id, messageId));

    return this.findById(messageId);
  }
}
