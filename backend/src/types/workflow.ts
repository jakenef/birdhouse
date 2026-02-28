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
    prompt_to_user: string | null;
  };
};
