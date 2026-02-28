import { buildEarnestInboundSignalPrompt } from "../prompts/earnestInboundSignal";
import {
  EarnestInboundSignalExtraction,
  earnestInboundSignalSchema,
} from "../schemas/earnestInboundSignal.schema";
import { parseEmailPipeline } from "./emailPipelineParser";
import { requestStructuredJson } from "./openaiStructuredOutput";
import { InboxMessageAnalysis } from "../types/inbox";
import { PipelineClassificationLabel } from "../types/workflow";

export type EarnestInboundAnalyzerInput = {
  subject: string;
  from: string;
  to: string[];
  received_at_iso: string | null;
  text_body?: string | null;
  html_body?: string | null;
};

const defaultTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || "60000");

function mapStageToPipelineLabel(
  stage: ReturnType<typeof parseEmailPipeline> extends Promise<infer T>
    ? T extends { primary_stage: infer S }
      ? S
      : never
    : never,
): PipelineClassificationLabel {
  switch (stage) {
    case "earnest_money_deposit":
      return "earnest_money";
    case "due_diligence":
      return "due_diligence_inspection";
    case "financing_period":
      return "financing";
    case "title_escrow":
      return "title_escrow";
    case "signing_date":
    case "closing":
      return "closing";
    default:
      return "unknown";
  }
}

export async function analyzeEarnestInboundEmail(
  input: EarnestInboundAnalyzerInput,
  options?: { timeoutMs?: number },
): Promise<InboxMessageAnalysis> {
  const timeoutMs = options?.timeoutMs || defaultTimeoutMs;
  const pipeline = await parseEmailPipeline({
    subject: input.subject,
    from: input.from,
    to: input.to,
    received_at_iso: input.received_at_iso,
    text_body: input.text_body,
    html_body: input.html_body,
  });

  const pipelineLabel = mapStageToPipelineLabel(pipeline.primary_stage);
  const analyzedAtIso = new Date().toISOString();

  if (pipelineLabel !== "earnest_money") {
    return {
      version: 1,
      pipeline_label: pipelineLabel,
      summary: pipeline.summary,
      confidence: pipeline.confidence,
      reason: `Email classified as ${pipelineLabel}.`,
      earnest_signal: "none",
      suggested_user_action: "none",
      warnings: [...pipeline.warnings],
      analyzed_at_iso: analyzedAtIso,
    };
  }

  const signal = await requestStructuredJson<EarnestInboundSignalExtraction>({
    input: buildEarnestInboundSignalPrompt({
      subject: input.subject,
      from: input.from,
      to: input.to,
      received_at_iso: input.received_at_iso,
      text_body: input.text_body,
      html_body: input.html_body,
      pipeline_summary: pipeline.summary,
      pipeline_confidence: pipeline.confidence,
    }),
    schemaName: "earnest_inbound_signal",
    schema: earnestInboundSignalSchema,
    timeoutMs,
    emptyOutputMessage: "OpenAI returned no earnest inbound signal output.",
  });

  const warnings = [...pipeline.warnings, ...signal.warnings];

  return {
    version: 1,
    pipeline_label: pipelineLabel,
    summary: pipeline.summary,
    confidence: signal.confidence,
    reason: signal.reason.trim(),
    earnest_signal: signal.earnest_signal,
    suggested_user_action: signal.suggested_user_action,
    warnings,
    analyzed_at_iso: analyzedAtIso,
  };
}
