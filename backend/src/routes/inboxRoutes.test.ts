import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach, vi } from "vitest";

import * as schema from "../db/schema";
import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import { PropertyStore } from "../services/propertyStore";
import { StreetViewCacheEntry, StoredPropertyRecord } from "../types/property";
import { StreetViewService } from "../services/googleStreetView";
import { EarnestWorkflowService } from "../services/earnestWorkflow";
import { OutboundEmailService } from "../services/outboundEmailService";

// ---------------------------------------------------------------------------
// Mock Resend SDK so no real emails are sent.
// ---------------------------------------------------------------------------
vi.mock("resend", () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({
          data: { id: "resend_mock_123" },
          error: null,
        }),
        get: vi.fn().mockResolvedValue({
          data: {
            id: "resend_mock_123",
            message_id: "<outbound-123@example.com>",
            created_at: "2026-02-28T12:00:00.000Z",
          },
          error: null,
        }),
      };
    },
  };
});

// ---------------------------------------------------------------------------
// Mock the DB module with an in-memory SQLite so InboxStore works.
// ---------------------------------------------------------------------------
vi.mock("../db", async () => {
  const _Database = (await import("better-sqlite3")).default;
  const { drizzle: _drizzle } = await import("drizzle-orm/better-sqlite3");
  const _schema = await import("../db/schema");
  const _sqlite = new _Database(":memory:");
  const _db = _drizzle(_sqlite, { schema: _schema });
  return { db: _db, __sqlite: _sqlite };
});

import { db } from "../db";
import { InboxStore, CreateInboxMessageInput } from "../services/inboxStore";
import { DocumentStore } from "../services/documentStore";
import { createPropertiesRouter } from "./properties";

// ---------------------------------------------------------------------------
// SQL for table creation (in-memory DB has no tables initially)
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
// Stubs for PropertyStore, StreetViewService, DocumentStore
// ---------------------------------------------------------------------------
function buildContract(docHash: string): ParsedPurchaseContract {
  return {
    metadata: {
      doc_hash: docHash,
      filename: `${docHash}.pdf`,
      mime_type: "application/pdf",
      bytes: 1024,
      page_count: 2,
      extracted_at_iso: "2026-02-28T00:00:00.000Z",
      source: "upload",
      model: { openai_model: "gpt-4.1" },
      confidence: { overall: 0.95, notes: "" },
    },
    parties: { buyers: ["Buyer One"], sellers: ["Seller One"] },
    property: {
      address_full: "123 Main St, Park City, UT 84060",
      city: "Park City",
      state: "UT",
      zip: "84060",
    },
    key_dates: {
      effective_date: "2026-03-01",
      due_diligence_deadline: null,
      financing_deadline: "2026-03-20",
      appraisal_deadline: "2026-03-20",
      seller_disclosure_deadline: null,
      settlement_deadline: "2026-04-01",
      possession: {
        timing: null,
        hours_after_recording: null,
        days_after_recording: null,
      },
    },
    money: { purchase_price: 500000, earnest_money: { amount: 10000 } },
    obligations_and_risks: {
      missing_info: [],
      time_sensitive_items: [],
      warnings: [],
    },
    summary: {
      one_paragraph: "Summary",
      bullets: [],
      numbers_to_know: [],
      recommended_next_actions: [],
    },
  };
}

const TEST_PROPERTY: StoredPropertyRecord = {
  id: "prop_test1",
  property_name: "123 Main St",
  property_email: "123-main-st@bronaaelda.resend.app",
  created_at_iso: "2026-02-28T00:00:00.000Z",
  updated_at_iso: "2026-02-28T00:00:00.000Z",
  parsed_contract: buildContract("doc-1"),
};

class StubPropertyStore implements PropertyStore {
  private props: StoredPropertyRecord[] = [TEST_PROPERTY];

  async list() {
    return this.props;
  }
  async create(c: ParsedPurchaseContract): Promise<StoredPropertyRecord> {
    throw new Error("not implemented in stub");
  }
  async findByDocHash() {
    return null;
  }
  async findById(id: string) {
    return this.props.find((p) => p.id === id) ?? null;
  }
  async findByPropertyEmail(email: string) {
    return this.props.find((p) => p.property_email === email) ?? null;
  }
  async updateStreetView(
    id: string,
    sv: StreetViewCacheEntry,
  ): Promise<StoredPropertyRecord> {
    throw new Error("not implemented in stub");
  }
  async getWorkflowState() {
    return null;
  }
  async updateWorkflowState(): Promise<StoredPropertyRecord> {
    throw new Error("not implemented in stub");
  }
}

class StubStreetViewService implements StreetViewService {
  async lookup(): Promise<StreetViewCacheEntry> {
    return {
      status: "available",
      last_checked_at_iso: "2026-02-28T00:00:00.000Z",
      source_address: null,
      resolved_address: null,
      latitude: null,
      longitude: null,
      target_latitude: null,
      target_longitude: null,
      heading: null,
      pano_id: null,
      error_message: null,
    };
  }
  async fetchImage() {
    return { body: Buffer.from("jpeg"), contentType: "image/jpeg" };
  }
}

// We need a stub that satisfies the DocumentStore dependency. The inbox
// endpoints never call documentStore, so a no-op stub is fine.
// DocumentStore is a concrete class, but createPropertiesRouter just needs
// an object with matching methods.
class StubDocumentStore {
  async listByPropertyId() {
    return [];
  }
  async findById() {
    return null;
  }
  async create() {
    throw new Error("not implemented");
  }
}

// ---------------------------------------------------------------------------
// Helper to seed a message directly via InboxStore
// ---------------------------------------------------------------------------
function makeInput(
  overrides: Partial<CreateInboxMessageInput> = {},
): CreateInboxMessageInput {
  return {
    propertyId: "prop_test1",
    direction: "inbound",
    fromEmail: "alice@example.com",
    fromName: "Alice",
    to: [{ email: "123-main-st@bronaaelda.resend.app", name: null }],
    subject: "Earnest Money",
    bodyText: "Please review the earnest money deposit.",
    sentAt: "2026-02-28T12:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("inbox route endpoints", () => {
  let app: express.Express;
  let inboxStore: InboxStore;

  beforeEach(() => {
    // Reset in-memory DB tables
    const session = (db as any).session;
    const client: Database.Database = session?.client ?? session?.db;
    if (client && typeof client.exec === "function") {
      client.exec("DROP TABLE IF EXISTS inbox_messages");
      client.exec(CREATE_INBOX_MESSAGES);
    }

    inboxStore = new InboxStore();

    process.env.RESEND_API_KEY = "re_test_mock_key";

    app = express();
    app.use(express.json());
    app.use(
      "/api",
      createPropertiesRouter(
        new StubPropertyStore(),
        new StubStreetViewService(),
        new StubDocumentStore() as any,
        {} as EarnestWorkflowService,
        new OutboundEmailService(inboxStore),
        inboxStore,
      ),
    );

    // Set the env var the send endpoint checks for
    process.env.RESEND_API_KEY = "re_test_mock_key";
  });

  // -----------------------------------------------------------------------
  // GET /properties/:propertyId/inbox
  // -----------------------------------------------------------------------
  describe("GET /api/properties/:propertyId/inbox", () => {
    it("returns empty threads for a property with no messages", async () => {
      const res = await request(app).get("/api/properties/prop_test1/inbox");

      expect(res.status).toBe(200);
      expect(res.body.property_email).toBe("123-main-st@bronaaelda.resend.app");
      expect(res.body.threads).toEqual([]);
    });

    it("returns threads after messages are seeded", async () => {
      await inboxStore.createMessage(makeInput());

      const res = await request(app).get("/api/properties/prop_test1/inbox");

      expect(res.status).toBe(200);
      expect(res.body.threads).toHaveLength(1);
      expect(res.body.threads[0].subject).toBe("Earnest Money");
      expect(res.body.threads[0].message_count).toBe(1);
    });

    it("returns 404 for unknown property", async () => {
      const res = await request(app).get("/api/properties/prop_unknown/inbox");

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /properties/:propertyId/inbox/:threadId
  // -----------------------------------------------------------------------
  describe("GET /api/properties/:propertyId/inbox/:threadId", () => {
    it("returns messages for a valid thread", async () => {
      const msg = await inboxStore.createMessage(makeInput());

      const res = await request(app).get(
        `/api/properties/prop_test1/inbox/${msg.thread_id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.thread.id).toBe(msg.thread_id);
      expect(res.body.thread.subject).toBe("Earnest Money");
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].id).toBe(msg.id);
    });

    it("returns 404 for nonexistent thread", async () => {
      const res = await request(app).get(
        "/api/properties/prop_test1/inbox/thr_doesnotexist",
      );

      expect(res.status).toBe(404);
    });

    it("includes participants from all messages in thread", async () => {
      await inboxStore.createMessage(makeInput());
      await inboxStore.createMessage(
        makeInput({
          fromEmail: "bob@example.com",
          fromName: "Bob",
          subject: "Re: Earnest Money",
          sentAt: "2026-02-28T13:00:00.000Z",
        }),
      );

      const threads = await inboxStore.listThreadsByPropertyId("prop_test1");
      const threadId = threads[0].id;

      const res = await request(app).get(
        `/api/properties/prop_test1/inbox/${threadId}`,
      );

      expect(res.status).toBe(200);
      const emails = res.body.thread.participants.map((p: any) => p.email);
      expect(emails).toContain("alice@example.com");
      expect(emails).toContain("bob@example.com");
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /properties/:propertyId/inbox/emails/:messageId
  // -----------------------------------------------------------------------
  describe("PATCH /api/properties/:propertyId/inbox/emails/:messageId", () => {
    it("marks a message as read", async () => {
      const msg = await inboxStore.createMessage(makeInput());

      const res = await request(app)
        .patch(`/api/properties/prop_test1/inbox/emails/${msg.id}`)
        .send({ read: true });

      expect(res.status).toBe(200);
      expect(res.body.message.read).toBe(true);
    });

    it("marks a message as unread", async () => {
      const msg = await inboxStore.createMessage(makeInput());
      await inboxStore.markRead(msg.id, true);

      const res = await request(app)
        .patch(`/api/properties/prop_test1/inbox/emails/${msg.id}`)
        .send({ read: false });

      expect(res.status).toBe(200);
      expect(res.body.message.read).toBe(false);
    });

    it("returns 400 when read field is missing", async () => {
      const msg = await inboxStore.createMessage(makeInput());

      const res = await request(app)
        .patch(`/api/properties/prop_test1/inbox/emails/${msg.id}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent message", async () => {
      const res = await request(app)
        .patch("/api/properties/prop_test1/inbox/emails/im_nonexistent")
        .send({ read: true });

      expect(res.status).toBe(404);
    });

    it("returns 404 for nonexistent property", async () => {
      const res = await request(app)
        .patch("/api/properties/prop_unknown/inbox/emails/im_something")
        .send({ read: true });

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /properties/:propertyId/inbox/send
  // -----------------------------------------------------------------------
  describe("POST /api/properties/:propertyId/inbox/send", () => {
    it("sends an email and stores it in the inbox", async () => {
      const res = await request(app)
        .post("/api/properties/prop_test1/inbox/send")
        .send({
          to: ["agent@example.com"],
          subject: "Closing docs",
          body: "Please see attached closing documents.",
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toMatchObject({
        from: "123-main-st@bronaaelda.resend.app",
        to: ["agent@example.com"],
        subject: "Closing docs",
      });
      expect(res.body.message.id).toMatch(/^im_/);
      expect(res.body.message.thread_id).toMatch(/^thr_/);

      // Verify the message was also stored in the inbox
      const threads = await inboxStore.listThreadsByPropertyId("prop_test1");
      expect(threads).toHaveLength(1);
      expect(threads[0].subject).toBe("Closing docs");
    });

    it("returns 400 when 'to' is missing", async () => {
      const res = await request(app)
        .post("/api/properties/prop_test1/inbox/send")
        .send({ subject: "Test", body: "Hello" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when 'subject' is missing", async () => {
      const res = await request(app)
        .post("/api/properties/prop_test1/inbox/send")
        .send({ to: ["x@y.com"], body: "Hello" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when 'body' is missing", async () => {
      const res = await request(app)
        .post("/api/properties/prop_test1/inbox/send")
        .send({ to: ["x@y.com"], subject: "Test" });

      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown property", async () => {
      const res = await request(app)
        .post("/api/properties/prop_unknown/inbox/send")
        .send({
          to: ["x@y.com"],
          subject: "Test",
          body: "Hello",
        });

      expect(res.status).toBe(404);
    });
  });
});
