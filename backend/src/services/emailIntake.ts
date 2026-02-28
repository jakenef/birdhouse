import { Resend } from "resend";
import { promises as fs } from "fs";
import path from "path";
import https from "https";
import http from "http";
import { eq } from "drizzle-orm";

import { sha256 } from "../utils/hash";
import { db } from "../db";
import { processedEmails } from "../db/schema";
import { extractContractFieldsFromDocAi } from "./docai";
import { parsePurchaseContractWithOpenAi } from "./openai";
import { PropertyStore, DuplicatePropertyError } from "./propertyStore";
import { DocumentStore } from "./documentStore";
import { EarnestWorkflowService } from "./earnestWorkflow";
import { EarnestInboxAutomation } from "./earnestInboxAutomation";
import { InboxStore } from "./inboxStore";

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || "bronaaelda.resend.app";
const INTAKE_ADDRESS = `intake@${EMAIL_DOMAIN}`;
const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS || "30000");
const ATTACHMENTS_DIR = path.resolve(process.cwd(), "data", "intake-pdfs");
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || "60000");

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
    (name) => process.env[name] && process.env[name]!.trim().length > 0,
  );
}

async function processIntakeEmail(
  att: any,
  pdfBuffer: Buffer,
  savedFilename: string,
  docHash: string,
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
): Promise<void> {
  const existing = await store.findByDocHash(docHash);
  if (existing) {
    log(`skip duplicate PDF (${existing.id})`);
    return;
  }

  if (!canParse()) {
    log("skip - parse env vars not configured");
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
    `created property ${record.property_name} | $${(c.money.purchase_price ?? 0).toLocaleString()} | buyers ${c.parties.buyers.join(", ")} | sellers ${c.parties.sellers.join(", ")} | closing ${c.key_dates.settlement_deadline ?? "TBD"}`,
  );
}

async function processPropertyEmail(
  propertyEmail: string,
  att: any,
  pdfBuffer: Buffer,
  savedFilename: string,
  docHash: string,
  store: PropertyStore,
  docStore: DocumentStore,
): Promise<void> {
  const property = await store.findByPropertyEmail(propertyEmail);
  if (!property) {
    log(`skip - no property found for ${propertyEmail}`);
    return;
  }

  await docStore.create({
    propertyId: property.id,
    filename: att.filename || "attachment.pdf",
    filePath: `data/intake-pdfs/${savedFilename}`,
    mimeType: "application/pdf",
    sizeBytes: pdfBuffer.length,
    docHash,
    source: "email_intake",
  });

  log(`added doc to ${property.property_name} (${att.filename || "attachment.pdf"})`);
}

async function storeInboundPropertyEmail(
  resend: Resend,
  email: any,
  targetEmail: string,
  store: PropertyStore,
  inboxStore: InboxStore,
  earnestInboxAutomation: EarnestInboxAutomation,
): Promise<void> {
  const property = await store.findByPropertyEmail(targetEmail);
  if (!property) {
    log(`inbox skip - no property for ${targetEmail}`);
    return;
  }

  if (await inboxStore.existsByResendId(email.id)) {
    return;
  }

  const { data: fullEmail, error: fullError } =
    await resend.emails.receiving.get(email.id);

  if (fullError || !fullEmail) {
    log(`error fetching full email: ${fullError?.message ?? "No data returned"}`);
    return;
  }

  const full = fullEmail as any;
  const fromStr = full.from || email.from || "";
  const nameMatch = fromStr.match(/^(.+?)\s*<(.+)>$/);
  const fromEmail = nameMatch ? nameMatch[2] : fromStr;
  const fromName = nameMatch ? nameMatch[1].trim() : null;

  const headers = full.headers || {};
  const messageIdHeader = full.message_id || headers["message-id"] || null;
  const inReplyToHeader = headers["in-reply-to"] || null;
  const referencesHeader = headers.references || headers["references"] || null;
  const referencesArr = referencesHeader
    ? String(referencesHeader).split(/\s+/).filter(Boolean)
    : [];

  const toArr = (full.to ?? email.to ?? []).map((addr: string) => ({
    email: addr,
    name: null,
  }));
  const ccArr = (full.cc ?? []).map((addr: string) => ({
    email: addr,
    name: null,
  }));

  const storedMessage = await inboxStore.createMessage({
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

  log(`inbox stored: "${email.subject}" for ${property.property_name}`);

  try {
    await earnestInboxAutomation.processStoredMessage(storedMessage);
  } catch (error) {
    log(
      `earnest inbox automation error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function processEmail(
  resend: Resend,
  email: any,
  targetEmail: string,
  isIntakeEmail: boolean,
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
  inboxStore: InboxStore,
  earnestInboxAutomation: EarnestInboxAutomation,
): Promise<void> {
  const pdfAttachments = (email.attachments ?? []).filter(
    (att: { content_type: string }) => att.content_type === "application/pdf",
  );

  log(
    `email from ${email.from} -> ${targetEmail} - "${email.subject}" (${pdfAttachments.length} PDF${pdfAttachments.length !== 1 ? "s" : ""})`,
  );

  for (const att of pdfAttachments) {
    try {
      const { data: attData, error: attError } =
        await resend.emails.receiving.attachments.get({
          id: att.id,
          emailId: email.id,
        });

      if (attError || !attData) {
        log(`error downloading attachment: ${attError?.message ?? "No data returned"}`);
        continue;
      }

      const downloadUrl = (attData as { download_url?: string }).download_url;
      if (!downloadUrl) continue;

      const pdfBuffer = await downloadBuffer(downloadUrl);
      await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
      const safeFilename = (att.filename || "attachment.pdf").replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const savedFilename = `${email.id}_${safeFilename}`;
      const savedPath = path.join(ATTACHMENTS_DIR, savedFilename);
      await fs.writeFile(savedPath, pdfBuffer);

      const docHash = sha256(pdfBuffer);

      if (isIntakeEmail) {
        await processIntakeEmail(
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
    } catch (error) {
      if (error instanceof DuplicatePropertyError) {
        log("skip duplicate");
      } else {
        log(`error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (!isIntakeEmail) {
    try {
      await storeInboundPropertyEmail(
        resend,
        email,
        targetEmail,
        store,
        inboxStore,
        earnestInboxAutomation,
      );
    } catch (error) {
      log(`inbox store error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function pollOnce(
  resend: Resend,
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
  inboxStore: InboxStore,
  earnestInboxAutomation: EarnestInboxAutomation,
): Promise<void> {
  const { data: listData, error: listError } = await resend.emails.receiving.list();
  if (listError) {
    log(`poll error: ${listError.message}`);
    return;
  }

  if (listData?.data?.length) {
    const intakeEmails: Array<{ email: any; targetEmail: string }> = [];
    const propertyEmails: Array<{ email: any; targetEmail: string }> = [];

    for (const email of listData.data) {
      if (await isEmailProcessed(email.id)) {
        continue;
      }

      const toAddresses = (email.to ?? []).map((address: string) =>
        address.toLowerCase(),
      );
      const domainSuffix = `@${EMAIL_DOMAIN.toLowerCase()}`;
      const targetEmail = toAddresses.find((address) =>
        address.endsWith(domainSuffix),
      );

      if (!targetEmail) {
        await markEmailProcessed(email.id);
        continue;
      }

      const isIntakeEmail = targetEmail === INTAKE_ADDRESS.toLowerCase();
      if (isIntakeEmail) {
        const pdfOnly = (email.attachments ?? []).filter(
          (att: { content_type: string }) =>
            att.content_type === "application/pdf",
        );
        if (pdfOnly.length === 0) {
          await markEmailProcessed(email.id);
          continue;
        }
        intakeEmails.push({ email, targetEmail });
      } else {
        propertyEmails.push({ email, targetEmail });
      }
    }

    for (const { email, targetEmail } of intakeEmails) {
      await processEmail(
        resend,
        email,
        targetEmail,
        true,
        store,
        docStore,
        earnestWorkflowService,
        inboxStore,
        earnestInboxAutomation,
      );
      await markEmailProcessed(email.id);
    }

    for (const { email, targetEmail } of propertyEmails) {
      await processEmail(
        resend,
        email,
        targetEmail,
        false,
        store,
        docStore,
        earnestWorkflowService,
        inboxStore,
        earnestInboxAutomation,
      );
      await markEmailProcessed(email.id);
    }
  }

  try {
    const { data: sentData, error: sentError } = await resend.emails.list();
    if (sentError) {
      log(`sent poll error: ${sentError.message}`);
      return;
    }

    if (!sentData?.data?.length) {
      return;
    }

    for (const sentEmail of sentData.data) {
      const processedSentId = `sent_${sentEmail.id}`;
      if (await isEmailProcessed(processedSentId)) {
        continue;
      }

      const fromStr = (sentEmail as any).from || "";
      const fromEmail = fromStr.includes("<")
        ? fromStr.match(/<(.+)>/)?.[1] || fromStr
        : fromStr;
      const domainSuffix = `@${EMAIL_DOMAIN.toLowerCase()}`;

      if (!fromEmail.toLowerCase().endsWith(domainSuffix)) {
        await markEmailProcessed(processedSentId);
        continue;
      }

      if (fromEmail.toLowerCase() === INTAKE_ADDRESS.toLowerCase()) {
        await markEmailProcessed(processedSentId);
        continue;
      }

      const property = await store.findByPropertyEmail(fromEmail.toLowerCase());
      if (!property) {
        await markEmailProcessed(processedSentId);
        continue;
      }

      if (await inboxStore.existsByResendId(sentEmail.id)) {
        await markEmailProcessed(processedSentId);
        continue;
      }

      try {
        const { data: fullSent, error: fullSentError } =
          await resend.emails.get(sentEmail.id);

        if (fullSentError || !fullSent) {
          await markEmailProcessed(processedSentId);
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
            ? String(full.headers.references).split(/\s+/).filter(Boolean)
            : [],
          hasAttachments: false,
          sentAt:
            full.created_at ||
            (sentEmail as any).created_at ||
            new Date().toISOString(),
        });

        log(`inbox stored sent: "${full.subject}" from ${property.property_name}`);
      } catch (error) {
        log(`sent fetch error: ${error instanceof Error ? error.message : String(error)}`);
      }

      await markEmailProcessed(processedSentId);
    }
  } catch (error) {
    log(`sent poll error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startEmailPolling(
  store: PropertyStore,
  docStore: DocumentStore,
  earnestWorkflowService: EarnestWorkflowService,
  inboxStore: InboxStore,
  earnestInboxAutomation: EarnestInboxAutomation,
): void {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    log("disabled - RESEND_API_KEY not set");
    return;
  }

  const resend = new Resend(apiKey);
  log(
    `polling ${INTAKE_ADDRESS} every ${POLL_INTERVAL_MS / 1000}s (parse: ${canParse() ? "on" : "off"})`,
  );

  pollOnce(
    resend,
    store,
    docStore,
    earnestWorkflowService,
    inboxStore,
    earnestInboxAutomation,
  ).catch((error) =>
    log(`poll error: ${error instanceof Error ? error.message : String(error)}`),
  );

  pollTimer = setInterval(() => {
    pollOnce(
      resend,
      store,
      docStore,
      earnestWorkflowService,
      inboxStore,
      earnestInboxAutomation,
    ).catch((error) =>
      log(`poll error: ${error instanceof Error ? error.message : String(error)}`),
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
