import { buildEmailPipelinePrompt } from "../prompts/emailPipelineParser";
import {
  EmailActionOwnerRole,
  EmailParserInput,
  EmailParserResult,
  emailPipelineParserSchema,
} from "../schemas/emailPipelineParser.schema";
import { requestStructuredJson } from "./openaiStructuredOutput";

const defaultTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || "60000");
const maxBodyChars = 12000;
const keptHeadChars = 7000;
const keptTailChars = 4000;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/table|\/section|\/article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function truncateLongText(text: string): string {
  if (text.length <= maxBodyChars) {
    return text;
  }

  const head = text.slice(0, keptHeadChars).trim();
  const tail = text.slice(-keptTailChars).trim();

  return [
    head,
    "",
    "[... email body truncated for length ...]",
    "",
    tail,
  ].join("\n");
}

function normalizeBody(input: EmailParserInput): string {
  const preferredBody = input.text_body?.trim();
  if (preferredBody) {
    return truncateLongText(preferredBody);
  }

  const htmlBody = input.html_body?.trim();
  if (htmlBody) {
    return truncateLongText(stripHtml(htmlBody));
  }

  return "";
}

function buildFallbackResult(warnings: string[]): EmailParserResult {
  return {
    summary: "Email content was empty or too limited to classify reliably.",
    primary_stage: "unknown",
    substage: null,
    urgency: "low",
    confidence: 0,
    key_facts: {
      dates: [],
      people: [],
      actions: [],
      money: [],
    },
    warnings,
  };
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function tryParseRelativeDate(
  rawText: string,
  receivedAtIso?: string | null,
): string | null {
  if (!receivedAtIso) {
    return null;
  }

  const receivedDate = new Date(receivedAtIso);
  if (Number.isNaN(receivedDate.getTime())) {
    return null;
  }

  const normalized = rawText.trim().toLowerCase();
  const baseDate = new Date(
    Date.UTC(
      receivedDate.getUTCFullYear(),
      receivedDate.getUTCMonth(),
      receivedDate.getUTCDate(),
    ),
  );

  if (normalized === "today") {
    return formatIsoDate(baseDate);
  }

  if (normalized === "tomorrow") {
    baseDate.setUTCDate(baseDate.getUTCDate() + 1);
    return formatIsoDate(baseDate);
  }

  if (normalized === "yesterday") {
    baseDate.setUTCDate(baseDate.getUTCDate() - 1);
    return formatIsoDate(baseDate);
  }

  return null;
}

function sanitizeOwnerRole(role: EmailActionOwnerRole | string): EmailActionOwnerRole {
  const allowedRoles: EmailActionOwnerRole[] = [
    "agent",
    "buyer",
    "seller",
    "lender",
    "escrow",
    "title",
    "unknown",
  ];

  return allowedRoles.includes(role as EmailActionOwnerRole)
    ? (role as EmailActionOwnerRole)
    : "unknown";
}

function sanitizeResult(
  result: EmailParserResult,
  input: EmailParserInput,
): EmailParserResult {
  return {
    ...result,
    summary: result.summary.trim(),
    key_facts: {
      dates: result.key_facts.dates
        .map((dateFact) => {
          const rawText = dateFact.raw_text.trim();
          const isoDate =
            dateFact.iso_date || tryParseRelativeDate(rawText, input.received_at_iso);

          return {
            label: dateFact.label.trim(),
            iso_date: isoDate,
            raw_text: rawText,
          };
        })
        .filter((dateFact) => dateFact.label.length > 0 && dateFact.raw_text.length > 0),
      people: result.key_facts.people
        .map((person) => ({
          role: person.role.trim(),
          name: person.name.trim(),
        }))
        .filter((person) => person.name.length > 0),
      actions: result.key_facts.actions
        .map((action) => ({
          action: action.action.trim(),
          owner_role: sanitizeOwnerRole(action.owner_role),
          due_date: action.due_date,
        }))
        .filter((action) => action.action.length > 0),
      money: result.key_facts.money
        .map((moneyFact) => ({
          label: moneyFact.label.trim(),
          amount: moneyFact.amount,
          raw_text: moneyFact.raw_text.trim(),
        }))
        .filter((moneyFact) => moneyFact.label.length > 0 || moneyFact.raw_text.length > 0),
    },
    warnings: [...result.warnings],
  };
}

function mergeWarnings(
  result: EmailParserResult,
  normalizedBody: string,
): EmailParserResult {
  const warnings = [...result.warnings];

  if (normalizedBody.length < 20) {
    if (!warnings.includes("Email body is empty or nearly empty.")) {
      warnings.push("Email body is empty or nearly empty.");
    }
  }

  if (result.primary_stage === "unknown" && !warnings.includes("Email stage is ambiguous.")) {
    warnings.push("Email stage is ambiguous.");
  }

  if (result.primary_stage !== "financing_period" && result.substage !== null) {
    result = {
      ...result,
      substage: null,
    };
    if (!warnings.includes("Appraisal substage is only valid under financing_period.")) {
      warnings.push("Appraisal substage is only valid under financing_period.");
    }
  }

  for (const dateFact of result.key_facts.dates) {
    if (dateFact.raw_text.trim() && dateFact.iso_date === null) {
      const warning = `Could not normalize explicit date text: ${dateFact.raw_text}`;
      if (!warnings.includes(warning)) {
        warnings.push(warning);
      }
    }
  }

  return {
    ...result,
    warnings,
  };
}

export async function parseEmailPipeline(
  input: EmailParserInput,
  options?: { timeoutMs?: number },
): Promise<EmailParserResult> {
  const normalizedBody = normalizeBody(input);

  if (normalizedBody.length < 5) {
    return buildFallbackResult(["Email body is empty or nearly empty."]);
  }

  const result = await requestStructuredJson<EmailParserResult>({
    input: buildEmailPipelinePrompt({
      email: input,
      normalizedBody,
    }),
    schemaName: "email_pipeline_parser",
    schema: emailPipelineParserSchema,
    timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
    emptyOutputMessage: "OpenAI returned no email pipeline parser output.",
  });

  return mergeWarnings(sanitizeResult(result, input), normalizedBody);
}

export type {
  EmailActionOwnerRole,
  EmailParserInput,
  EmailParserResult,
  EmailPipelineStage,
  EmailPipelineSubstage,
} from "../schemas/emailPipelineParser.schema";
