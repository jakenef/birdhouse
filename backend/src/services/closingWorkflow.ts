import { PropertyStore } from "./propertyStore";
import {
  PipelineClassificationLabel,
  PropertyWorkflowState,
} from "../types/workflow";
import { createInitialWorkflowState } from "./earnestWorkflow";

export type ClosingStepView = {
  property_id: string;
  property_email: string | null;
  current_label: "closing";
  step_status: "locked" | "action_needed" | "waiting_for_parties" | "completed";
  locked_reason: string | null;
  pending_user_action: "none" | "confirm_closing_complete";
  prompt_to_user: string | null;
  latest_email_analysis: {
    message_id: string | null;
    thread_id: string | null;
    pipeline_label: PipelineClassificationLabel;
    summary: string | null;
    confidence: number | null;
    reason: string | null;
  };
  evidence_document: {
    document_id: string | null;
    filename: string | null;
  };
};

export class ClosingWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosingWorkflowError";
  }
}

type ApplyClosingDetectionInput = {
  messageId: string;
  threadId: string;
  documentId: string;
  filename: string;
  summary: string | null;
  confidence: number;
  reason: string;
  analyzedAtIso: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function cloneWorkflowState(workflowState: PropertyWorkflowState): PropertyWorkflowState {
  return JSON.parse(JSON.stringify(workflowState)) as PropertyWorkflowState;
}

function createEmptyClosingSuggestion() {
  return {
    pending_user_action: "none" as const,
    prompt_to_user: null,
    evidence_message_id: null,
    evidence_thread_id: null,
    evidence_document_id: null,
    evidence_filename: null,
    latest_summary: null,
    latest_confidence: null,
    latest_reason: null,
    latest_pipeline_label: "unknown" as const,
    updated_at_iso: null,
  };
}

function setClosingSuggestion(
  workflowState: PropertyWorkflowState,
  values: Partial<PropertyWorkflowState["closing_stage"]["suggestion"]>,
) {
  workflowState.closing_stage.suggestion = {
    ...(workflowState.closing_stage?.suggestion || createEmptyClosingSuggestion()),
    ...values,
  };
}

function ensureClosingState(
  workflowState: PropertyWorkflowState,
): PropertyWorkflowState {
  const next = cloneWorkflowState(workflowState);

  if (!next.closing_stage) {
    next.closing_stage = {
      suggestion: createEmptyClosingSuggestion(),
    };
  } else if (!next.closing_stage.suggestion) {
    next.closing_stage.suggestion = createEmptyClosingSuggestion();
  }

  return next;
}

function toClosingView(
  propertyId: string,
  propertyEmail: string | null,
  workflowState: PropertyWorkflowState,
): ClosingStepView {
  const step = workflowState.steps.closing;
  const suggestion = workflowState.closing_stage.suggestion;

  return {
    property_id: propertyId,
    property_email: propertyEmail,
    current_label: "closing",
    step_status: step.status,
    locked_reason: step.locked_reason,
    pending_user_action: suggestion.pending_user_action,
    prompt_to_user: suggestion.prompt_to_user,
    latest_email_analysis: {
      message_id: suggestion.evidence_message_id,
      thread_id: suggestion.evidence_thread_id,
      pipeline_label: suggestion.latest_pipeline_label,
      summary: suggestion.latest_summary,
      confidence: suggestion.latest_confidence,
      reason: suggestion.latest_reason,
    },
    evidence_document: {
      document_id: suggestion.evidence_document_id,
      filename: suggestion.evidence_filename,
    },
  };
}

export class ClosingWorkflowService {
  constructor(private readonly propertyStore: PropertyStore) {}

  private async loadPropertyOrThrow(propertyId: string) {
    const property = await this.propertyStore.findById(propertyId);
    if (!property) {
      throw new ClosingWorkflowError("Property not found.");
    }

    return property;
  }

  private async resolveWorkflowState(propertyId: string): Promise<PropertyWorkflowState> {
    const existing = await this.propertyStore.getWorkflowState(propertyId);
    if (!existing) {
      const initial = createInitialWorkflowState();
      const enriched = ensureClosingState(initial);
      await this.propertyStore.updateWorkflowState(propertyId, enriched);
      return enriched;
    }

    if (existing.closing_stage?.suggestion) {
      return existing;
    }

    const enriched = ensureClosingState(existing);
    await this.propertyStore.updateWorkflowState(propertyId, enriched);
    return enriched;
  }

  async getClosingStep(propertyId: string): Promise<ClosingStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    const workflowState = await this.resolveWorkflowState(propertyId);

    return toClosingView(property.id, property.property_email, workflowState);
  }

  async applyAltaDetection(
    propertyId: string,
    input: ApplyClosingDetectionInput,
  ): Promise<ClosingStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    const workflowState = ensureClosingState(
      await this.resolveWorkflowState(propertyId),
    );

    if (workflowState.steps.closing.status === "completed") {
      return toClosingView(property.id, property.property_email, workflowState);
    }

    const next = cloneWorkflowState(workflowState);
    next.current_label = "closing";
    next.steps.closing = {
      label: "closing",
      status: "action_needed",
      locked_reason: null,
      last_transition_at_iso: input.analyzedAtIso,
      last_transition_reason: "ALTA closing document received.",
    };
    setClosingSuggestion(next, {
      pending_user_action: "confirm_closing_complete",
      prompt_to_user:
        "An ALTA closing document was received. Is this closed? Mark complete when ready.",
      evidence_message_id: input.messageId,
      evidence_thread_id: input.threadId,
      evidence_document_id: input.documentId,
      evidence_filename: input.filename,
      latest_summary:
        input.summary || "ALTA closing document detected for the transaction.",
      latest_confidence: input.confidence,
      latest_reason: input.reason,
      latest_pipeline_label: "closing",
      updated_at_iso: input.analyzedAtIso,
    });

    const updated = await this.propertyStore.updateWorkflowState(property.id, next);
    return toClosingView(updated.id, updated.property_email, next);
  }

  async confirmComplete(propertyId: string): Promise<ClosingStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    const workflowState = ensureClosingState(
      await this.resolveWorkflowState(propertyId),
    );

    if (
      workflowState.steps.closing.status !== "action_needed" ||
      workflowState.closing_stage.suggestion.pending_user_action !==
        "confirm_closing_complete"
    ) {
      throw new ClosingWorkflowError(
        "Closing can only be completed when user confirmation is pending.",
      );
    }

    const completedAtIso = nowIso();
    const next = cloneWorkflowState(workflowState);
    next.current_label = "closing";

    for (const key of Object.keys(next.steps) as Array<keyof PropertyWorkflowState["steps"]>) {
      next.steps[key] = {
        ...next.steps[key],
        status: "completed",
        locked_reason: null,
        last_transition_at_iso: completedAtIso,
        last_transition_reason:
          key === "closing"
            ? "User confirmed closing complete after ALTA was received."
            : "Marked completed when closing was confirmed.",
      };
    }

    setClosingSuggestion(next, {
      pending_user_action: "none",
      prompt_to_user: null,
      latest_pipeline_label: "closing",
      updated_at_iso: completedAtIso,
    });

    const updated = await this.propertyStore.updateWorkflowState(property.id, next);
    return toClosingView(updated.id, updated.property_email, next);
  }
}
