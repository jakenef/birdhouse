export type PipelineStepStatus =
  | "locked"
  | "action_needed"
  | "waiting_for_parties"
  | "completed";

export type PipelineLabel =
  | "under_contract"
  | "earnest_money"
  | "due_diligence_inspection"
  | "financing"
  | "title_escrow"
  | "closing";

export type PipelineClassificationLabel = PipelineLabel | "unknown";

export type WorkflowStepState = {
  label: PipelineLabel;
  status: PipelineStepStatus;
  locked_reason: string | null;
  last_transition_at_iso: string;
  last_transition_reason: string | null;
};

export type EarnestDraftState = {
  status: "missing" | "ready" | "sent";
  generated_at_iso: string | null;
  subject: string | null;
  body: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  contact_type: "escrow_officer";
  attachment_document_id: string | null;
  attachment_filename: string | null;
  openai_model: string | null;
  generation_reason: string | null;
  thread_id: string | null;
  sent_message_id: string | null;
  sent_at_iso: string | null;
  last_error: string | null;
};

export type EarnestPendingUserAction =
  | "none"
  | "send_earnest_email"
  | "confirm_earnest_complete";

export type EarnestAgentSuggestion = {
  pending_user_action: EarnestPendingUserAction;
  prompt_to_user: string | null;
  evidence_message_id: string | null;
  evidence_thread_id: string | null;
  latest_summary: string | null;
  latest_confidence: number | null;
  latest_reason: string | null;
  latest_pipeline_label: PipelineClassificationLabel;
  latest_earnest_signal:
    | "none"
    | "wire_instructions_provided"
    | "earnest_received_confirmation";
  updated_at_iso: string | null;
};

export type PropertyWorkflowState = {
  version: 1;
  current_label: PipelineLabel;
  steps: {
    under_contract: WorkflowStepState;
    earnest_money: WorkflowStepState;
    due_diligence_inspection: WorkflowStepState;
    financing: WorkflowStepState;
    title_escrow: WorkflowStepState;
    closing: WorkflowStepState;
  };
  earnest: {
    draft: EarnestDraftState;
    suggestion: EarnestAgentSuggestion;
  };
};
