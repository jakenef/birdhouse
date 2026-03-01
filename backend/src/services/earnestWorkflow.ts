import { Contact, ContactStore } from "./contactStore";
import { DocumentStore, StoredDocument } from "./documentStore";
import {
  EarnestDraftContext,
  generateEarnestDraft,
} from "./earnestDraftGenerator";
import {
  OutboundEmailService,
  SendOutboundEmailResult,
} from "./outboundEmailService";
import { PropertyStore } from "./propertyStore";
import {
  EarnestPendingUserAction,
  PipelineClassificationLabel,
  PropertyWorkflowState,
} from "../types/workflow";
import { EarnestInboundSignal, InboxMessageAnalysis } from "../types/inbox";

export type EarnestStepView = {
  property_id: string;
  property_email: string | null;
  current_label: "earnest_money";
  step_status: "locked" | "action_needed" | "waiting_for_parties" | "completed";
  locked_reason: string | null;
  pending_user_action: EarnestPendingUserAction;
  prompt_to_user: string | null;
  contact: {
    type: "escrow_officer";
    name: string;
    email: string;
    company?: string;
  } | null;
  attachment: {
    document_id: string;
    filename: string;
  } | null;
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
    pipeline_label: PipelineClassificationLabel;
    summary: string | null;
    confidence: number | null;
    reason: string | null;
    earnest_signal: EarnestInboundSignal;
  };
};

export class EarnestWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EarnestWorkflowError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function createStep(
  label: PropertyWorkflowState["steps"][keyof PropertyWorkflowState["steps"]]["label"],
  status: PropertyWorkflowState["steps"][keyof PropertyWorkflowState["steps"]]["status"],
  reason: string | null,
): PropertyWorkflowState["steps"][keyof PropertyWorkflowState["steps"]] {
  return {
    label,
    status,
    locked_reason: status === "locked" ? reason : null,
    last_transition_at_iso: nowIso(),
    last_transition_reason: reason,
  };
}

function createEmptySuggestion() {
  return {
    pending_user_action: "none" as const,
    prompt_to_user: null,
    evidence_message_id: null,
    evidence_thread_id: null,
    latest_summary: null,
    latest_confidence: null,
    latest_reason: null,
    latest_pipeline_label: "unknown" as const,
    latest_earnest_signal: "none" as const,
    updated_at_iso: null,
  };
}

export function createInitialWorkflowState(): PropertyWorkflowState {
  return {
    version: 1,
    current_label: "earnest_money",
    steps: {
      under_contract: createStep(
        "under_contract",
        "completed",
        "Property created from purchase contract intake.",
      ),
      earnest_money: createStep(
        "earnest_money",
        "locked",
        "Earnest step has not been prepared yet.",
      ),
      due_diligence_inspection: createStep(
        "due_diligence_inspection",
        "locked",
        "This step is not available yet.",
      ),
      financing: createStep("financing", "locked", "This step is not available yet."),
      title_escrow: createStep(
        "title_escrow",
        "locked",
        "This step is not available yet.",
      ),
      closing: createStep("closing", "locked", "This step is not available yet."),
    },
    earnest: {
      draft: {
        status: "missing",
        generated_at_iso: null,
        subject: null,
        body: null,
        recipient_email: null,
        recipient_name: null,
        contact_type: "escrow_officer",
        attachment_document_id: null,
        attachment_filename: null,
        openai_model: null,
        generation_reason: null,
        thread_id: null,
        sent_message_id: null,
        sent_at_iso: null,
        last_error: null,
      },
      suggestion: createEmptySuggestion(),
    },
  };
}

function cloneWorkflowState(workflowState: PropertyWorkflowState): PropertyWorkflowState {
  return JSON.parse(JSON.stringify(workflowState)) as PropertyWorkflowState;
}

function setSuggestion(
  workflowState: PropertyWorkflowState,
  values: Partial<PropertyWorkflowState["earnest"]["suggestion"]>,
) {
  workflowState.earnest.suggestion = {
    ...workflowState.earnest.suggestion,
    ...values,
  };
}

function resetSuggestion(workflowState: PropertyWorkflowState) {
  workflowState.earnest.suggestion = createEmptySuggestion();
}

function withEarnestLocked(
  workflowState: PropertyWorkflowState,
  lockedReason: string,
  promptToUser: string,
  lastError: string | null,
): PropertyWorkflowState {
  const next = cloneWorkflowState(workflowState);

  next.current_label = "earnest_money";
  next.steps.earnest_money = {
    label: "earnest_money",
    status: "locked",
    locked_reason: lockedReason,
    last_transition_at_iso: nowIso(),
    last_transition_reason: lockedReason,
  };
  setSuggestion(next, {
    pending_user_action: "none",
    prompt_to_user: promptToUser,
    updated_at_iso: nowIso(),
  });
  next.earnest.draft = {
    ...next.earnest.draft,
    status: "missing",
    subject: null,
    body: null,
    generated_at_iso: null,
    recipient_email: null,
    recipient_name: null,
    attachment_document_id: null,
    attachment_filename: null,
    openai_model: null,
    generation_reason: null,
    thread_id: null,
    sent_message_id: null,
    sent_at_iso: null,
    last_error: lastError,
  };

  return next;
}

function toEarnestView(
  propertyId: string,
  propertyEmail: string | null,
  workflowState: PropertyWorkflowState,
  contact?: Contact | null,
): EarnestStepView {
  const draft = workflowState.earnest.draft;
  const step = workflowState.steps.earnest_money;
  const suggestion = workflowState.earnest.suggestion;

  return {
    property_id: propertyId,
    property_email: propertyEmail,
    current_label: "earnest_money",
    step_status: step.status,
    locked_reason: step.locked_reason,
    pending_user_action: suggestion.pending_user_action,
    prompt_to_user: suggestion.prompt_to_user,
    contact:
      contact
        ? {
            type: "escrow_officer",
            name: contact.name,
            email: contact.email,
            company: contact.company,
          }
        : draft.recipient_email && draft.recipient_name
        ? {
            type: "escrow_officer",
            name: draft.recipient_name,
            email: draft.recipient_email,
          }
        : null,
    attachment:
      draft.attachment_document_id && draft.attachment_filename
        ? {
            document_id: draft.attachment_document_id,
            filename: draft.attachment_filename,
          }
        : null,
    draft: {
      subject: draft.subject,
      body: draft.body,
      generated_at_iso: draft.generated_at_iso,
      openai_model: draft.openai_model,
      generation_reason: draft.generation_reason,
    },
    send_state: {
      thread_id: draft.thread_id,
      message_id: draft.sent_message_id,
      sent_at_iso: draft.sent_at_iso,
    },
    latest_email_analysis: {
      message_id: suggestion.evidence_message_id,
      thread_id: suggestion.evidence_thread_id,
      pipeline_label: suggestion.latest_pipeline_label,
      summary: suggestion.latest_summary,
      confidence: suggestion.latest_confidence,
      reason: suggestion.latest_reason,
      earnest_signal: suggestion.latest_earnest_signal,
    },
  };
}

function buildDraftContext(
  property: Awaited<ReturnType<PropertyStore["findById"]>> extends infer T ? T : never,
  attachment: StoredDocument,
  contact: ReturnType<ContactStore["getByType"]>,
): EarnestDraftContext {
  if (!property || !property.property_email || !contact) {
    throw new EarnestWorkflowError("Cannot build earnest draft context.");
  }

  return {
    property_id: property.id,
    property_name: property.property_name,
    property_email: property.property_email,
    property_address: property.parsed_contract.property.address_full,
    buyer_names: property.parsed_contract.parties.buyers,
    earnest_money_amount: property.parsed_contract.money.earnest_money.amount,
    earnest_money_deadline: null,
    escrow_contact: {
      name: contact.name,
      email: contact.email,
      company: contact.company,
    },
    attachment_filename: attachment.filename,
  };
}

export class EarnestWorkflowService {
  constructor(
    private readonly propertyStore: PropertyStore,
    private readonly documentStore: DocumentStore,
    private readonly contactStore: ContactStore,
    private readonly outboundEmailService: OutboundEmailService,
  ) {}

  private async loadPropertyOrThrow(propertyId: string) {
    const property = await this.propertyStore.findById(propertyId);
    if (!property) {
      throw new EarnestWorkflowError("Property not found.");
    }

    return property;
  }

  private async resolveWorkflowState(propertyId: string): Promise<PropertyWorkflowState> {
    const existing = await this.propertyStore.getWorkflowState(propertyId);
    if (existing) {
      return existing;
    }

    const initial = createInitialWorkflowState();
    await this.propertyStore.updateWorkflowState(propertyId, initial);
    return initial;
  }

  private async resolveAttachment(propertyId: string, docHash: string): Promise<StoredDocument | null> {
    const documents = await this.documentStore.listByPropertyId(propertyId);
    const matching = documents.find((document) => document.doc_hash === docHash);
    if (matching) {
      return matching;
    }

    const oldestPdf = [...documents]
      .filter((document) => document.mime_type === "application/pdf")
      .reverse();

    return oldestPdf[0] || null;
  }

  async prepareEarnestStep(propertyId: string): Promise<EarnestStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    const workflowState = await this.resolveWorkflowState(propertyId);

    if (
      workflowState.steps.earnest_money.status === "waiting_for_parties" &&
      workflowState.earnest.draft.status === "sent"
    ) {
      return toEarnestView(
        property.id,
        property.property_email,
        workflowState,
        this.contactStore.getByType("escrow_officer"),
      );
    }

    if (
      workflowState.steps.earnest_money.status === "completed" ||
      (workflowState.steps.earnest_money.status === "action_needed" &&
        workflowState.earnest.draft.status === "ready")
    ) {
      return toEarnestView(
        property.id,
        property.property_email,
        workflowState,
        this.contactStore.getByType("escrow_officer"),
      );
    }

    const contact = this.contactStore.getByType("escrow_officer");
    if (!contact) {
      const locked = withEarnestLocked(
        workflowState,
        "Escrow officer contact is missing.",
        "Add your escrow officer contact to prepare the earnest email.",
        null,
      );
      const updated = await this.propertyStore.updateWorkflowState(property.id, locked);
      return toEarnestView(updated.id, updated.property_email, locked, null);
    }

    const attachment = await this.resolveAttachment(
      property.id,
      property.parsed_contract.metadata.doc_hash,
    );

    if (!attachment) {
      const locked = withEarnestLocked(
        workflowState,
        "Purchase contract attachment is missing.",
        "The purchase contract attachment could not be found for this property.",
        null,
      );
      const updated = await this.propertyStore.updateWorkflowState(property.id, locked);
      return toEarnestView(updated.id, updated.property_email, locked, contact);
    }

    try {
      const draft = await generateEarnestDraft(
        buildDraftContext(property, attachment, contact),
      );
      const next = cloneWorkflowState(workflowState);
      next.current_label = "earnest_money";
      next.steps.earnest_money = {
        label: "earnest_money",
        status: "action_needed",
        locked_reason: null,
        last_transition_at_iso: nowIso(),
        last_transition_reason: "Earnest draft is ready to send.",
      };
      setSuggestion(next, {
        pending_user_action: "send_earnest_email",
        prompt_to_user: null,
        updated_at_iso: nowIso(),
      });
      next.earnest.draft = {
        ...next.earnest.draft,
        status: "ready",
        generated_at_iso: nowIso(),
        subject: draft.subject.trim(),
        body: draft.body.trim(),
        recipient_email: contact.email,
        recipient_name: contact.name,
        attachment_document_id: attachment.id,
        attachment_filename: attachment.filename,
        openai_model: draft.openai_model,
        generation_reason: draft.generation_reason.trim(),
        last_error: null,
      };

      const updated = await this.propertyStore.updateWorkflowState(property.id, next);
      return toEarnestView(updated.id, updated.property_email, next, contact);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Earnest draft generation failed.";
      const locked = withEarnestLocked(
        workflowState,
        "Earnest draft generation failed.",
        "Earnest draft could not be prepared yet.",
        message,
      );
      const updated = await this.propertyStore.updateWorkflowState(property.id, locked);
      return toEarnestView(updated.id, updated.property_email, locked, contact);
    }
  }

  async getEarnestStep(propertyId: string): Promise<EarnestStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    const workflowState = await this.resolveWorkflowState(propertyId);

    return toEarnestView(
      property.id,
      property.property_email,
      workflowState,
      this.contactStore.getByType("escrow_officer"),
    );
  }

  async sendEarnestDraft(
    propertyId: string,
    input: {
      subject: string;
      body: string;
      body_html?: string | null;
    },
  ): Promise<EarnestStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    if (!property.property_email) {
      throw new EarnestWorkflowError("Property email is missing.");
    }

    const workflowState = await this.resolveWorkflowState(propertyId);
    if (
      workflowState.steps.earnest_money.status !== "action_needed" ||
      workflowState.earnest.suggestion.pending_user_action !== "send_earnest_email"
    ) {
      throw new EarnestWorkflowError(
        "Earnest draft can only be sent when the step is action_needed.",
      );
    }

    const contact = this.contactStore.getByType("escrow_officer");
    if (!contact) {
      throw new EarnestWorkflowError("Escrow officer contact is missing.");
    }

    const draft = workflowState.earnest.draft;
    if (!draft.attachment_document_id || !draft.attachment_filename) {
      throw new EarnestWorkflowError("Purchase contract attachment is missing.");
    }

    const attachment = await this.documentStore.findById(draft.attachment_document_id);
    if (!attachment) {
      throw new EarnestWorkflowError("Purchase contract attachment is missing.");
    }

    const sent = await this.outboundEmailService.send({
      property_id: property.id,
      from: property.property_email,
      to: [contact.email],
      subject: input.subject,
      body: input.body,
      body_html: input.body_html || null,
      attachments: [
        {
          document_id: attachment.id,
          filename: attachment.filename,
          mime_type: attachment.mime_type,
          file_path: attachment.file_path,
        },
      ],
    });

    const next = this.applySendResult(workflowState, contact, sent, input);
    const updated = await this.propertyStore.updateWorkflowState(property.id, next);

    return toEarnestView(updated.id, updated.property_email, next, contact);
  }

  async applyInboxAnalysis(
    propertyId: string,
    messageId: string,
    threadId: string,
    analysis: InboxMessageAnalysis,
  ): Promise<EarnestStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    const workflowState = await this.resolveWorkflowState(propertyId);
    const next = cloneWorkflowState(workflowState);

    setSuggestion(next, {
      evidence_message_id: messageId,
      evidence_thread_id: threadId,
      latest_summary: analysis.summary,
      latest_confidence: analysis.confidence,
      latest_reason: analysis.reason,
      latest_pipeline_label: analysis.pipeline_label,
      latest_earnest_signal: analysis.earnest_signal,
      updated_at_iso: analysis.analyzed_at_iso,
    });

    if (
      next.steps.earnest_money.status !== "completed" &&
      analysis.confidence >= 0.8
    ) {
      if (analysis.earnest_signal === "wire_instructions_provided") {
        next.current_label = "earnest_money";
        next.steps.earnest_money = {
          label: "earnest_money",
          status: "action_needed",
          locked_reason: null,
          last_transition_at_iso: analysis.analyzed_at_iso,
          last_transition_reason: "Escrow sent wiring instructions.",
        };
        setSuggestion(next, {
          pending_user_action: "confirm_earnest_complete",
          prompt_to_user:
            "Escrow sent wiring instructions. Follow the instructions, then mark Earnest complete.",
        });
      }

      if (analysis.earnest_signal === "earnest_received_confirmation") {
        next.current_label = "earnest_money";
        next.steps.earnest_money = {
          label: "earnest_money",
          status: "action_needed",
          locked_reason: null,
          last_transition_at_iso: analysis.analyzed_at_iso,
          last_transition_reason: "Escrow appears to have received the earnest money.",
        };
        setSuggestion(next, {
          pending_user_action: "confirm_earnest_complete",
          prompt_to_user:
            "Escrow confirmed the earnest money is handled. Mark Earnest complete when you're ready.",
        });
      }
    }

    const updated = await this.propertyStore.updateWorkflowState(property.id, next);
    return toEarnestView(
      updated.id,
      updated.property_email,
      next,
      this.contactStore.getByType("escrow_officer"),
    );
  }

  async confirmComplete(propertyId: string): Promise<EarnestStepView> {
    const property = await this.loadPropertyOrThrow(propertyId);
    const workflowState = await this.resolveWorkflowState(propertyId);

    if (
      workflowState.steps.earnest_money.status !== "action_needed" ||
      workflowState.earnest.suggestion.pending_user_action !==
        "confirm_earnest_complete"
    ) {
      throw new EarnestWorkflowError(
        "Earnest can only be completed when user confirmation is pending.",
      );
    }

    const next = cloneWorkflowState(workflowState);
    next.current_label = "earnest_money";
    next.steps.earnest_money = {
      label: "earnest_money",
      status: "completed",
      locked_reason: null,
      last_transition_at_iso: nowIso(),
      last_transition_reason: "Buyer confirmed earnest is complete.",
    };
    setSuggestion(next, {
      pending_user_action: "none",
      prompt_to_user: null,
      updated_at_iso: nowIso(),
    });

    const updated = await this.propertyStore.updateWorkflowState(property.id, next);
    return toEarnestView(
      updated.id,
      updated.property_email,
      next,
      this.contactStore.getByType("escrow_officer"),
    );
  }

  private applySendResult(
    workflowState: PropertyWorkflowState,
    contact: NonNullable<ReturnType<ContactStore["getByType"]>>,
    sent: SendOutboundEmailResult,
    input: {
      subject: string;
      body: string;
      body_html?: string | null;
    },
  ): PropertyWorkflowState {
    const next = cloneWorkflowState(workflowState);

    next.current_label = "earnest_money";
    next.steps.earnest_money = {
      label: "earnest_money",
      status: "waiting_for_parties",
      locked_reason: null,
      last_transition_at_iso: sent.sent_at,
      last_transition_reason: "Earnest kickoff email sent.",
    };
    setSuggestion(next, {
      pending_user_action: "none",
      prompt_to_user: null,
      updated_at_iso: sent.sent_at,
    });
    next.earnest.draft = {
      ...next.earnest.draft,
      status: "sent",
      subject: input.subject.trim(),
      body: input.body.trim(),
      recipient_email: contact.email,
      recipient_name: contact.name,
      thread_id: sent.thread_id,
      sent_message_id: sent.inbox_message_id,
      sent_at_iso: sent.sent_at,
      last_error: null,
    };

    return next;
  }
}
