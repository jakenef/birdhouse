import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpenAiStructuredOutputError,
  extractOutputText,
  getOpenAiStructuredOutputConfig,
  parseJsonOutput,
  requestStructuredJson,
  withUploadedPdf,
} from "./openaiStructuredOutput";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiModel = process.env.OPENAI_MODEL;

function buildMockClient() {
  return {
    responses: {
      create: vi.fn(),
    },
    files: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
}

afterEach(() => {
  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }

  if (originalOpenAiModel === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = originalOpenAiModel;
  }
});

describe("openaiStructuredOutput", () => {
  it("throws when OpenAI env vars are missing", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;

    expect(() => getOpenAiStructuredOutputConfig()).toThrow(
      OpenAiStructuredOutputError,
    );
  });

  it("extracts output text from segmented response payloads", () => {
    const response = {
      output: [
        {
          content: [
            {
              type: "output_text",
              text: '{"ok":',
            },
            {
              type: "output_text",
              text: "true}",
            },
          ],
        },
      ],
    };

    expect(extractOutputText(response)).toBe('{"ok":true}');
    expect(parseJsonOutput<{ ok: boolean }>(response, "missing")).toEqual({ ok: true });
  });

  it("wraps structured output request failures", async () => {
    const client = buildMockClient();
    client.responses.create.mockRejectedValue(new Error("boom"));

    await expect(
      requestStructuredJson({
        client,
        model: "gpt-4.1",
        input: "hello",
        schemaName: "demo",
        schema: { type: "object" },
        timeoutMs: 1000,
        emptyOutputMessage: "missing",
      }),
    ).rejects.toThrow("OpenAI structured output request failed: boom");
  });

  it("deletes uploaded files in finally", async () => {
    const client = buildMockClient();
    client.files.create.mockResolvedValue({
      id: "file_123",
      bytes: 123,
    });
    client.files.delete.mockResolvedValue(undefined);

    await expect(
      withUploadedPdf({
        client,
        model: "gpt-4.1",
        fileBuffer: Buffer.from("pdf"),
        filename: "alta.pdf",
        mimeType: "application/pdf",
        timeoutMs: 1000,
        run: async () => {
          throw new Error("parser failed");
        },
      }),
    ).rejects.toThrow("parser failed");

    expect(client.files.create).toHaveBeenCalledTimes(1);
    expect(client.files.delete).toHaveBeenCalledWith("file_123");
  });
});
