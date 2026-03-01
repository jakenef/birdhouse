import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "../db/schema";

vi.mock("../db", () => {
  const sqlite = new (Database as any)(":memory:");
  const mockedDb = drizzle(sqlite, { schema });
  return { db: mockedDb, __sqlite: sqlite };
});

vi.mock("./docai", () => ({
  extractContractFieldsFromDocAi: vi.fn(),
}));

vi.mock("./openai", () => ({
  parsePurchaseContractWithOpenAi: vi.fn(),
}));

vi.mock("./documentSummarizer", () => ({
  extractContractSummary: vi.fn(),
  summarizePdf: vi.fn(),
}));

import { db, __sqlite } from "../db";
import { processedEmails } from "../db/schema";
import { __testing } from "./emailIntake";

const CREATE_PROCESSED_EMAILS = `
  CREATE TABLE IF NOT EXISTS processed_emails (
    email_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL
  )
`;

function makeResendMock(overrides?: {
  receivedData?: any[];
  sentData?: any[];
  receivedGetData?: any;
  sentGetData?: any;
}) {
  return {
    emails: {
      receiving: {
        list: vi.fn().mockResolvedValue({
          data: { data: overrides?.receivedData ?? [] },
          error: null,
        }),
        get: vi.fn().mockResolvedValue({
          data:
            overrides?.receivedGetData ?? {
              from: "Sarah Davis <sarah@titleco.com>",
              to: ["prop_123@bronaaelda.resend.app"],
              cc: [],
              headers: {},
              subject: "RE: Earnest Money",
              text: "Attached are the wiring instructions.",
              html: null,
              created_at: "2026-02-28T12:05:00.000Z",
            },
          error: null,
        }),
        attachments: {
          get: vi.fn(),
        },
      },
      list: vi.fn().mockResolvedValue({
        data: { data: overrides?.sentData ?? [] },
        error: null,
      }),
      get: vi.fn().mockResolvedValue({
        data:
          overrides?.sentGetData ?? {
            to: ["sarah@titleco.com"],
            cc: [],
            headers: {},
            subject: "Earnest Money",
            text: "Please send wiring instructions.",
            html: null,
            message_id: "<sent@example.com>",
            created_at: "2026-02-28T12:05:00.000Z",
          },
        error: null,
      }),
    },
  };
}

async function processedIds(): Promise<string[]> {
  const rows = await db.select().from(processedEmails);
  return rows.map((row) => row.emailId);
}

describe("email intake property session cutoff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __sqlite.exec("DROP TABLE IF EXISTS processed_emails");
    __sqlite.exec(CREATE_PROCESSED_EMAILS);
  });

  it("still handles intake emails regardless of cutoff", async () => {
    const resend = makeResendMock({
      receivedData: [
        {
          id: "recv_intake_old",
          to: ["intake@bronaaelda.resend.app"],
          from: "user@example.com",
          subject: "Old intake",
          attachments: [],
          created_at: "2026-02-27T10:00:00.000Z",
        },
      ],
    });

    await __testing.pollOnce(
      resend as any,
      {} as any,
      {} as any,
      {} as any,
      { existsByResendId: vi.fn() } as any,
      { processStoredMessage: vi.fn() } as any,
      { processStoredMessage: vi.fn() } as any,
      "2026-02-28T12:00:00.000Z",
    );

    expect(await processedIds()).toContain("recv_intake_old");
  });

  it("skips older property-specific inbound emails for the current session", async () => {
    const propertyStore = {
      findByPropertyEmail: vi.fn(),
    };
    const inboxStore = {
      existsByResendId: vi.fn(),
      createMessage: vi.fn(),
    };
    const automation = {
      processStoredMessage: vi.fn(),
    };
    const resend = makeResendMock({
      receivedData: [
        {
          id: "recv_prop_old",
          to: ["prop_123@bronaaelda.resend.app"],
          from: "escrow@example.com",
          subject: "Old property email",
          attachments: [],
          created_at: "2026-02-28T11:59:00.000Z",
        },
      ],
    });

    await __testing.pollOnce(
      resend as any,
      propertyStore as any,
      {} as any,
      {} as any,
      inboxStore as any,
      automation as any,
      { processStoredMessage: vi.fn() } as any,
      "2026-02-28T12:00:00.000Z",
    );

    expect(propertyStore.findByPropertyEmail).not.toHaveBeenCalled();
    expect(inboxStore.createMessage).not.toHaveBeenCalled();
    expect(automation.processStoredMessage).not.toHaveBeenCalled();
    expect(await processedIds()).not.toContain("recv_prop_old");
  });

  it("processes newer property-specific inbound emails after session start", async () => {
    const propertyStore = {
      findByPropertyEmail: vi.fn().mockResolvedValue({
        id: "prop_123",
        property_name: "123 Main St",
      }),
    };
    const inboxStore = {
      existsByResendId: vi.fn().mockResolvedValue(false),
      createMessage: vi.fn().mockResolvedValue({
        id: "im_123",
        property_id: "prop_123",
        thread_id: "thr_123",
        direction: "inbound",
        from_email: "sarah@titleco.com",
        from_name: "Sarah Davis",
        to: [{ email: "prop_123@bronaaelda.resend.app", name: null }],
        cc: [],
        bcc: [],
        subject: "RE: Earnest Money",
        body_text: "Attached are the wiring instructions.",
        body_html: null,
        message_id: "<inbound@example.com>",
        in_reply_to: null,
        references: [],
        has_attachments: false,
        read: false,
        sent_at: "2026-02-28T12:05:00.000Z",
        read_at: null,
        created_at: "2026-02-28T12:05:00.000Z",
        analysis: null,
      }),
    };
    const automation = {
      processStoredMessage: vi.fn(),
    };
    const resend = makeResendMock({
      receivedData: [
        {
          id: "recv_prop_new",
          to: ["prop_123@bronaaelda.resend.app"],
          from: "escrow@example.com",
          subject: "RE: Earnest Money",
          attachments: [],
          created_at: "2026-02-28T12:05:00.000Z",
        },
      ],
      receivedGetData: {
        from: "Sarah Davis <sarah@titleco.com>",
        to: ["prop_123@bronaaelda.resend.app"],
        cc: [],
        headers: {},
        subject: "RE: Earnest Money",
        text: "Attached are the wiring instructions.",
        html: null,
        created_at: "2026-02-28T12:05:00.000Z",
      },
    });

    await __testing.pollOnce(
      resend as any,
      propertyStore as any,
      {} as any,
      {} as any,
      inboxStore as any,
      automation as any,
      { processStoredMessage: vi.fn() } as any,
      "2026-02-28T12:00:00.000Z",
    );

    expect(inboxStore.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "prop_123",
        direction: "inbound",
        resendEmailId: "recv_prop_new",
      }),
    );
    expect(automation.processStoredMessage).toHaveBeenCalled();
    expect(await processedIds()).toContain("recv_prop_new");
  });

  it("skips older property-specific outbound emails for the current session", async () => {
    const propertyStore = {
      findByPropertyEmail: vi.fn().mockResolvedValue({
        id: "prop_123",
        property_name: "123 Main St",
      }),
    };
    const inboxStore = {
      existsByResendId: vi.fn(),
      createMessage: vi.fn(),
    };
    const resend = makeResendMock({
      sentData: [
        {
          id: "sent_old",
          from: "prop_123@bronaaelda.resend.app",
          created_at: "2026-02-28T11:59:00.000Z",
        },
      ],
    });

    await __testing.pollOnce(
      resend as any,
      propertyStore as any,
      {} as any,
      {} as any,
      inboxStore as any,
      { processStoredMessage: vi.fn() } as any,
      { processStoredMessage: vi.fn() } as any,
      "2026-02-28T12:00:00.000Z",
    );

    expect(inboxStore.createMessage).not.toHaveBeenCalled();
    expect(await processedIds()).not.toContain("sent_sent_old");
  });

  it("stores newer property-specific outbound emails after session start", async () => {
    const propertyStore = {
      findByPropertyEmail: vi.fn().mockResolvedValue({
        id: "prop_123",
        property_name: "123 Main St",
      }),
    };
    const inboxStore = {
      existsByResendId: vi.fn().mockResolvedValue(false),
      createMessage: vi.fn().mockResolvedValue({
        id: "im_out_123",
      }),
    };
    const resend = makeResendMock({
      sentData: [
        {
          id: "sent_new",
          from: "prop_123@bronaaelda.resend.app",
          created_at: "2026-02-28T12:05:00.000Z",
        },
      ],
      sentGetData: {
        to: ["sarah@titleco.com"],
        cc: [],
        headers: {},
        subject: "Earnest Money",
        text: "Please send wiring instructions.",
        html: null,
        message_id: "<sent@example.com>",
        created_at: "2026-02-28T12:05:00.000Z",
      },
    });

    await __testing.pollOnce(
      resend as any,
      propertyStore as any,
      {} as any,
      {} as any,
      inboxStore as any,
      { processStoredMessage: vi.fn() } as any,
      { processStoredMessage: vi.fn() } as any,
      "2026-02-28T12:00:00.000Z",
    );

    expect(inboxStore.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "prop_123",
        direction: "outbound",
        resendEmailId: "sent_new",
      }),
    );
    expect(await processedIds()).toContain("sent_sent_new");
  });
});
