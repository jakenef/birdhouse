import { describe, expect, it } from "vitest";

import { PropertyEmailSender } from "./propertyEmailSender";

describe("PropertyEmailSender", () => {
  it("returns mocked send metadata", async () => {
    const sender = new PropertyEmailSender();

    const result = await sender.send({
      property_id: "prop_1",
      from: "123-main@demo.test",
      to: ["escrow@titleco.com"],
      subject: "Earnest Money - 123 Main",
      body: "Hi Sarah",
      attachments: [
        {
          document_id: "doc_1",
          filename: "contract.pdf",
          mime_type: "application/pdf",
        },
      ],
    });

    expect(result.from).toBe("123-main@demo.test");
    expect(result.to).toEqual(["escrow@titleco.com"]);
    expect(result.subject).toBe("Earnest Money - 123 Main");
    expect(result.id.startsWith("msg_")).toBe(true);
    expect(result.thread_id.startsWith("thread_")).toBe(true);
  });
});
