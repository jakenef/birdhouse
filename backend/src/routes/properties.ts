import express, { Request, Response } from "express";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import {
  DuplicatePropertyError,
  PropertyStore,
  PropertyStoreError,
} from "../services/propertyStore";
import { toPropertyCardDto } from "../utils/propertyCard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isParsedPurchaseContract(value: unknown): value is ParsedPurchaseContract {
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

export function createPropertiesRouter(propertyStore: PropertyStore) {
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
      res.json({
        properties: records.map((record) => toPropertyCardDto(record)),
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

  return router;
}
