import { getPropertyDocuments } from "./documents";
import type { Document, PropertyDocumentsProperty } from "../types/document";
import {
  PIPELINE_STAGE_ORDER,
  type EarnestPendingUserAction,
  type EarnestPipelineLabel,
  type EarnestStepData,
  type EarnestStepStatus,
  type PipelineEvidence,
  type PipelineStage,
  type PipelineStageName,
  type PipelineTask,
  type PipelineTaskStatus,
  type PropertyPipelineData,
} from "../types/pipeline";
import {
  computeCurrentStageId,
  computeStageCompletion,
  isTaskDone,
  stageIsFuture,
} from "../utils/pipelineDerived";

const CONFIRMED_TASKS_STORAGE_PREFIX = "pipeline_confirmed_tasks";

type ApiEarnestStepStatus = EarnestStepStatus;
type ApiEarnestPendingUserAction = EarnestPendingUserAction;
type ApiEarnestPipelineLabel = EarnestPipelineLabel;

type ApiEarnestResponse = {
  earnest: {
    property_id: string;
    property_email: string | null;
    current_label: "earnest_money";
    step_status: ApiEarnestStepStatus;
    locked_reason: string | null;
    pending_user_action: ApiEarnestPendingUserAction;
    prompt_to_user: string | null;
    contact:
      | {
          type: "escrow_officer";
          name: string;
          email: string;
          company?: string | null;
        }
      | null;
    attachment:
      | {
          document_id: string;
          filename: string;
        }
      | null;
    draft: {
      subject: string | null;
      body: string | null;
      generated_at_iso: string | null;
      openai_model: string | null;
      generation_reason: string | null;
    };
    send_state: {
      thread_id: string | null;
      message_id: string | null;
      sent_at_iso: string | null;
    };
    latest_email_analysis: {
      message_id: string | null;
      thread_id: string | null;
      pipeline_label: ApiEarnestPipelineLabel;
      summary: string | null;
      confidence: number | null;
      reason: string | null;
      earnest_signal:
        | "none"
        | "wire_instructions_provided"
        | "earnest_received_confirmation";
    };
  };
};

type DraftTask = {
  id: string;
  title: string;
  stage: PipelineStageName;
  dueDate: string | null;
  completedDate: string | null;
  evidence?: PipelineEvidence;
  dependsOn: string[];
  explicitStatus?: PipelineTaskStatus;
};

function toIsoDate(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEarnestStepStatus(value: unknown): value is ApiEarnestStepStatus {
  return (
    value === "locked" ||
    value === "action_needed" ||
    value === "waiting_for_parties" ||
    value === "completed"
  );
}

function isEarnestPendingUserAction(
  value: unknown,
): value is ApiEarnestPendingUserAction {
  return (
    value === "none" ||
    value === "send_earnest_email" ||
    value === "confirm_earnest_complete"
  );
}

function isEarnestPipelineLabel(
  value: unknown,
): value is ApiEarnestPipelineLabel {
  return (
    value === "under_contract" ||
    value === "earnest_money" ||
    value === "due_diligence_inspection" ||
    value === "financing" ||
    value === "title_escrow" ||
    value === "closing" ||
    value === "unknown"
  );
}

function isApiEarnestResponse(value: unknown): value is ApiEarnestResponse {
  if (!isRecord(value) || !isRecord(value.earnest)) {
    return false;
  }

  const earnest = value.earnest;
  const contact = earnest.contact;
  const attachment = earnest.attachment;
  const draft = earnest.draft;
  const sendState = earnest.send_state;
  const latestAnalysis = earnest.latest_email_analysis;

  return (
    typeof earnest.property_id === "string" &&
    (typeof earnest.property_email === "string" || earnest.property_email === null) &&
    earnest.current_label === "earnest_money" &&
    isEarnestStepStatus(earnest.step_status) &&
    (typeof earnest.locked_reason === "string" || earnest.locked_reason === null) &&
    isEarnestPendingUserAction(earnest.pending_user_action) &&
    (typeof earnest.prompt_to_user === "string" || earnest.prompt_to_user === null) &&
    (contact === null ||
      (isRecord(contact) &&
        contact.type === "escrow_officer" &&
        typeof contact.name === "string" &&
        typeof contact.email === "string" &&
        (typeof contact.company === "string" ||
          typeof contact.company === "undefined" ||
          contact.company === null))) &&
    (attachment === null ||
      (isRecord(attachment) &&
        typeof attachment.document_id === "string" &&
        typeof attachment.filename === "string")) &&
    isRecord(draft) &&
    (typeof draft.subject === "string" || draft.subject === null) &&
    (typeof draft.body === "string" || draft.body === null) &&
    (typeof draft.generated_at_iso === "string" || draft.generated_at_iso === null) &&
    (typeof draft.openai_model === "string" || draft.openai_model === null) &&
    (typeof draft.generation_reason === "string" || draft.generation_reason === null) &&
    isRecord(sendState) &&
    (typeof sendState.thread_id === "string" || sendState.thread_id === null) &&
    (typeof sendState.message_id === "string" || sendState.message_id === null) &&
    (typeof sendState.sent_at_iso === "string" || sendState.sent_at_iso === null) &&
    isRecord(latestAnalysis) &&
    (typeof latestAnalysis.message_id === "string" ||
      latestAnalysis.message_id === null) &&
    (typeof latestAnalysis.thread_id === "string" ||
      latestAnalysis.thread_id === null) &&
    isEarnestPipelineLabel(latestAnalysis.pipeline_label) &&
    (typeof latestAnalysis.summary === "string" || latestAnalysis.summary === null) &&
    (typeof latestAnalysis.confidence === "number" ||
      latestAnalysis.confidence === null) &&
    (typeof latestAnalysis.reason === "string" || latestAnalysis.reason === null) &&
    (latestAnalysis.earnest_signal === "none" ||
      latestAnalysis.earnest_signal === "wire_instructions_provided" ||
      latestAnalysis.earnest_signal === "earnest_received_confirmation")
  );
}

function normalizeEarnestStep(response: ApiEarnestResponse): EarnestStepData {
  const earnest = response.earnest;

  return {
    propertyId: earnest.property_id,
    propertyEmail: earnest.property_email,
    currentLabel: earnest.current_label,
    stepStatus: earnest.step_status,
    lockedReason: earnest.locked_reason,
    pendingUserAction: earnest.pending_user_action,
    promptToUser: earnest.prompt_to_user,
    contact: earnest.contact
      ? {
          type: earnest.contact.type,
          name: earnest.contact.name,
          email: earnest.contact.email,
          company: earnest.contact.company || undefined,
        }
      : null,
    attachment: earnest.attachment
      ? {
          documentId: earnest.attachment.document_id,
          filename: earnest.attachment.filename,
        }
      : null,
    draft: {
      subject: earnest.draft.subject,
      body: earnest.draft.body,
      generatedAtIso: earnest.draft.generated_at_iso,
      openAiModel: earnest.draft.openai_model,
      generationReason: earnest.draft.generation_reason,
    },
    sendState: {
      threadId: earnest.send_state.thread_id,
      messageId: earnest.send_state.message_id,
      sentAtIso: earnest.send_state.sent_at_iso,
    },
    latestEmailAnalysis: {
      messageId: earnest.latest_email_analysis.message_id,
      threadId: earnest.latest_email_analysis.thread_id,
      pipelineLabel: earnest.latest_email_analysis.pipeline_label,
      summary: earnest.latest_email_analysis.summary,
      confidence: earnest.latest_email_analysis.confidence,
      reason: earnest.latest_email_analysis.reason,
      earnestSignal: earnest.latest_email_analysis.earnest_signal,
    },
  };
}

async function requestEarnestStep(
  propertyId: string,
  path: string,
  init?: RequestInit,
): Promise<EarnestStepData> {
  const response = await fetch(
    `/api/properties/${encodeURIComponent(propertyId)}/pipeline/earnest${path}`,
    init,
  );

  if (!response.ok) {
    throw new Error(`Failed to load earnest step (${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!isApiEarnestResponse(payload)) {
    throw new Error("Invalid earnest step response.");
  }

  return normalizeEarnestStep(payload);
}

function addDays(isoDate: string | null, days: number): string | null {
  if (!isoDate) {
    return null;
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString();
}

function subtractDays(isoDate: string | null, days: number): string | null {
  return addDays(isoDate, -days);
}

function evidenceFromDocument(document: Document): PipelineEvidence {
  return {
    id: document.id,
    filename: document.filename,
    createdAt: document.created_at,
    downloadUrl: document.download_url,
  };
}

function findEvidence(
  documents: Document[],
  matcher: RegExp,
): PipelineEvidence | undefined {
  const match = documents
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .find((document) => matcher.test(document.filename.toLowerCase()));

  return match ? evidenceFromDocument(match) : undefined;
}

function getConfirmedStorageKey(propertyId: string): string {
  return `${CONFIRMED_TASKS_STORAGE_PREFIX}:${propertyId}`;
}

function readConfirmedTaskDates(propertyId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(getConfirmedStorageKey(propertyId));
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.length > 0) {
        output[key] = value;
      }
    }
    return output;
  } catch {
    return {};
  }
}

function writeConfirmedTaskDates(
  propertyId: string,
  taskDates: Record<string, string>,
): void {
  window.localStorage.setItem(
    getConfirmedStorageKey(propertyId),
    JSON.stringify(taskDates),
  );
}

function taskSortValue(task: DraftTask): number {
  const stageIndex = PIPELINE_STAGE_ORDER.indexOf(task.stage);
  return stageIndex * 100 + Number(task.id.split("_").pop() || 0);
}

function buildDraftTasks(property: PropertyDocumentsProperty): DraftTask[] {
  const documents = property.documents || [];
  const createdAt =
    toIsoDate(property.created_at_iso) ||
    toIsoDate(property.effective_date) ||
    new Date().toISOString();
  const effectiveDate = toIsoDate(property.effective_date) || createdAt;
  const settlementDate = toIsoDate(property.settlement_deadline);

  const earnestEvidence = findEvidence(documents, /(earnest|deposit|wire|receipt)/);
  const inspectionEvidence = findEvidence(
    documents,
    /(inspection|home[-_ ]?inspect|inspection report)/,
  );
  const disclosureEvidence = findEvidence(
    documents,
    /(disclosure|seller[-_ ]?disclosure)/,
  );
  const financingEvidence = findEvidence(
    documents,
    /(loan|lender|financing|mortgage|commitment|approval)/,
  );
  const appraisalEvidence = findEvidence(documents, /(appraisal)/);
  const titleEvidence = findEvidence(
    documents,
    /(title|prelim title|title report)/,
  );
  const escrowEvidence = findEvidence(
    documents,
    /(escrow|alta|settlement statement)/,
  );
  const closingPackageEvidence = findEvidence(
    documents,
    /(closing disclosure|final closing|final settlement|hud|signing package)/,
  );
  const closedEvidence = findEvidence(
    documents,
    /(recorded|funded|closed|deed|final executed)/,
  );

  const maybeClosedByDate =
    settlementDate && new Date(settlementDate).getTime() < Date.now()
      ? settlementDate
      : null;

  return [
    {
      id: "under_contract_1",
      title: "Purchase agreement accepted",
      stage: "Under Contract",
      dueDate: effectiveDate,
      completedDate: createdAt,
      dependsOn: [],
    },
    {
      id: "earnest_money_1",
      title: "Earnest money deposit confirmed",
      stage: "Earnest Money",
      dueDate: addDays(effectiveDate, 3),
      completedDate: null,
      evidence: earnestEvidence,
      explicitStatus: earnestEvidence ? "suggested_done" : undefined,
      dependsOn: ["under_contract_1"],
    },
    {
      id: "due_diligence_1",
      title: "Inspection report reviewed",
      stage: "Due Diligence / Inspection",
      dueDate: addDays(effectiveDate, 10),
      completedDate: null,
      evidence: inspectionEvidence,
      explicitStatus: inspectionEvidence ? "suggested_done" : undefined,
      dependsOn: ["earnest_money_1"],
    },
    {
      id: "due_diligence_2",
      title: "Seller disclosures reviewed",
      stage: "Due Diligence / Inspection",
      dueDate: addDays(effectiveDate, 14),
      completedDate: null,
      evidence: disclosureEvidence,
      explicitStatus: disclosureEvidence ? "suggested_done" : undefined,
      dependsOn: ["due_diligence_1"],
    },
    {
      id: "financing_1",
      title: "Loan approval in progress",
      stage: "Financing",
      dueDate: subtractDays(settlementDate, 21) || addDays(effectiveDate, 20),
      completedDate: null,
      evidence: financingEvidence,
      explicitStatus: financingEvidence ? "suggested_done" : undefined,
      dependsOn: ["due_diligence_2"],
    },
    {
      id: "financing_2",
      title: "Appraisal completed",
      stage: "Financing",
      dueDate: subtractDays(settlementDate, 18) || addDays(effectiveDate, 23),
      completedDate: null,
      evidence: appraisalEvidence,
      explicitStatus: appraisalEvidence ? "suggested_done" : undefined,
      dependsOn: ["financing_1"],
    },
    {
      id: "title_escrow_1",
      title: "Preliminary title reviewed",
      stage: "Title / Escrow",
      dueDate: subtractDays(settlementDate, 14),
      completedDate: null,
      evidence: titleEvidence,
      explicitStatus: titleEvidence ? "suggested_done" : undefined,
      dependsOn: ["financing_2"],
    },
    {
      id: "title_escrow_2",
      title: "Escrow package confirmed",
      stage: "Title / Escrow",
      dueDate: subtractDays(settlementDate, 7),
      completedDate: null,
      evidence: escrowEvidence,
      explicitStatus: escrowEvidence ? "suggested_done" : undefined,
      dependsOn: ["title_escrow_1"],
    },
    {
      id: "closing_1",
      title: "Final closing package prepared",
      stage: "Closing",
      dueDate: subtractDays(settlementDate, 2),
      completedDate: null,
      evidence: closingPackageEvidence,
      explicitStatus: closingPackageEvidence ? "suggested_done" : undefined,
      dependsOn: ["title_escrow_2"],
    },
    {
      id: "closing_2",
      title: "Closing completed",
      stage: "Closing",
      dueDate: settlementDate,
      completedDate: closedEvidence?.createdAt || maybeClosedByDate,
      evidence: closedEvidence,
      dependsOn: ["closing_1"],
    },
    {
      id: "completed_1",
      title: "Deal archived as completed",
      stage: "Completed",
      dueDate: null,
      completedDate: null,
      dependsOn: ["closing_2"],
    },
  ];
}

function baseStatus(task: DraftTask): PipelineTaskStatus {
  if (task.explicitStatus) {
    return task.explicitStatus;
  }

  if (task.completedDate) {
    return "done";
  }

  return "pending";
}

function dependencyIsIncomplete(
  task: DraftTask,
  taskMap: Map<string, PipelineTask>,
): boolean {
  if (task.dependsOn.length === 0) {
    return false;
  }

  return task.dependsOn.some((dependencyId) => {
    const dependency = taskMap.get(dependencyId);
    return !dependency || !isTaskDone(dependency.status);
  });
}

export async function getPropertyPipeline(
  propertyId: string,
): Promise<PropertyPipelineData> {
  const response = await getPropertyDocuments(propertyId);
  const property = response.property;
  const confirmedTaskDates = readConfirmedTaskDates(propertyId);
  const draftTasks = buildDraftTasks(property)
    .map((task) => {
      const confirmedAt = confirmedTaskDates[task.id];
      if (!confirmedAt) {
        return task;
      }

      return {
        ...task,
        completedDate: confirmedAt,
        explicitStatus: undefined,
      };
    })
    .sort((a, b) => taskSortValue(a) - taskSortValue(b));

  const baseTasks: PipelineTask[] = draftTasks.map((task) => ({
    id: task.id,
    title: task.title,
    stage: task.stage,
    status: baseStatus(task),
    dueDate: task.dueDate,
    completedDate: task.completedDate,
    evidence: task.evidence,
    propertyId,
  }));

  const currentStage = computeCurrentStageId(PIPELINE_STAGE_ORDER, baseTasks);

  const provisionalById = new Map<string, PipelineTask>();
  const tasks: PipelineTask[] = draftTasks.map((task) => {
    let status = baseStatus(task);
    if (
      status === "pending" &&
      !stageIsFuture(PIPELINE_STAGE_ORDER, task.stage, currentStage) &&
      dependencyIsIncomplete(task, provisionalById)
    ) {
      status = "blocked";
    }

    const mapped: PipelineTask = {
      id: task.id,
      title: task.title,
      stage: task.stage,
      status,
      dueDate: task.dueDate,
      completedDate: task.completedDate,
      evidence: task.evidence,
      propertyId,
    };
    provisionalById.set(task.id, mapped);
    return mapped;
  });

  const recomputedCurrentStage = computeCurrentStageId(PIPELINE_STAGE_ORDER, tasks);

  const stages: PipelineStage[] = PIPELINE_STAGE_ORDER.map((stageName) => {
    const completion = computeStageCompletion(stageName, tasks);
    const stageTasks = tasks.filter((task) => task.stage === stageName);
    const hasBlocked = stageTasks.some((task) => task.status === "blocked");

    let status: PipelineStage["status"];
    if (completion.allComplete) {
      status = "completed";
    } else if (stageName === recomputedCurrentStage) {
      status = hasBlocked ? "blocked" : "current";
    } else if (
      stageIsFuture(PIPELINE_STAGE_ORDER, stageName, recomputedCurrentStage)
    ) {
      status = "upcoming";
    } else {
      status = "completed";
    }

    return {
      name: stageName,
      status,
      totalTasks: completion.totalTasks,
      completedTasks: completion.completedTasks,
      lastCompletedDate: completion.lastCompletedDate,
    };
  });

  return {
    propertyId,
    propertyName: property.property_name,
    stages,
    tasks,
    currentStage: recomputedCurrentStage,
    capabilities: {
      canConfirmTaskRemotely: false,
    },
  };
}

export async function confirmPipelineTask(
  propertyId: string,
  taskId: string,
): Promise<{ localOnly: boolean; message: string }> {
  const taskDates = readConfirmedTaskDates(propertyId);
  taskDates[taskId] = new Date().toISOString();
  writeConfirmedTaskDates(propertyId, taskDates);

  return {
    localOnly: true,
    message: "Mock: confirmed locally",
  };
}

// Only the Earnest step is backend-driven today. The rest of the pipeline
// timeline still comes from the local/mock timeline builder above.
export async function getEarnestStep(propertyId: string): Promise<EarnestStepData> {
  return requestEarnestStep(propertyId, "");
}

export async function prepareEarnestStep(
  propertyId: string,
): Promise<EarnestStepData> {
  return requestEarnestStep(propertyId, "/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function sendEarnestDraft(
  propertyId: string,
  input: { subject: string; body: string; bodyHtml?: string | null },
): Promise<EarnestStepData> {
  return requestEarnestStep(propertyId, "/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: input.subject,
      body: input.body,
      body_html: input.bodyHtml ?? null,
    }),
  });
}

export async function confirmEarnestWireSent(
  propertyId: string,
): Promise<EarnestStepData> {
  return requestEarnestStep(propertyId, "/confirm-wire-sent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function confirmEarnestComplete(
  propertyId: string,
): Promise<EarnestStepData> {
  return requestEarnestStep(propertyId, "/confirm-complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
}
