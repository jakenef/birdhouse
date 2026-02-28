import { Resend } from "resend";
import { promises as fs } from "fs";
import path from "path";
import https from "https";
import http from "http";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INTAKE_ADDRESS =
  process.env.INTAKE_EMAIL || "intake@bronaaelda.resend.app";
const POLL_INTERVAL_MS = Number(process.env.EMAIL_POLL_INTERVAL_MS || "30000");
const ATTACHMENTS_DIR = path.resolve(process.cwd(), "data", "intake-pdfs");

// ---------------------------------------------------------------------------
// State — tracks emails we've already processed (in-memory for now)
// ---------------------------------------------------------------------------

const processedEmailIds = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data, ts: new Date().toISOString() }));
}

/**
 * Download a file from a URL and return the Buffer.
 */
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
// Core polling logic
// ---------------------------------------------------------------------------

async function pollOnce(resend: Resend): Promise<void> {
  // 1. List recent received emails
  const { data: listData, error: listError } =
    await resend.emails.receiving.list();

  if (listError) {
    log("email_poll_error", { message: listError.message });
    return;
  }

  if (!listData || !listData.data || listData.data.length === 0) {
    return;
  }

  for (const email of listData.data) {
    // 2. Skip already-processed
    if (processedEmailIds.has(email.id)) {
      continue;
    }

    // 3. Check if sent to the intake address
    const toAddresses = (email.to ?? []).map((a: string) => a.toLowerCase());
    if (!toAddresses.includes(INTAKE_ADDRESS.toLowerCase())) {
      processedEmailIds.add(email.id);
      continue;
    }

    // ------------------------------------------------------------------
    // This is a valid intake email — process it
    // ------------------------------------------------------------------

    log("intake_email_received", {
      email_id: email.id,
      from: email.from,
      subject: email.subject,
      to: email.to,
    });

    // 4. Check for PDF attachments
    const pdfAttachments = (email.attachments ?? []).filter(
      (att: { content_type: string }) => att.content_type === "application/pdf",
    );

    if (pdfAttachments.length === 0) {
      log("intake_email_no_pdf", {
        email_id: email.id,
        message: "Intake email has no PDF attachments — skipping.",
        attachment_count: (email.attachments ?? []).length,
      });
      processedEmailIds.add(email.id);
      continue;
    }

    // 5. Download each PDF attachment
    for (const att of pdfAttachments) {
      try {
        // Get attachment download URL from Resend
        const { data: attData, error: attError } =
          await resend.emails.receiving.attachments.get({
            id: att.id,
            emailId: email.id,
          });

        if (attError || !attData) {
          log("intake_attachment_error", {
            email_id: email.id,
            attachment_id: att.id,
            message: attError?.message ?? "No attachment data returned",
          });
          continue;
        }

        const downloadUrl = (attData as { download_url?: string }).download_url;
        if (!downloadUrl) {
          log("intake_attachment_no_url", {
            email_id: email.id,
            attachment_id: att.id,
          });
          continue;
        }

        const pdfBuffer = await downloadBuffer(downloadUrl);

        // 6. Save file locally
        await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
        const safeFilename = (att.filename || "attachment.pdf").replace(
          /[^a-zA-Z0-9._-]/g,
          "_",
        );
        const savedFilename = `${email.id}_${safeFilename}`;
        const savedPath = path.join(ATTACHMENTS_DIR, savedFilename);
        await fs.writeFile(savedPath, pdfBuffer);

        // ============================================================
        // 🔔  VISIBLE LOG FOR TESTING
        // ============================================================
        console.log("\n" + "=".repeat(70));
        console.log("📬  NEW INTAKE EMAIL RECEIVED");
        console.log("=".repeat(70));
        console.log(`  From:       ${email.from}`);
        console.log(`  Subject:    ${email.subject}`);
        console.log(`  To:         ${(email.to ?? []).join(", ")}`);
        console.log(`  Email ID:   ${email.id}`);
        console.log(`  Attachment: ${att.filename} (${att.size ?? "?"} bytes)`);
        console.log(`  Saved to:   ${savedPath}`);
        console.log("=".repeat(70) + "\n");

        log("intake_pdf_saved", {
          email_id: email.id,
          attachment_id: att.id,
          filename: att.filename,
          saved_path: savedPath,
          bytes: pdfBuffer.length,
        });

        // TODO: Emit IntakeEvent to trigger parse pipeline
      } catch (err) {
        log("intake_attachment_download_error", {
          email_id: email.id,
          attachment_id: att.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    processedEmailIds.add(email.id);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startEmailPolling(): void {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    log("email_polling_skipped", {
      message: "RESEND_API_KEY not set — email intake polling is disabled.",
    });
    return;
  }

  const resend = new Resend(apiKey);

  log("email_polling_started", {
    intake_address: INTAKE_ADDRESS,
    poll_interval_ms: POLL_INTERVAL_MS,
  });

  // Run immediately, then on interval
  pollOnce(resend).catch((err) =>
    log("email_poll_error", {
      message: err instanceof Error ? err.message : String(err),
    }),
  );

  pollTimer = setInterval(() => {
    pollOnce(resend).catch((err) =>
      log("email_poll_error", {
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, POLL_INTERVAL_MS);
}

export function stopEmailPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log("email_polling_stopped", {});
  }
}
