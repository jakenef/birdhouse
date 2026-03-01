import path from "path";
import { promises as fs } from "fs";

import { DocumentStore } from "./documentStore";
import {
  ClosingWorkflowService,
  type ClosingStepView,
} from "./closingWorkflow";
import { detectClosingAltaDocument } from "./closingAltaDetector";

type ClosingInboxAutomationInput = {
  propertyId: string;
  messageId: string;
  threadId: string;
  receivedAtIso: string | null;
  documentIds: string[];
};

export class ClosingInboxAutomation {
  constructor(
    private readonly documentStore: DocumentStore,
    private readonly closingWorkflowService: ClosingWorkflowService,
  ) {}

  async processStoredMessage(
    input: ClosingInboxAutomationInput,
  ): Promise<ClosingStepView | null> {
    for (const documentId of input.documentIds) {
      const document = await this.documentStore.findById(documentId);
      if (!document || document.property_id !== input.propertyId) {
        continue;
      }

      if (document.mime_type !== "application/pdf") {
        continue;
      }

      const absolutePath = path.resolve(__dirname, "../..", document.file_path);
      let fileBuffer: Buffer;
      try {
        fileBuffer = await fs.readFile(absolutePath);
      } catch {
        continue;
      }

      const detection = await detectClosingAltaDocument({
        fileBuffer,
        filename: document.filename,
        mimeType: document.mime_type,
        received_at_iso: input.receivedAtIso,
      });

      if (
        !detection.classification.is_alta_document ||
        detection.classification.document_type !== "alta_statement" ||
        detection.classification.confidence < 0.8
      ) {
        continue;
      }

      return this.closingWorkflowService.applyAltaDetection(input.propertyId, {
        messageId: input.messageId,
        threadId: input.threadId,
        documentId: document.id,
        filename: document.filename,
        summary: detection.summary,
        confidence: detection.classification.confidence,
        reason: `Attachment "${document.filename}" was classified as an ALTA closing statement.`,
        analyzedAtIso: detection.metadata.extracted_at_iso,
      });
    }

    return null;
  }
}
