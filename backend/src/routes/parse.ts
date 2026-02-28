import express, { Request, Response } from "express";
import multer from "multer";

import {
  DocAiServiceError,
  extractContractFieldsFromDocAi,
} from "../services/docai";
import {
  OpenAiServiceError,
  parsePurchaseContractWithOpenAi,
} from "../services/openai";
import { sha256 } from "../utils/hash";

const maxFileMb = Number(process.env.MAX_FILE_MB || "15");
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || "60000");
const requiredParseEnvVars = [
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_LOCATION",
  "DOCUMENT_AI_PROCESSOR_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileMb * 1024 * 1024,
  },
});

export const parseRouter = express.Router();

function getMissingParseEnvVars(): string[] {
  return requiredParseEnvVars.filter((envVar) => {
    const value = process.env[envVar];
    return !value || value.trim().length === 0;
  });
}

parseRouter.post(
  "/parse",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const requestStartedAt = Date.now();
    const uploadedFile = req.file;

    if (!uploadedFile) {
      res.status(400).json({
        error: {
          message: 'Missing PDF upload in multipart field "file".',
        },
      });
      return;
    }

    if (uploadedFile.mimetype !== "application/pdf") {
      res.status(400).json({
        error: {
          message: "Only application/pdf uploads are supported.",
        },
      });
      return;
    }

    const missingParseEnvVars = getMissingParseEnvVars();
    if (missingParseEnvVars.length > 0) {
      res.status(503).json({
        error: {
          message: `Parse service is not configured. Missing environment variables: ${missingParseEnvVars.join(", ")}`,
        },
      });
      return;
    }

    const docHash = sha256(uploadedFile.buffer);
    console.log(
      JSON.stringify({
        event: "upload_validated",
        doc_hash: docHash,
        filename: uploadedFile.originalname,
        bytes: uploadedFile.size,
      }),
    );

    try {
      const docAiStartedAt = Date.now();
      const docAiPayload = await extractContractFieldsFromDocAi({
        buffer: uploadedFile.buffer,
        bytes: uploadedFile.size,
        docHash,
        filename: uploadedFile.originalname,
        mimeType: uploadedFile.mimetype,
        timeoutMs: requestTimeoutMs,
      });

      console.log(
        JSON.stringify({
          event: "docai_complete",
          doc_hash: docHash,
          duration_ms: Date.now() - docAiStartedAt,
          warnings: docAiPayload.warnings.length,
        }),
      );

      const openAiStartedAt = Date.now();
      const parsedContract = await parsePurchaseContractWithOpenAi({
        docAiPayload,
        fileBuffer: uploadedFile.buffer,
        filename: uploadedFile.originalname,
        mimeType: uploadedFile.mimetype,
        timeoutMs: requestTimeoutMs,
      });

      console.log(
        JSON.stringify({
          event: "openai_complete",
          doc_hash: docHash,
          duration_ms: Date.now() - openAiStartedAt,
        }),
      );

      console.log(
        JSON.stringify({
          event: "parse_complete",
          doc_hash: docHash,
          duration_ms: Date.now() - requestStartedAt,
        }),
      );

      res.json(parsedContract);
    } catch (error) {
      const durationMs = Date.now() - requestStartedAt;
      console.error(
        JSON.stringify({
          event: "parse_failed",
          doc_hash: docHash,
          duration_ms: durationMs,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );

      if (error instanceof DocAiServiceError || error instanceof OpenAiServiceError) {
        res.status(502).json({
          error: {
            message: error.message,
            doc_hash: docHash,
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected server error",
          doc_hash: docHash,
        },
      });
    }
  },
);
