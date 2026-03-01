import { PipelineClassificationLabel } from "./workflow";

export type EarnestInboundSignal =
  | "none"
  | "wire_instructions_provided"
  | "earnest_received_confirmation";

export type InboxSuggestedUserAction =
  | "none"
  | "confirm_earnest_complete";

export type InboxMessageAnalysis = {
  version: 1;
  pipeline_label: PipelineClassificationLabel;
  summary: string;
  confidence: number;
  reason: string;
  earnest_signal: EarnestInboundSignal;
  suggested_user_action: InboxSuggestedUserAction;
  warnings: string[];
  analyzed_at_iso: string;
};
