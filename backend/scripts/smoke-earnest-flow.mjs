const baseUrl = process.env.BASE_URL || "http://localhost:3001";
const propertyIdOverride = process.env.PROPERTY_ID || null;
const contactName = process.env.CONTACT_NAME || "Hayden Peterson";
const contactEmail =
  process.env.CONTACT_EMAIL || "haydenkpeterson@gmail.com";
const sendDraft =
  String(process.env.SEND_DRAFT || "").toLowerCase() === "true";
const confirmWireSent =
  String(process.env.CONFIRM_WIRE_SENT || "").toLowerCase() === "true";
const confirmComplete =
  String(process.env.CONFIRM_COMPLETE || "").toLowerCase() === "true";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!response.ok) {
    throw new Error(
      `Request failed ${response.status} ${response.statusText}: ${typeof json === "string" ? json : JSON.stringify(json)}`,
    );
  }

  return json;
}

async function main() {
  const health = await requestJson(`${baseUrl}/health`);
  console.log("Health:", health);

  const contactResult = await requestJson(`${baseUrl}/api/contacts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "escrow_officer",
      name: contactName,
      email: contactEmail,
    }),
  });

  console.log("Escrow contact set:", contactResult.contact);

  const propertyId = await resolvePropertyId();
  console.log("Using property:", propertyId);

  const prepared = await requestJson(
    `${baseUrl}/api/properties/${propertyId}/pipeline/earnest/prepare`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  console.log("Earnest status:", prepared.earnest.step_status);
  console.log("Pending user action:", prepared.earnest.pending_user_action);
  console.log("Earnest contact:", prepared.earnest.contact);
  console.log("Earnest attachment:", prepared.earnest.attachment);
  console.log("Draft subject:");
  console.log(prepared.earnest.draft.subject);
  console.log("");
  console.log("Draft body:");
  console.log(prepared.earnest.draft.body);

  if (!sendDraft) {
    return;
  }

  console.log("");
  console.log("Sending prepared draft through mocked send endpoint...");

  const sent = await requestJson(
    `${baseUrl}/api/properties/${propertyId}/pipeline/earnest/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: prepared.earnest.draft.subject,
        body: prepared.earnest.draft.body,
      }),
    },
  );

  console.log("Post-send earnest status:", sent.earnest.step_status);
  console.log("Pending user action:", sent.earnest.pending_user_action);
  console.log("Recipient email:", sent.earnest.contact?.email || null);
  console.log("Sender email:", sent.earnest.property_email);
  console.log("Message ID:", sent.earnest.send_state.message_id);
  console.log("Thread ID:", sent.earnest.send_state.thread_id);
  console.log("This uses the real backend outbound path. Delivery still depends on your Resend setup.");

  if (confirmWireSent) {
    const wireConfirmed = await requestJson(
      `${baseUrl}/api/properties/${propertyId}/pipeline/earnest/confirm-wire-sent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    console.log("After confirm-wire-sent:", wireConfirmed.earnest.step_status);
  }

  if (confirmComplete) {
    const completeConfirmed = await requestJson(
      `${baseUrl}/api/properties/${propertyId}/pipeline/earnest/confirm-complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    console.log("After confirm-complete:", completeConfirmed.earnest.step_status);
  }
}

async function resolvePropertyId() {
  if (propertyIdOverride) {
    return propertyIdOverride;
  }

  const propertiesResponse = await requestJson(`${baseUrl}/api/properties`);
  const properties = Array.isArray(propertiesResponse.properties)
    ? propertiesResponse.properties
    : [];

  if (properties.length === 0) {
    throw new Error(
      "No properties found. Wait for intake to create one or pass PROPERTY_ID.",
    );
  }

  return properties[0].id;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
