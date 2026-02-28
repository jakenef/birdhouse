import { beforeEach, describe, expect, it, vi } from "vitest";

import { OutboundEmailService } from "./outboundEmailService";

describe("OutboundEmailService", () => {
  const inboxStore = {
    findById: vi.fn(),
    createMessage: vi.fn(),
  };

  const resendClient = {
    emails: {
      send: vi.fn(),
      get: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    inboxStore.findById.mockResolvedValue({
      message_id: "<parent@example.com>",
      references: ["<root@example.com>"],
    });
    resendClient.emails.send.mockResolvedValue({
      data: { id: "resend_123" },
      error: null,
    });
    resendClient.emails.get.mockResolvedValue({
      data: {
        message_id: "<outbound@example.com>",
        created_at: "2026-02-28T12:00:00.000Z",
      },
      error: null,
    });
    inboxStore.createMessage.mockResolvedValue({
      id: "im_123",
      thread_id: "thr_123",
      message_id: "<outbound@example.com>",
      sent_at: "2026-02-28T12:00:00.000Z",
    });
  });

  it("sends through resend and stores the outbound inbox message", async () => {
    const service = new OutboundEmailService(inboxStore as any, resendClient as any);

    const result = await service.send({
      property_id: "prop_1",
      from: "prop@demo.test",
      to: ["sarah@titleco.com"],
      subject: "Earnest Money",
      body: "Please send wiring instructions.",
    });

    expect(resendClient.emails.send).toHaveBeenCalled();
    expect(inboxStore.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "prop_1",
        direction: "outbound",
        fromEmail: "prop@demo.test",
      }),
    );
    expect(result.inbox_message_id).toBe("im_123");
    expect(result.thread_id).toBe("thr_123");
  });

  it("preserves reply threading headers when replying to an existing message", async () => {
    const service = new OutboundEmailService(inboxStore as any, resendClient as any);

    await service.send({
      property_id: "prop_1",
      from: "prop@demo.test",
      to: ["sarah@titleco.com"],
      subject: "Re: Earnest Money",
      body: "Following up",
      reply_to_message_id: "im_parent",
    });

    expect(inboxStore.findById).toHaveBeenCalledWith("im_parent");
    expect(resendClient.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "In-Reply-To": "<parent@example.com>",
          References: "<root@example.com> <parent@example.com>",
        },
      }),
    );
  });
});
