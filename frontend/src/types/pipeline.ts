export const PIPELINE_STAGE_ORDER = [
  "Under Contract",
  "Earnest Money",
  "Due Diligence / Inspection",
  "Financing",
  "Title / Escrow",
  "Closing",
  "Completed",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_ORDER)[number];

export type PipelineTaskStatus =
  | "done"
  | "pending"
  | "suggested_done"
  | "blocked";

export type PipelineStageStatus =
  | "completed"
  | "current"
  | "upcoming"
  | "blocked";

export interface PipelineEvidence {
  id: string;
  filename: string;
  createdAt: string;
  downloadUrl: string;
}

export interface PipelineTask {
  id: string;
  title: string;
  stage: PipelineStageName;
  status: PipelineTaskStatus;
  dueDate: string | null;
  completedDate: string | null;
  evidence?: PipelineEvidence;
  propertyId: string;
}

export interface PipelineStage {
  name: PipelineStageName;
  status: PipelineStageStatus;
  totalTasks: number;
  completedTasks: number;
  lastCompletedDate: string | null;
}

export interface PropertyPipelineData {
  propertyId: string;
  propertyName: string;
  stages: PipelineStage[];
  tasks: PipelineTask[];
  currentStage: PipelineStageName;
  capabilities: {
    canConfirmTaskRemotely: boolean;
  };
}

export type EarnestStepStatus =
  | "locked"
  | "action_needed"
  | "waiting_for_parties"
  | "completed";

export type EarnestPendingUserAction =
  | "none"
  | "send_earnest_email"
  | "confirm_earnest_complete";

export type EarnestPipelineLabel =
  | "under_contract"
  | "earnest_money"
  | "due_diligence_inspection"
  | "financing"
  | "title_escrow"
  | "closing"
  | "unknown";

export interface EarnestStepData {
  propertyId: string;
  propertyEmail: string | null;
  currentLabel: "earnest_money";
  stepStatus: EarnestStepStatus;
  lockedReason: string | null;
  pendingUserAction: EarnestPendingUserAction;
  promptToUser: string | null;
  contact: {
    type: "escrow_officer";
    name: string;
    email: string;
    company?: string;
  } | null;
  attachment: {
    documentId: string;
    filename: string;
  } | null;
  draft: {
    subject: string | null;
    body: string | null;
    generatedAtIso: string | null;
    openAiModel: string | null;
    generationReason: string | null;
  };
  sendState: {
    threadId: string | null;
    messageId: string | null;
    sentAtIso: string | null;
  };
  latestEmailAnalysis: {
    messageId: string | null;
    threadId: string | null;
    pipelineLabel: EarnestPipelineLabel;
    summary: string | null;
    confidence: number | null;
    reason: string | null;
    earnestSignal:
      | "none"
      | "wire_instructions_provided"
      | "earnest_received_confirmation";
  };
}
