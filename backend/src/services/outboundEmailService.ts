import { promises as fs } from "fs";
import path from "path";
import { Resend } from "resend";

import { InboxStore } from "./inboxStore";

export type SendOutboundEmailInput = {
  property_id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  body_html?: string | null;
  reply_to_message_id?: string | null;
  attachments?: Array<{
    document_id?: string | null;
    filename: string;
    mime_type: string;
    file_path: string;
  }>;
};

export type SendOutboundEmailResult = {
  inbox_message_id: string;
  resend_email_id: string;
  thread_id: string;
  message_id: string | null;
  sent_at: string;
  from: string;
  to: string[];
  subject: string;
};

export class OutboundEmailServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundEmailServiceError";
  }
}

type ResendClientLike = {
  emails: {
    send: (args: any) => Promise<{ data?: { id?: string | null } | null; error?: { message?: string | null } | null }>;
    get: (id: string) => Promise<{ data?: any; error?: { message?: string | null } | null }>;
  };
};

function getResendClient(client?: ResendClientLike): ResendClientLike {
  if (client) {
    return client;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new OutboundEmailServiceError("RESEND_API_KEY is not configured.");
  }

  return new Resend(apiKey) as unknown as ResendClientLike;
}

async function resolveAttachments(
  attachments: SendOutboundEmailInput["attachments"],
): Promise<Array<{ filename: string; content: Buffer }>> {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const resolved = [];
  for (const attachment of attachments) {
    const absolutePath = path.resolve(__dirname, "../..", attachment.file_path);
    const content = await fs.readFile(absolutePath);
    resolved.push({
      filename: attachment.filename,
      content,
    });
  }

  return resolved;
}

export class OutboundEmailService {
  constructor(
    private readonly inboxStore: InboxStore,
    private readonly resendClient?: ResendClientLike,
  ) {}

  async send(input: SendOutboundEmailInput): Promise<SendOutboundEmailResult> {
    const resend = getResendClient(this.resendClient);

    let inReplyToHeader: string | undefined;
    const referencesArr: string[] = [];

    if (input.reply_to_message_id) {
      const parentMsg = await this.inboxStore.findById(input.reply_to_message_id);
      if (parentMsg?.message_id) {
        inReplyToHeader = parentMsg.message_id;
        referencesArr.push(...parentMsg.references, parentMsg.message_id);
      }
    }

    const attachments = await resolveAttachments(input.attachments);
    const sentAt = new Date().toISOString();

    const { data: emailResult, error: sendError } = await resend.emails.send({
      from: input.from,
      to: input.to,
      cc: input.cc ?? undefined,
      bcc: input.bcc ?? undefined,
      subject: input.subject,
      text: input.body,
      html: input.body_html ?? undefined,
      attachments:
        attachments.length > 0
          ? attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
            }))
          : undefined,
      headers: {
        ...(inReplyToHeader ? { "In-Reply-To": inReplyToHeader } : {}),
        ...(referencesArr.length > 0
          ? { References: referencesArr.join(" ") }
          : {}),
      },
    });

    if (sendError || !emailResult?.id) {
      throw new OutboundEmailServiceError(
        sendError?.message ?? "Failed to send email via Resend.",
      );
    }

    let messageId: string | null = null;
    let storedSentAt = sentAt;

    try {
      const { data: fullSent, error: fullSentError } = await resend.emails.get(
        emailResult.id,
      );

      if (!fullSentError && fullSent) {
        messageId = fullSent.message_id || null;
        storedSentAt = fullSent.created_at || sentAt;
      }
    } catch {
      // Best-effort enrichment only.
    }

    const storedMessage = await this.inboxStore.createMessage({
      resendEmailId: emailResult.id,
      propertyId: input.property_id,
      direction: "outbound",
      fromEmail: input.from,
      fromName: null,
      to: input.to.map((email) => ({ email, name: null })),
      cc: (input.cc ?? []).map((email) => ({ email, name: null })),
      bcc: (input.bcc ?? []).map((email) => ({ email, name: null })),
      subject: input.subject,
      bodyText: input.body,
      bodyHtml: input.body_html ?? null,
      messageId,
      inReplyTo: inReplyToHeader ?? null,
      references: referencesArr,
      hasAttachments: attachments.length > 0,
      sentAt: storedSentAt,
    });

    return {
      inbox_message_id: storedMessage.id,
      resend_email_id: emailResult.id,
      thread_id: storedMessage.thread_id,
      message_id: storedMessage.message_id,
      sent_at: storedMessage.sent_at,
      from: input.from,
      to: input.to,
      subject: input.subject,
    };
  }
}
