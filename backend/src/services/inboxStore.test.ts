import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Mock the "../db" module to use an in-memory SQLite database.
// ---------------------------------------------------------------------------
let memDb: ReturnType<typeof Database>;
let drizzleDb: ReturnType<typeof drizzle>;

vi.mock("../db", () => {
  // Create a fresh in-memory DB for the module-level import.
  // The actual DB instance is swapped in beforeEach via resetDb().
  const _sqlite = new (Database as any)(":memory:");
  const _db = drizzle(_sqlite, { schema });
  return { db: _db, __sqlite: _sqlite };
});

// We import *after* setting up the mock so the InboxStore picks up the mocked db.
import { InboxStore, CreateInboxMessageInput } from "./inboxStore";
import { db } from "../db";

// ---------------------------------------------------------------------------
// Raw SQL to create the tables we need.
// ---------------------------------------------------------------------------
const CREATE_INBOX_MESSAGES = `
  CREATE TABLE IF NOT EXISTS inbox_messages (
    id TEXT PRIMARY KEY,
    resend_email_id TEXT UNIQUE,
    property_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    from_email TEXT NOT NULL,
    from_name TEXT,
    to_json TEXT NOT NULL,
    cc_json TEXT,
    bcc_json TEXT,
    subject TEXT NOT NULL,
    body_text TEXT,
    body_html TEXT,
    message_id TEXT,
    in_reply_to TEXT,
    references_json TEXT,
    has_attachments INTEGER DEFAULT 0,
    read INTEGER DEFAULT 0,
    sent_at TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL,
    analysis_json TEXT
  )
`;

// ---------------------------------------------------------------------------
// Helper to get access to the underlying better-sqlite3 instance so we can
// run raw SQL for setup/teardown.
// ---------------------------------------------------------------------------
function getRawDb(): Database.Database {
  // The mocked module exposes __sqlite
  return (db as any).__sqlite ?? (require("../db") as any).__sqlite;
}

function resetDb() {
  // Access the underlying better-sqlite3 instance through the drizzle wrapper
  // We'll drop and recreate tables to get a clean slate.
  const raw = db as any;
  // drizzle stores the session which has the underlying client
  // Let's just use the module-level memDb approach
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(
  overrides: Partial<CreateInboxMessageInput> = {},
): CreateInboxMessageInput {
  return {
    propertyId: "prop_test1",
    direction: "inbound",
    fromEmail: "sender@example.com",
    fromName: "Sender",
    to: [{ email: "property@example.com", name: null }],
    subject: "Test Subject",
    bodyText: "Hello world",
    sentAt: "2026-02-28T12:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InboxStore", () => {
  let store: InboxStore;

  beforeEach(() => {
    // Recreate the table fresh for each test.
    // The mocked `db` uses the in-memory SQLite, so we can get the raw
    // connection via drizzle internals.
    const session = (db as any).session;
    const client: Database.Database = session?.client ?? session?.db;
    if (client && typeof client.exec === "function") {
      client.exec("DROP TABLE IF EXISTS inbox_messages");
      client.exec(CREATE_INBOX_MESSAGES);
    }

    store = new InboxStore();
  });

  // -----------------------------------------------------------------------
  // createMessage
  // -----------------------------------------------------------------------
  describe("createMessage", () => {
    it("creates a message and returns it with a generated ID", async () => {
      const msg = await store.createMessage(makeInput());

      expect(msg.id).toMatch(/^im_/);
      expect(msg.property_id).toBe("prop_test1");
      expect(msg.direction).toBe("inbound");
      expect(msg.from_email).toBe("sender@example.com");
      expect(msg.from_name).toBe("Sender");
      expect(msg.to).toEqual([{ email: "property@example.com", name: null }]);
      expect(msg.subject).toBe("Test Subject");
      expect(msg.body_text).toBe("Hello world");
      expect(msg.sent_at).toBe("2026-02-28T12:00:00.000Z");
      expect(msg.created_at).toBeTruthy();
      expect(msg.analysis).toBeNull();
    });

    it("assigns a thread_id via subject-based fallback", async () => {
      const msg = await store.createMessage(makeInput());

      expect(msg.thread_id).toMatch(/^thr_/);
    });

    it("auto-marks outbound messages as read", async () => {
      const msg = await store.createMessage(
        makeInput({ direction: "outbound" }),
      );

      expect(msg.read).toBe(true);
      expect(msg.read_at).toBeTruthy();
    });

    it("leaves inbound messages as unread", async () => {
      const msg = await store.createMessage(
        makeInput({ direction: "inbound" }),
      );

      expect(msg.read).toBe(false);
      expect(msg.read_at).toBeNull();
    });

    it("groups messages with same subject into the same thread", async () => {
      const msg1 = await store.createMessage(
        makeInput({ subject: "Earnest Money" }),
      );
      const msg2 = await store.createMessage(
        makeInput({
          subject: "Re: Earnest Money",
          sentAt: "2026-02-28T13:00:00.000Z",
        }),
      );

      expect(msg1.thread_id).toBe(msg2.thread_id);
    });

    it("puts different subjects into different threads", async () => {
      const msg1 = await store.createMessage(
        makeInput({ subject: "Earnest Money" }),
      );
      const msg2 = await store.createMessage(
        makeInput({ subject: "Inspection Report" }),
      );

      expect(msg1.thread_id).not.toBe(msg2.thread_id);
    });
  });

  // -----------------------------------------------------------------------
  // Threading via headers
  // -----------------------------------------------------------------------
  describe("threading via In-Reply-To and References", () => {
    it("joins an existing thread via In-Reply-To header", async () => {
      const original = await store.createMessage(
        makeInput({
          subject: "Loan docs",
          messageId: "<original@mail.example.com>",
        }),
      );

      const reply = await store.createMessage(
        makeInput({
          subject: "Re: Loan docs",
          inReplyTo: "<original@mail.example.com>",
          sentAt: "2026-02-28T14:00:00.000Z",
        }),
      );

      expect(reply.thread_id).toBe(original.thread_id);
    });

    it("joins an existing thread via References header", async () => {
      const original = await store.createMessage(
        makeInput({
          subject: "Title review",
          messageId: "<ref-msg@mail.example.com>",
        }),
      );

      const reply = await store.createMessage(
        makeInput({
          subject: "Completely different subject",
          references: ["<ref-msg@mail.example.com>"],
          sentAt: "2026-02-28T14:00:00.000Z",
        }),
      );

      expect(reply.thread_id).toBe(original.thread_id);
    });
  });

  // -----------------------------------------------------------------------
  // existsByResendId
  // -----------------------------------------------------------------------
  describe("existsByResendId", () => {
    it("returns false for an unknown ID", async () => {
      expect(await store.existsByResendId("unknown-id")).toBe(false);
    });

    it("returns true after a message with that resendEmailId is created", async () => {
      await store.createMessage(makeInput({ resendEmailId: "resend_abc" }));
      expect(await store.existsByResendId("resend_abc")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // listThreadsByPropertyId
  // -----------------------------------------------------------------------
  describe("listThreadsByPropertyId", () => {
    it("returns empty array when no messages exist", async () => {
      const threads = await store.listThreadsByPropertyId("prop_test1");
      expect(threads).toEqual([]);
    });

    it("returns a single thread with correct summary", async () => {
      await store.createMessage(
        makeInput({
          subject: "Welcome",
          bodyText: "Welcome to Birdhouse",
        }),
      );

      const threads = await store.listThreadsByPropertyId("prop_test1");

      expect(threads).toHaveLength(1);
      expect(threads[0].subject).toBe("Welcome");
      expect(threads[0].message_count).toBe(1);
      expect(threads[0].preview).toContain("Welcome to Birdhouse");
      expect(threads[0].participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: "sender@example.com" }),
        ]),
      );
    });

    it("groups messages into a single thread by subject", async () => {
      await store.createMessage(
        makeInput({
          subject: "Appraisal",
          sentAt: "2026-02-28T10:00:00.000Z",
        }),
      );
      await store.createMessage(
        makeInput({
          subject: "Re: Appraisal",
          fromEmail: "agent@example.com",
          fromName: "Agent",
          sentAt: "2026-02-28T11:00:00.000Z",
        }),
      );

      const threads = await store.listThreadsByPropertyId("prop_test1");

      expect(threads).toHaveLength(1);
      expect(threads[0].message_count).toBe(2);
      expect(threads[0].last_message_from).toBe("agent@example.com");
    });

    it("marks thread as unread when it has unread inbound messages", async () => {
      await store.createMessage(
        makeInput({ direction: "inbound", subject: "Urgent" }),
      );

      const threads = await store.listThreadsByPropertyId("prop_test1");

      expect(threads[0].unread).toBe(true);
    });

    it("marks thread as read when all inbound messages are read", async () => {
      const msg = await store.createMessage(
        makeInput({ direction: "inbound", subject: "Done" }),
      );
      await store.markRead(msg.id, true);

      const threads = await store.listThreadsByPropertyId("prop_test1");

      expect(threads[0].unread).toBe(false);
    });

    it("sorts threads newest-first", async () => {
      await store.createMessage(
        makeInput({
          subject: "Old Thread",
          sentAt: "2026-02-27T10:00:00.000Z",
        }),
      );
      await store.createMessage(
        makeInput({
          subject: "New Thread",
          sentAt: "2026-02-28T10:00:00.000Z",
        }),
      );

      const threads = await store.listThreadsByPropertyId("prop_test1");

      expect(threads[0].subject).toBe("New Thread");
      expect(threads[1].subject).toBe("Old Thread");
    });
  });

  // -----------------------------------------------------------------------
  // getThread
  // -----------------------------------------------------------------------
  describe("getThread", () => {
    it("returns messages sorted by sentAt ascending", async () => {
      const msg1 = await store.createMessage(
        makeInput({
          subject: "Conversation",
          sentAt: "2026-02-28T10:00:00.000Z",
        }),
      );
      await store.createMessage(
        makeInput({
          subject: "Re: Conversation",
          sentAt: "2026-02-28T12:00:00.000Z",
        }),
      );

      const messages = await store.getThread("prop_test1", msg1.thread_id);

      expect(messages).toHaveLength(2);
      expect(messages[0].sent_at).toBe("2026-02-28T10:00:00.000Z");
      expect(messages[1].sent_at).toBe("2026-02-28T12:00:00.000Z");
    });

    it("returns empty array for unknown thread", async () => {
      const messages = await store.getThread("prop_test1", "thr_nonexistent");
      expect(messages).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // findById / findByMessageId
  // -----------------------------------------------------------------------
  describe("findById", () => {
    it("returns null for unknown ID", async () => {
      expect(await store.findById("im_missing")).toBeNull();
    });

    it("returns the stored message", async () => {
      const created = await store.createMessage(makeInput());
      const found = await store.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.subject).toBe("Test Subject");
    });
  });

  describe("findByMessageId", () => {
    it("returns null for unknown Message-ID", async () => {
      expect(
        await store.findByMessageId("prop_test1", "<unknown@example.com>"),
      ).toBeNull();
    });

    it("returns the message matching the email Message-ID header", async () => {
      const created = await store.createMessage(
        makeInput({ messageId: "<abc123@example.com>" }),
      );
      const found = await store.findByMessageId(
        "prop_test1",
        "<abc123@example.com>",
      );

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });
  });

  // -----------------------------------------------------------------------
  // markRead
  // -----------------------------------------------------------------------
  describe("markRead", () => {
    it("marks a message as read", async () => {
      const msg = await store.createMessage(
        makeInput({ direction: "inbound" }),
      );
      expect(msg.read).toBe(false);

      const updated = await store.markRead(msg.id, true);
      expect(updated!.read).toBe(true);
      expect(updated!.read_at).toBeTruthy();
    });

    it("marks a message as unread", async () => {
      const msg = await store.createMessage(
        makeInput({ direction: "inbound" }),
      );
      await store.markRead(msg.id, true);
      const updated = await store.markRead(msg.id, false);

      expect(updated!.read).toBe(false);
      expect(updated!.read_at).toBeNull();
    });

    it("returns null for unknown message", async () => {
      expect(await store.markRead("im_missing", true)).toBeNull();
    });
  });

  describe("analysis", () => {
    it("stores and returns message analysis", async () => {
      const msg = await store.createMessage(makeInput());

      await store.updateAnalysis(msg.id, {
        version: 1,
        pipeline_label: "earnest_money",
        summary: "Escrow provided wiring instructions.",
        confidence: 0.92,
        reason: "Explicit wiring instructions were attached to the email.",
        earnest_signal: "wire_instructions_provided",
        suggested_user_action: "confirm_wire_sent",
        warnings: [],
        analyzed_at_iso: "2026-02-28T12:05:00.000Z",
      });

      const updated = await store.findById(msg.id);
      expect(updated?.analysis?.pipeline_label).toBe("earnest_money");
      expect(updated?.analysis?.earnest_signal).toBe(
        "wire_instructions_provided",
      );
      expect(await store.getAnalysis(msg.id)).toEqual(updated?.analysis);
    });
  });
});
