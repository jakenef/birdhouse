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
import { EarnestWorkflowService } from "./earnestWorkflow";
import { InboxStore } from "./inboxStore";
import { db } from "../db";
import { processedEmails } from "../db/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || "bronaaelda.resend.app";
const INTAKE_ADDRESS = `intake@${EMAIL_DOMAIN}`;
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

/**
 * Process an email sent to the intake address (creates NEW property).
 * Runs full DocAI + OpenAI parsing pipeline.
 */
async function processIntakeEmail(
  email: any,
  att: any,
  pdfBuffer: Buffer,
  savedFilename: string,
  docHash: string,
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
): Promise<void> {
  // Check for duplicate PDF by hash before calling APIs
  const existing = await store.findByDocHash(docHash);
  if (existing) {
    log(`skip duplicate PDF (${existing.id})`);
    return;
  }

  // Parse pipeline
  if (!canParse()) {
    log("skip — parse env vars not configured");
    return;
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

  try {
    await earnestWorkflowService.prepareEarnestStep(record.id);
  } catch (error) {
    log(
      `earnest workflow setup failed for ${record.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const c = parsedContract;

  log(
    `✅ ${record.property_name} | $${(c.money.purchase_price ?? 0).toLocaleString()} | ` +
      `${c.parties.buyers.join(", ")} ← ${c.parties.sellers.join(", ")} | ` +
      `closing ${c.key_dates.settlement_deadline ?? "TBD"}`,
  );
}

/**
 * Process an email sent to a property-specific address (adds document to EXISTING property).
 * Skips parsing pipeline — just saves PDF and creates document record.
 */
async function processPropertyEmail(
  propertyEmail: string,
  att: any,
  pdfBuffer: Buffer,
  savedFilename: string,
  docHash: string,
  store: PropertyStore,
  docStore: DocumentStore,
): Promise<void> {
  // Find the property by its email address
  const property = await store.findByPropertyEmail(propertyEmail);

  if (!property) {
    log(`skip — no property found for ${propertyEmail}`);
    return;
  }

  // Create document record (allow multiple docs with same hash for same property)
  await docStore.create({
    propertyId: property.id,
    filename: att.filename || "attachment.pdf",
    filePath: `data/intake-pdfs/${savedFilename}`,
    mimeType: "application/pdf",
    sizeBytes: pdfBuffer.length,
    docHash,
    source: "email_intake",
  });

  log(
    `📎 added doc to ${property.property_name} (${att.filename || "attachment.pdf"})`,
  );
}

/**
 * Process a single email with all its PDF attachments.
 * Also stores the email in inbox_messages for the inbox view.
 */
async function processEmail(
  resend: Resend,
  email: any,
  targetEmail: string,
  isIntakeEmail: boolean,
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
  inboxStore: InboxStore,
): Promise<void> {
  const pdfAttachments = (email.attachments ?? []).filter(
    (att: { content_type: string }) => att.content_type === "application/pdf",
  );

  const hasPdfs = pdfAttachments.length > 0;

  log(
    `📬 email from ${email.from} → ${targetEmail} — "${email.subject}" (${pdfAttachments.length} PDF${pdfAttachments.length !== 1 ? "s" : ""})`,
  );

  // --- Save PDFs (existing flow, unchanged) ---
  if (hasPdfs) {
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

        // Save to disk (for both intake and property-specific emails)
        await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
        const safeFilename = (att.filename || "attachment.pdf").replace(
          /[^a-zA-Z0-9._-]/g,
          "_",
        );
        const savedFilename = `${email.id}_${safeFilename}`;
        const savedPath = path.join(ATTACHMENTS_DIR, savedFilename);
        await fs.writeFile(savedPath, pdfBuffer);

        const docHash = sha256(pdfBuffer);

      // Route to appropriate handler
      if (isIntakeEmail) {
        await processIntakeEmail(
          email,
          att,
          pdfBuffer,
          savedFilename,
          docHash,
          store,
          docStore,
          earnestWorkflowService,
        );
      } else {
        await processPropertyEmail(
          targetEmail,
          att,
          pdfBuffer,
          savedFilename,
          docHash,
          store,
          docStore,
        );
      }
    } catch (err) {
      if (err instanceof DuplicatePropertyError) {
        log("skip duplicate");
      } else {
        log(`error: ${err instanceof Error ? err.message : String(err)}`);
      }
        // Route to appropriate handler
        if (isIntakeEmail) {
          await processIntakeEmail(
            email,
            att,
            pdfBuffer,
            savedFilename,
            docHash,
            store,
            docStore,
          );
        } else {
          await processPropertyEmail(
            targetEmail,
            att,
            pdfBuffer,
            savedFilename,
            docHash,
            store,
            docStore,
          );
        }
      } catch (err) {
        if (err instanceof DuplicatePropertyError) {
          log("skip duplicate");
        } else {
          log(`error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // --- Store email in inbox_messages (for property-specific emails) ---
  if (!isIntakeEmail) {
    try {
      // Find property by email address
      const property = await store.findByPropertyEmail(targetEmail);
      if (!property) {
        log(`inbox skip — no property for ${targetEmail}`);
        return;
      }

      // Skip if already stored (dedup by Resend email ID)
      if (await inboxStore.existsByResendId(email.id)) {
        return;
      }

      // Fetch full email content (list endpoint only has metadata)
      const { data: fullEmail, error: fullError } =
        await resend.emails.receiving.get(email.id);

      if (fullError || !fullEmail) {
        log(
          `error fetching full email: ${fullError?.message ?? "No data returned"}`,
        );
        return;
      }

      const full = fullEmail as any;

      // Parse sender name from "Name <email>" format
      const fromStr = full.from || email.from || "";
      const nameMatch = fromStr.match(/^(.+?)\s*<(.+)>$/);
      const fromEmail = nameMatch ? nameMatch[2] : fromStr;
      const fromName = nameMatch ? nameMatch[1].trim() : null;

      // Parse headers for threading
      const headers = full.headers || {};
      const messageIdHeader = full.message_id || headers["message-id"] || null;
      const inReplyToHeader = headers["in-reply-to"] || null;
      const referencesHeader = headers["references"] || null;
      const referencesArr = referencesHeader
        ? referencesHeader.split(/\s+/).filter(Boolean)
        : [];

      // Build to/cc arrays
      const toArr = (full.to ?? email.to ?? []).map((addr: string) => ({
        email: addr,
        name: null,
      }));
      const ccArr = (full.cc ?? []).map((addr: string) => ({
        email: addr,
        name: null,
      }));

      await inboxStore.createMessage({
        resendEmailId: email.id,
        propertyId: property.id,
        direction: "inbound",
        fromEmail,
        fromName,
        to: toArr,
        cc: ccArr,
        subject: full.subject || email.subject || "(no subject)",
        bodyText: full.text || null,
        bodyHtml: full.html || null,
        messageId: messageIdHeader,
        inReplyTo: inReplyToHeader,
        references: referencesArr,
        hasAttachments: (email.attachments ?? []).length > 0,
        sentAt: full.created_at || email.created_at || new Date().toISOString(),
      });

      log(`📥 inbox stored: "${email.subject}" for ${property.property_name}`);
    } catch (err) {
      log(
        `inbox store error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

async function pollOnce(
  resend: Resend,
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
  inboxStore: InboxStore,
): Promise<void> {
  // -----------------------------------------------------------------------
  // Phase A: Poll RECEIVED emails
  // -----------------------------------------------------------------------
  const { data: listData, error: listError } =
    await resend.emails.receiving.list();

  if (listError) {
    log(`poll error: ${listError.message}`);
    return;
  }

  if (listData && listData.data && listData.data.length > 0) {
    // Categorize emails: intake (creates properties) vs property-specific (adds docs)
    const intakeEmails: Array<{ email: any; targetEmail: string }> = [];
    const propertyEmails: Array<{ email: any; targetEmail: string }> = [];

    for (const email of listData.data) {
      // Skip already-processed (DB lookup — survives restarts)
      if (await isEmailProcessed(email.id)) {
        continue;
      }

      // Determine recipient email routing
      const toAddresses = (email.to ?? []).map((a: string) => a.toLowerCase());
      const domainSuffix = `@${EMAIL_DOMAIN.toLowerCase()}`;

      // Find the first address that matches our domain
      const targetEmail = toAddresses.find((addr) =>
        addr.endsWith(domainSuffix),
      );

      if (!targetEmail) {
        // Not sent to our domain at all
        await markEmailProcessed(email.id);
        continue;
      }

      // Categorize by recipient (no longer filter by PDF-only for property emails)
      const isIntakeEmail = targetEmail === INTAKE_ADDRESS.toLowerCase();
      if (isIntakeEmail) {
        // Intake emails still need PDFs
        const pdfAttachments = (email.attachments ?? []).filter(
          (att: { content_type: string }) =>
            att.content_type === "application/pdf",
        );
        if (pdfAttachments.length === 0) {
          await markEmailProcessed(email.id);
          continue;
        }
        intakeEmails.push({ email, targetEmail });
      } else {
        // Property-specific emails — process ALL (PDFs go to docs, everything stored in inbox)
        propertyEmails.push({ email, targetEmail });
      }
    }

  // Phase 1: Process intake emails FIRST (creates properties)
  for (const { email, targetEmail } of intakeEmails) {
    await processEmail(
      resend,
      email,
      targetEmail,
      true,
      store,
      docStore,
      earnestWorkflowService,
    );
    await markEmailProcessed(email.id);
  }
    // Phase 1: Process intake emails FIRST (creates properties)
    for (const { email, targetEmail } of intakeEmails) {
      await processEmail(
        resend,
        email,
        targetEmail,
        true,
        store,
        docStore,
        inboxStore,
      );
      await markEmailProcessed(email.id);
    }

  // Phase 2: Process property-specific emails (adds docs to existing properties)
  for (const { email, targetEmail } of propertyEmails) {
    await processEmail(
      resend,
      email,
      targetEmail,
      false,
      store,
      docStore,
      earnestWorkflowService,
    );
    await markEmailProcessed(email.id);
    // Phase 2: Process property-specific emails (adds docs + stores in inbox)
    for (const { email, targetEmail } of propertyEmails) {
      await processEmail(
        resend,
        email,
        targetEmail,
        false,
        store,
        docStore,
        inboxStore,
      );
      await markEmailProcessed(email.id);
    }
  }

  // -----------------------------------------------------------------------
  // Phase B: Poll SENT emails (capture outbound messages)
  // -----------------------------------------------------------------------
  try {
    const { data: sentData, error: sentError } = await resend.emails.list();

    if (sentError) {
      log(`sent poll error: ${sentError.message}`);
      return;
    }

    if (!sentData || !sentData.data || sentData.data.length === 0) {
      return;
    }

    for (const sentEmail of sentData.data) {
      // Skip if already processed
      if (await isEmailProcessed(`sent_${sentEmail.id}`)) {
        continue;
      }

      // Check if the sender is one of our property emails
      const fromStr = (sentEmail as any).from || "";
      const fromEmail = fromStr.includes("<")
        ? fromStr.match(/<(.+)>/)?.[1] || fromStr
        : fromStr;

      const domainSuffix = `@${EMAIL_DOMAIN.toLowerCase()}`;
      if (!fromEmail.toLowerCase().endsWith(domainSuffix)) {
        await markEmailProcessed(`sent_${sentEmail.id}`);
        continue;
      }

      // Skip intake@ address
      if (fromEmail.toLowerCase() === INTAKE_ADDRESS.toLowerCase()) {
        await markEmailProcessed(`sent_${sentEmail.id}`);
        continue;
      }

      // Find the property by sender email
      const property = await store.findByPropertyEmail(fromEmail.toLowerCase());
      if (!property) {
        await markEmailProcessed(`sent_${sentEmail.id}`);
        continue;
      }

      // Skip if already in inbox (could have been stored on send)
      if (await inboxStore.existsByResendId(sentEmail.id)) {
        await markEmailProcessed(`sent_${sentEmail.id}`);
        continue;
      }

      // Fetch full sent email to get body
      try {
        const { data: fullSent, error: fullSentError } =
          await resend.emails.get(sentEmail.id);

        if (fullSentError || !fullSent) {
          await markEmailProcessed(`sent_${sentEmail.id}`);
          continue;
        }

        const full = fullSent as any;
        const toArr = (Array.isArray(full.to) ? full.to : [full.to])
          .filter(Boolean)
          .map((addr: string) => ({ email: addr, name: null }));
        const ccArr = (full.cc ?? []).map((addr: string) => ({
          email: addr,
          name: null,
        }));

        await inboxStore.createMessage({
          resendEmailId: sentEmail.id,
          propertyId: property.id,
          direction: "outbound",
          fromEmail: fromEmail.toLowerCase(),
          fromName: null,
          to: toArr,
          cc: ccArr,
          subject: full.subject || "(no subject)",
          bodyText: full.text || null,
          bodyHtml: full.html || null,
          messageId: full.message_id || null,
          inReplyTo: full.headers?.["in-reply-to"] || null,
          references: full.headers?.references
            ? full.headers.references.split(/\s+/).filter(Boolean)
            : [],
          hasAttachments: false, // Resend list doesn't expose attachments easily
          sentAt:
            full.created_at ||
            (sentEmail as any).created_at ||
            new Date().toISOString(),
        });

        log(
          `📤 inbox stored sent: "${full.subject}" from ${property.property_name}`,
        );
      } catch (err) {
        log(
          `sent fetch error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      await markEmailProcessed(`sent_${sentEmail.id}`);
    }
  } catch (err) {
    log(`sent poll error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startEmailPolling(
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
  inboxStore: InboxStore,
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
  pollOnce(resend, store, docStore, earnestWorkflowService).catch((err) =>
  pollOnce(resend, store, docStore, inboxStore).catch((err) =>
    log(`poll error: ${err instanceof Error ? err.message : String(err)}`),
  );

  pollTimer = setInterval(() => {
    pollOnce(resend, store, docStore, earnestWorkflowService).catch((err) =>
    pollOnce(resend, store, docStore, inboxStore).catch((err) =>
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
