import express, { Request, Response } from "express";
import path from "path";
import { promises as fs } from "fs";
import { Resend } from "resend";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import {
  DuplicatePropertyError,
  PropertyStore,
  PropertyStoreError,
} from "../services/propertyStore";
import {
  GoogleStreetViewServiceError,
  StreetViewService,
} from "../services/googleStreetView";
import {
  EarnestWorkflowError,
  EarnestWorkflowService,
} from "../services/earnestWorkflow";
import { DocumentStore } from "../services/documentStore";
import {
  PropertyEmailSender,
  SendPropertyEmailInput,
} from "../services/propertyEmailSender";
import { InboxStore } from "../services/inboxStore";
import { StreetViewCacheEntry } from "../types/property";
import { toPropertyCardDto } from "../utils/propertyCard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isParsedPurchaseContract(
  value: unknown,
): value is ParsedPurchaseContract {
  if (!isRecord(value)) {
    return false;
  }

  const metadata = value.metadata;
  return (
    isRecord(metadata) &&
    typeof metadata.doc_hash === "string" &&
    metadata.doc_hash.trim().length > 0 &&
    typeof metadata.filename === "string" &&
    metadata.filename.trim().length > 0 &&
    typeof metadata.extracted_at_iso === "string" &&
    metadata.extracted_at_iso.trim().length > 0 &&
    isRecord(value.parties) &&
    isRecord(value.property) &&
    isRecord(value.key_dates) &&
    isRecord(value.money) &&
    isRecord(value.obligations_and_risks) &&
    isRecord(value.summary)
  );
}

function buildStreetViewErrorEntry(message: string): StreetViewCacheEntry {
  return {
    status: "error",
    last_checked_at_iso: new Date().toISOString(),
    source_address: null,
    resolved_address: null,
    latitude: null,
    longitude: null,
    target_latitude: null,
    target_longitude: null,
    heading: null,
    pano_id: null,
    error_message: message,
  };
}

async function ensureStreetView(
  propertyStore: PropertyStore,
  streetViewService: StreetViewService,
  propertyId: string,
) {
  const record = await propertyStore.findById(propertyId);
  if (!record) {
    return null;
  }

  const streetView = record.street_view;
  const needsRefresh =
    !streetView ||
    (streetView.status === "available" &&
      (streetView.heading === undefined ||
        streetView.target_latitude === undefined ||
        streetView.target_longitude === undefined));

  if (!needsRefresh) {
    return record;
  }

  try {
    const refreshedStreetView = await streetViewService.lookup(
      record.parsed_contract.property,
    );
    return await propertyStore.updateStreetView(
      propertyId,
      refreshedStreetView,
    );
  } catch (error) {
    const fallback = buildStreetViewErrorEntry(
      error instanceof Error ? error.message : "Street View lookup failed.",
    );

    try {
      return await propertyStore.updateStreetView(propertyId, fallback);
    } catch {
      return {
        ...record,
        street_view: fallback,
      };
    }
  }
}

export function createPropertiesRouter(
  propertyStore: PropertyStore,
  streetViewService: StreetViewService,
  documentStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
  propertyEmailSender: PropertyEmailSender,
  inboxStore: InboxStore,
) {
  const router = express.Router();

  function sendEarnestWorkflowError(
    res: Response,
    error: EarnestWorkflowError,
  ) {
    if (error.message === "Property not found.") {
      res.status(404).json({
        error: {
          message: error.message,
        },
      });
      return;
    }

    res.status(400).json({
      error: {
        message: error.message,
      },
    });
  }

  router.post("/properties", async (req: Request, res: Response) => {
    if (!isParsedPurchaseContract(req.body)) {
      res.status(400).json({
        error: {
          message: "Invalid parsed contract payload.",
        },
      });
      return;
    }

    try {
      const record = await propertyStore.create(req.body);
      res.status(201).json({
        property: {
          id: record.id,
          property_name: record.property_name,
          doc_hash: record.parsed_contract.metadata.doc_hash,
          created_at_iso: record.created_at_iso,
          updated_at_iso: record.updated_at_iso,
        },
      });
    } catch (error) {
      if (error instanceof DuplicatePropertyError) {
        res.status(409).json({
          error: {
            message: error.message,
          },
        });
        return;
      }

      if (error instanceof PropertyStoreError) {
        res.status(500).json({
          error: {
            message: error.message,
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected server error",
        },
      });
    }
  });

  router.get("/properties", async (_req: Request, res: Response) => {
    try {
      const records = await propertyStore.list();
      const hydratedRecords = [];

      for (const record of records) {
        const hydratedRecord = await ensureStreetView(
          propertyStore,
          streetViewService,
          record.id,
        );

        hydratedRecords.push(hydratedRecord || record);
      }

      res.json({
        properties: hydratedRecords.map((record) => toPropertyCardDto(record)),
      });
    } catch (error) {
      if (error instanceof PropertyStoreError) {
        res.status(500).json({
          error: {
            message: error.message,
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected server error",
        },
      });
    }
  });

  router.get(
    "/properties/:propertyId/street-view",
    async (req: Request, res: Response) => {
      try {
        const record = await ensureStreetView(
          propertyStore,
          streetViewService,
          req.params.propertyId,
        );

        if (!record) {
          res.status(404).json({
            error: {
              message: "Property not found.",
            },
          });
          return;
        }

        if (record.street_view?.status !== "available") {
          res.status(404).json({
            error: {
              message: "Street View image is not available for this property.",
            },
          });
          return;
        }

        const image = await streetViewService.fetchImage(record.street_view);
        res.setHeader("Content-Type", image.contentType);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(image.body);
      } catch (error) {
        if (
          error instanceof PropertyStoreError ||
          error instanceof GoogleStreetViewServiceError
        ) {
          res.status(502).json({
            error: {
              message: error.message,
            },
          });
          return;
        }

        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /properties/:propertyId
  //
  // Returns full property detail including street view and all attached
  // documents. Used by the frontend property detail page / documents tab.
  //
  // Response shape:
  //   {
  //     property: PropertyCardDto & {
  //       documents: Array<{
  //         id: string;
  //         filename: string;
  //         mime_type: string;
  //         size_bytes: number | null;
  //         source: string | null;        // "email_intake" | "manual_upload"
  //         created_at: string;           // ISO 8601
  //         download_url: string;         // e.g. "/api/properties/:id/documents/:docId/download"
  //       }>
  //     }
  //   }
  // -------------------------------------------------------------------------
  router.get("/properties/:propertyId", async (req: Request, res: Response) => {
    try {
      const record = await ensureStreetView(
        propertyStore,
        streetViewService,
        req.params.propertyId,
      );

      if (!record) {
        res.status(404).json({
          error: { message: "Property not found." },
        });
        return;
      }

      const docs = await documentStore.listByPropertyId(record.id);
      const dto = toPropertyCardDto(record);

      res.json({
        property: {
          ...dto,
          documents: docs.map((doc) => ({
            id: doc.id,
            filename: doc.filename,
            mime_type: doc.mime_type,
            size_bytes: doc.size_bytes,
            source: doc.source,
            ai_summary: doc.ai_summary,
            created_at: doc.created_at,
            download_url: `/api/properties/${record.id}/documents/${doc.id}/download`,
          })),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected server error",
        },
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /properties/:propertyId/documents/:docId/download
  //
  // Streams the raw file (PDF, etc.) for a given document.
  // Sets Content-Type and Content-Disposition headers so the browser
  // can display or download the file.
  //
  // Returns 404 if the property or document doesn't exist, or if the
  // file is missing from disk.
  // -------------------------------------------------------------------------
  router.get(
    "/properties/:propertyId/documents/:docId/download",
    async (req: Request, res: Response) => {
      try {
        const doc = await documentStore.findById(req.params.docId);

        if (!doc || doc.property_id !== req.params.propertyId) {
          res.status(404).json({
            error: { message: "Document not found." },
          });
          return;
        }

        // Resolve the file path (stored relative to backend/)
        const absolutePath = path.resolve(__dirname, "../..", doc.file_path);

        try {
          await fs.access(absolutePath);
        } catch {
          res.status(404).json({
            error: { message: "File not found on disk." },
          });
          return;
        }

        res.setHeader("Content-Type", doc.mime_type);
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${doc.filename}"`,
        );
        if (doc.size_bytes) {
          res.setHeader("Content-Length", doc.size_bytes);
        }

        const fileBuffer = await fs.readFile(absolutePath);
        res.send(fileBuffer);
      } catch (error) {
        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /properties/:propertyId/inbox
  //
  // Returns email threads for a property's inbox.
  // -------------------------------------------------------------------------
  router.get(
    "/properties/:propertyId/inbox",
    async (req: Request, res: Response) => {
      try {
        const property = await propertyStore.findById(req.params.propertyId);

        if (!property) {
          res.status(404).json({
            error: { message: "Property not found." },
          });
          return;
        }

        const threads = await inboxStore.listThreadsByPropertyId(property.id);

        res.json({
          property_email: property.property_email,
          threads,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /properties/:propertyId/inbox/:threadId
  //
  // Returns all messages in an email thread (conversation view).
  // -------------------------------------------------------------------------
  router.get(
    "/properties/:propertyId/inbox/:threadId",
    async (req: Request, res: Response) => {
      try {
        const property = await propertyStore.findById(req.params.propertyId);

        if (!property) {
          res.status(404).json({
            error: { message: "Property not found." },
          });
          return;
        }

        const messages = await inboxStore.getThread(
          property.id,
          req.params.threadId,
        );

        if (messages.length === 0) {
          res.status(404).json({
            error: { message: "Thread not found." },
          });
          return;
        }

        // Collect unique participants
        const participantMap = new Map<
          string,
          { email: string; name: string | null }
        >();
        for (const msg of messages) {
          participantMap.set(msg.from_email, {
            email: msg.from_email,
            name: msg.from_name,
          });
          for (const p of msg.to) {
            if (!participantMap.has(p.email)) {
              participantMap.set(p.email, p);
            }
          }
        }

        // Transform StoredInboxMessage → ApiMessage shape the frontend expects
        const apiMessages = messages.map((msg) => ({
          id: msg.id,
          from: { email: msg.from_email, name: msg.from_name },
          to: msg.to,
          cc: msg.cc ?? [],
          subject: msg.subject,
          body_text: msg.body_text ?? "",
          body_html: msg.body_html ?? null,
          attachments: [] as Array<{
            id: string;
            filename: string;
            mime_type: string;
            size_bytes: number;
            download_url: string;
          }>,
          sent_at: msg.sent_at,
          read: msg.read,
          direction: msg.direction,
        }));

        res.json({
          thread: {
            id: req.params.threadId,
            subject: messages[0].subject,
            participants: Array.from(participantMap.values()),
            created_at: messages[0].sent_at,
          },
          messages: apiMessages,
        });
      } catch (error) {
        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /properties/:propertyId/inbox/emails/:messageId
  //
  // Mark an email as read or unread.
  // Request body: { read: boolean }
  // -------------------------------------------------------------------------
  router.patch(
    "/properties/:propertyId/inbox/emails/:messageId",
    async (req: Request, res: Response) => {
      try {
        const property = await propertyStore.findById(req.params.propertyId);

        if (!property) {
          res.status(404).json({
            error: { message: "Property not found." },
          });
          return;
        }

        const { read } = req.body;
        if (typeof read !== "boolean") {
          res.status(400).json({
            error: {
              message: "Missing or invalid 'read' field (must be boolean).",
            },
          });
          return;
        }

        const message = await inboxStore.markRead(req.params.messageId, read);

        if (!message) {
          res.status(404).json({
            error: { message: "Message not found." },
          });
          return;
        }

        res.json({ message });
      } catch (error) {
        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /properties/:propertyId/inbox/send
  //
  // Sends an email FROM the property's email address via Resend API.
  // -------------------------------------------------------------------------
  router.post(
    "/properties/:propertyId/inbox/send",
    async (req: Request, res: Response) => {
      try {
        const property = await propertyStore.findById(req.params.propertyId);

        if (!property) {
          res.status(404).json({
            error: { message: "Property not found." },
          });
          return;
        }

        if (!property.property_email) {
          res.status(400).json({
            error: { message: "Property does not have an email address." },
          });
          return;
        }

        // Validate required fields
        const { to, subject, body, body_html, cc, bcc, reply_to_message_id } =
          req.body;
        if (!to || !Array.isArray(to) || to.length === 0) {
          res.status(400).json({
            error: {
              message:
                "Missing or invalid 'to' field (must be non-empty array).",
            },
          });
          return;
        }

        if (!subject || typeof subject !== "string") {
          res.status(400).json({
            error: { message: "Missing or invalid 'subject' field." },
          });
          return;
        }

        if (!body || typeof body !== "string") {
          res.status(400).json({
            error: { message: "Missing or invalid 'body' field." },
          });
          return;
        }

        if (!property.property_email) {
          res.status(400).json({
            error: { message: "Property email is not configured." },
          });
          return;
        }

        // Build threading headers if replying
        let inReplyToHeader: string | undefined;
        const referencesArr: string[] = [];

        if (reply_to_message_id) {
          const parentMsg = await inboxStore.findById(reply_to_message_id);
          if (parentMsg && parentMsg.message_id) {
            inReplyToHeader = parentMsg.message_id;
            const parentRefs = parentMsg.references || [];
            referencesArr.push(...parentRefs, parentMsg.message_id);
          }
        }

        // Send via Resend API
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
          res.status(500).json({
            error: { message: "RESEND_API_KEY is not configured." },
          });
          return;
        }

        const resend = new Resend(resendApiKey);
        const { data: emailResult, error: sendError } =
          await resend.emails.send({
            from: property.property_email,
            to,
            cc: cc ?? undefined,
            subject,
            text: body,
            html: body_html ?? undefined,
            headers: {
              ...(inReplyToHeader ? { "In-Reply-To": inReplyToHeader } : {}),
              ...(referencesArr.length > 0
                ? { References: referencesArr.join(" ") }
                : {}),
            },
          });

        if (sendError || !emailResult) {
          console.error("[inbox send] Resend API error:", sendError);
          res.status(502).json({
            error: {
              message: sendError?.message ?? "Failed to send email via Resend.",
            },
          });
          return;
        }

        // Store in inbox
        const toArr = to.map((addr: string) => ({
          email: addr,
          name: null,
        }));
        const ccArr = (cc ?? []).map((addr: string) => ({
          email: addr,
          name: null,
        }));

        const storedMessage = await inboxStore.createMessage({
          resendEmailId: emailResult.id,
          propertyId: property.id,
          direction: "outbound",
          fromEmail: property.property_email,
          fromName: null,
          to: toArr,
          cc: ccArr,
          subject,
          bodyText: body,
          bodyHtml: body_html ?? null,
          messageId: null,
          inReplyTo: inReplyToHeader ?? null,
          references: referencesArr,
          hasAttachments: false,
          sentAt: new Date().toISOString(),
        });

        res.status(201).json({
          message: {
            id: storedMessage.id,
            thread_id: storedMessage.thread_id,
            sent_at: storedMessage.sent_at,
            from: property.property_email,
            to,
            subject,
          },
        });
      } catch (error) {
        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  router.get(
    "/properties/:propertyId/pipeline/earnest",
    async (req: Request, res: Response) => {
      try {
        const earnest = await earnestWorkflowService.getEarnestStep(
          req.params.propertyId,
        );
        res.json({ earnest });
      } catch (error) {
        if (error instanceof EarnestWorkflowError) {
          sendEarnestWorkflowError(res, error);
          return;
        }

        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  router.post(
    "/properties/:propertyId/pipeline/earnest/prepare",
    async (req: Request, res: Response) => {
      try {
        const earnest = await earnestWorkflowService.prepareEarnestStep(
          req.params.propertyId,
        );
        res.json({ earnest });
      } catch (error) {
        if (error instanceof EarnestWorkflowError) {
          sendEarnestWorkflowError(res, error);
          return;
        }

        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  router.post(
    "/properties/:propertyId/pipeline/earnest/send",
    async (req: Request, res: Response) => {
      const { subject, body, body_html } = req.body;

      if (!subject || typeof subject !== "string") {
        res.status(400).json({
          error: {
            message: "Missing or invalid 'subject' field.",
          },
        });
        return;
      }

      if (!body || typeof body !== "string") {
        res.status(400).json({
          error: {
            message: "Missing or invalid 'body' field.",
          },
        });
        return;
      }

      try {
        const earnest = await earnestWorkflowService.sendEarnestDraft(
          req.params.propertyId,
          {
            subject,
            body,
            body_html:
              typeof body_html === "string" || body_html === null
                ? body_html
                : null,
          },
        );

        res.status(201).json({ earnest });
      } catch (error) {
        if (error instanceof EarnestWorkflowError) {
          sendEarnestWorkflowError(res, error);
          return;
        }

        res.status(500).json({
          error: {
            message:
              error instanceof Error
                ? error.message
                : "Unexpected server error",
          },
        });
      }
    },
  );

  return router;
}
