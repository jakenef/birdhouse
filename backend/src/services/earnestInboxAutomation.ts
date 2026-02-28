import { EarnestWorkflowService } from "./earnestWorkflow";
import {
  analyzeEarnestInboundEmail,
  EarnestInboundAnalyzerInput,
} from "./earnestInboundAnalyzer";
import { InboxStore, StoredInboxMessage } from "./inboxStore";

export class EarnestInboxAutomation {
  constructor(
    private readonly inboxStore: InboxStore,
    private readonly earnestWorkflowService: EarnestWorkflowService,
  ) {}

  async processStoredMessage(message: StoredInboxMessage): Promise<void> {
    if (message.direction !== "inbound") {
      return;
    }

    if (message.analysis) {
      return;
    }

    const analysis = await analyzeEarnestInboundEmail(
      this.toAnalyzerInput(message),
    );
    await this.inboxStore.updateAnalysis(message.id, analysis);
    await this.earnestWorkflowService.applyInboxAnalysis(
      message.property_id,
      message.id,
      message.thread_id,
      analysis,
    );
  }

  private toAnalyzerInput(message: StoredInboxMessage): EarnestInboundAnalyzerInput {
    return {
      subject: message.subject,
      from: message.from_email,
      to: message.to.map((recipient) => recipient.email),
      received_at_iso: message.sent_at,
      text_body: message.body_text,
      html_body: message.body_html,
    };
  }
}
