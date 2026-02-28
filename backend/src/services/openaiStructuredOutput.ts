import OpenAI, { toFile } from "openai";

export class OpenAiStructuredOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiStructuredOutputError";
  }
}

type OpenAiResponseTextContent = {
  type?: string;
  text?: string;
};

export type OpenAiResponseShape = {
  output_text?: string;
  output?: Array<{
    content?: OpenAiResponseTextContent[];
  }>;
};

export type OpenAiUploadedFile = {
  id: string;
  bytes?: number | null;
};

export type OpenAiClientLike = {
  responses: {
    create: (args: any) => Promise<OpenAiResponseShape>;
  };
  files: {
    create: (args: any) => Promise<OpenAiUploadedFile>;
    delete: (fileId: string) => Promise<unknown>;
  };
};

type StructuredJsonRequestArgs = {
  client?: OpenAiClientLike;
  model?: string;
  input: unknown;
  schemaName: string;
  schema: unknown;
  timeoutMs: number;
  emptyOutputMessage: string;
};

type UploadPdfArgs = {
  client?: OpenAiClientLike;
  model?: string;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  timeoutMs: number;
};

type WithUploadedPdfArgs<T> = UploadPdfArgs & {
  run: (context: {
    client: OpenAiClientLike;
    model: string;
    fileId: string;
    bytes: number | null;
  }) => Promise<T>;
};

function readTrimmedEnvVar(name: string): string | null {
  const value = process.env[name];
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getOpenAiStructuredOutputConfig(): {
  apiKey: string;
  model: string;
} {
  const apiKey = readTrimmedEnvVar("OPENAI_API_KEY");
  const model = readTrimmedEnvVar("OPENAI_MODEL");

  const missing: string[] = [];
  if (!apiKey) {
    missing.push("OPENAI_API_KEY");
  }
  if (!model) {
    missing.push("OPENAI_MODEL");
  }

  if (missing.length > 0) {
    throw new OpenAiStructuredOutputError(
      `OpenAI structured output is not configured. Missing environment variables: ${missing.join(", ")}`,
    );
  }

  return { apiKey: apiKey as string, model: model as string };
}

export function createOpenAiClient(apiKey?: string): OpenAiClientLike {
  const resolvedApiKey = apiKey || getOpenAiStructuredOutputConfig().apiKey;
  return new OpenAI({
    apiKey: resolvedApiKey,
  }) as unknown as OpenAiClientLike;
}

function resolveClientAndModel(
  client?: OpenAiClientLike,
  model?: string,
): { client: OpenAiClientLike; model: string } {
  const resolvedModel = model || readTrimmedEnvVar("OPENAI_MODEL");
  if (!resolvedModel) {
    throw new OpenAiStructuredOutputError(
      "OpenAI structured output is not configured. Missing environment variable: OPENAI_MODEL",
    );
  }

  return {
    client: client || createOpenAiClient(),
    model: resolvedModel,
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = "OpenAI request",
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new OpenAiStructuredOutputError(`${label} timed out after ${timeoutMs}ms.`),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function extractOutputText(response: OpenAiResponseShape): string | null {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const outputText = (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("")
    .trim();

  return outputText.length > 0 ? outputText : null;
}

export function parseJsonOutput<T>(
  response: OpenAiResponseShape,
  emptyOutputMessage: string,
): T {
  const outputText = extractOutputText(response);

  if (!outputText) {
    throw new OpenAiStructuredOutputError(emptyOutputMessage);
  }

  try {
    return JSON.parse(outputText) as T;
  } catch (_error) {
    throw new OpenAiStructuredOutputError("OpenAI returned invalid JSON output.");
  }
}

export async function requestStructuredJson<T>(
  args: StructuredJsonRequestArgs,
): Promise<T> {
  const { client, model } = resolveClientAndModel(args.client, args.model);

  try {
    const response = await withTimeout(
      client.responses.create({
        model,
        input: args.input,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: args.schemaName,
            strict: true,
            schema: args.schema,
          },
        },
      }),
      args.timeoutMs,
    );

    return parseJsonOutput<T>(response, args.emptyOutputMessage);
  } catch (error) {
    if (error instanceof OpenAiStructuredOutputError) {
      throw error;
    }

    throw new OpenAiStructuredOutputError(
      error instanceof Error
        ? `OpenAI structured output request failed: ${error.message}`
        : "OpenAI structured output request failed.",
    );
  }
}

export async function uploadPdfAsUserData(args: UploadPdfArgs): Promise<{
  client: OpenAiClientLike;
  model: string;
  fileId: string;
  bytes: number | null;
}> {
  const { client, model } = resolveClientAndModel(args.client, args.model);

  try {
    const uploadedFile = await withTimeout(
      client.files.create({
        file: await toFile(args.fileBuffer, args.filename, {
          type: args.mimeType,
        }),
        purpose: "user_data",
      }),
      args.timeoutMs,
      "OpenAI file upload",
    );

    return {
      client,
      model,
      fileId: uploadedFile.id,
      bytes:
        typeof uploadedFile.bytes === "number" && Number.isFinite(uploadedFile.bytes)
          ? uploadedFile.bytes
          : null,
    };
  } catch (error) {
    if (error instanceof OpenAiStructuredOutputError) {
      throw error;
    }

    throw new OpenAiStructuredOutputError(
      error instanceof Error
        ? `OpenAI file upload failed: ${error.message}`
        : "OpenAI file upload failed.",
    );
  }
}

export async function deleteUploadedFile(
  client: OpenAiClientLike,
  fileId: string,
): Promise<void> {
  try {
    await client.files.delete(fileId);
  } catch (_error) {
    // Ignore cleanup failures for transient uploaded files.
  }
}

export async function withUploadedPdf<T>(
  args: WithUploadedPdfArgs<T>,
): Promise<T> {
  const upload = await uploadPdfAsUserData(args);

  try {
    return await args.run(upload);
  } finally {
    await deleteUploadedFile(upload.client, upload.fileId);
  }
}
