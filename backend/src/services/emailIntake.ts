import { Resend } from "resend";
import { promises as fs } from "fs";
import path from "path";
import https from "https";
import http from "http";
import { eq } from "drizzle-orm";

import { sha256 } from "../utils/hash";
import { extractContractFieldsFromDocAi } from "./docai";
import { parsePurchaseContractWithOpenAi } from "./openai";
import { PropertyStore, DuplicatePropertyError } from "./propertyStore";
import { DocumentStore } from "./documentStore";
import { db } from "../db";
import { processedEmails } from "../db/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INTAKE_ADDRESS =
  process.env.INTAKE_EMAIL || "intake@bronaaelda.resend.app";
const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS || "30000");
const ATTACHMENTS_DIR = path.resolve(process.cwd(), "data", "intake-pdfs");
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || "60000");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[intake] ${msg}`);
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod
      .get(url, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Processed-email tracking (persisted in SQLite)
// ---------------------------------------------------------------------------

async function isEmailProcessed(emailId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(processedEmails)
    .where(eq(processedEmails.emailId, emailId))
    .limit(1);
  return rows.length > 0;
}

async function markEmailProcessed(emailId: string): Promise<void> {
  await db
    .insert(processedEmails)
    .values({ emailId, processedAt: new Date().toISOString() })
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Parse env-var check
// ---------------------------------------------------------------------------

const REQUIRED_PARSE_ENV_VARS = [
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_LOCATION",
  "DOCUMENT_AI_PROCESSOR_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
] as const;

function canParse(): boolean {
  return REQUIRED_PARSE_ENV_VARS.every(
    (v) => process.env[v] && process.env[v]!.trim().length > 0,
  );
}

// ---------------------------------------------------------------------------
// Core polling logic
// ---------------------------------------------------------------------------

async function pollOnce(
  resend: Resend,
  store: PropertyStore,
  docStore: DocumentStore,
): Promise<void> {
  const { data: listData, error: listError } =
    await resend.emails.receiving.list();

  if (listError) {
    log(`poll error: ${listError.message}`);
    return;
  }

  if (!listData || !listData.data || listData.data.length === 0) {
    return;
  }

  for (const email of listData.data) {
    // Skip already-processed (DB lookup — survives restarts)
    if (await isEmailProcessed(email.id)) {
      continue;
    }

    // Check if sent to the intake address
    const toAddresses = (email.to ?? []).map((a: string) => a.toLowerCase());
    if (!toAddresses.includes(INTAKE_ADDRESS.toLowerCase())) {
      await markEmailProcessed(email.id);
      continue;
    }

    // Filter PDF attachments
    const pdfAttachments = (email.attachments ?? []).filter(
      (att: { content_type: string }) => att.content_type === "application/pdf",
    );

    if (pdfAttachments.length === 0) {
      await markEmailProcessed(email.id);
      continue;
    }

    log(
      `📬 email from ${email.from} — "${email.subject}" (${pdfAttachments.length} PDF${pdfAttachments.length > 1 ? "s" : ""})`,
    );

    for (const att of pdfAttachments) {
      try {
        // Download attachment
        const { data: attData, error: attError } =
          await resend.emails.receiving.attachments.get({
            id: att.id,
            emailId: email.id,
          });

        if (attError || !attData) {
          log(
            `error downloading attachment: ${attError?.message ?? "No data returned"}`,
          );
          continue;
        }

        const downloadUrl = (attData as { download_url?: string }).download_url;
        if (!downloadUrl) continue;

        const pdfBuffer = await downloadBuffer(downloadUrl);

        // Save to disk (fallback for manual retries)
        await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
        const safeFilename = (att.filename || "attachment.pdf").replace(
          /[^a-zA-Z0-9._-]/g,
          "_",
        );
        const savedFilename = `${email.id}_${safeFilename}`;
        const savedPath = path.join(ATTACHMENTS_DIR, savedFilename);
        await fs.writeFile(savedPath, pdfBuffer);

        // Check for duplicate PDF by hash before calling APIs
        const docHash = sha256(pdfBuffer);
        const existing = await store.findByDocHash(docHash);
        if (existing) {
          log(`skip duplicate PDF (${existing.id})`);
          continue;
        }

        // Parse pipeline
        if (!canParse()) {
          log("skip — parse env vars not configured");
          continue;
        }

        const docAiPayload = await extractContractFieldsFromDocAi({
          buffer: pdfBuffer,
          bytes: pdfBuffer.length,
          docHash,
          filename: savedFilename,
          mimeType: "application/pdf",
          timeoutMs: REQUEST_TIMEOUT_MS,
        });

        const parsedContract = await parsePurchaseContractWithOpenAi({
          docAiPayload,
          fileBuffer: pdfBuffer,
          filename: savedFilename,
          mimeType: "application/pdf",
          timeoutMs: REQUEST_TIMEOUT_MS,
        });

        const record = await store.create(parsedContract);

        // Store a document record linking the PDF to this property
        await docStore.create({
          propertyId: record.id,
          filename: att.filename || "attachment.pdf",
          filePath: `data/intake-pdfs/${savedFilename}`,
          mimeType: "application/pdf",
          sizeBytes: pdfBuffer.length,
          docHash,
          source: "email_intake",
        });

        const c = parsedContract;

        log(
          `✅ ${record.property_name} | $${(c.money.purchase_price ?? 0).toLocaleString()} | ` +
            `${c.parties.buyers.join(", ")} ← ${c.parties.sellers.join(", ")} | ` +
            `closing ${c.key_dates.settlement_deadline ?? "TBD"}`,
        );
      } catch (err) {
        if (err instanceof DuplicatePropertyError) {
          log("skip duplicate");
        } else {
          log(`error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    await markEmailProcessed(email.id);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startEmailPolling(
  store: PropertyStore,
  docStore: DocumentStore,
): void {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    log("disabled — RESEND_API_KEY not set");
    return;
  }

  const resend = new Resend(apiKey);

  log(
    `polling ${INTAKE_ADDRESS} every ${POLL_INTERVAL_MS / 1000}s (parse: ${canParse() ? "on" : "off"})`,
  );

  // Run immediately, then on interval
  pollOnce(resend, store, docStore).catch((err) =>
    log(`poll error: ${err instanceof Error ? err.message : String(err)}`),
  );

  pollTimer = setInterval(() => {
    pollOnce(resend, store, docStore).catch((err) =>
      log(`poll error: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, POLL_INTERVAL_MS);
}

export function stopEmailPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log("stopped");
  }
}
