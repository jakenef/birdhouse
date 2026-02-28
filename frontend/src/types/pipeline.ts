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
