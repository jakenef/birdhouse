export type SendPropertyEmailInput = {
  property_id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  body_html?: string | null;
  reply_to_thread_id?: string | null;
  attachments?: Array<{
    document_id: string;
    filename: string;
    mime_type: string;
  }>;
};

export type SendPropertyEmailResult = {
  id: string;
  thread_id: string;
  sent_at: string;
  from: string;
  to: string[];
  subject: string;
};

export class PropertyEmailSender {
  async send(input: SendPropertyEmailInput): Promise<SendPropertyEmailResult> {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      thread_id: input.reply_to_thread_id || `thread_${Date.now()}`,
      sent_at: new Date().toISOString(),
      from: input.from,
      to: input.to,
      subject: input.subject,
    };
  }
}
