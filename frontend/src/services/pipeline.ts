import { getPropertyDocuments } from "./documents";
import type { Document, PropertyDocumentsProperty } from "../types/document";
import {
  PIPELINE_STAGE_ORDER,
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
