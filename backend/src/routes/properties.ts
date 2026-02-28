import express, { Request, Response } from "express";
import path from "path";
import { promises as fs } from "fs";

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
import { DocumentStore } from "../services/documentStore";
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
) {
  const router = express.Router();

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

  return router;
}
