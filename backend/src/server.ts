import "dotenv/config";
import path from "path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";

import { parseRouter } from "./routes/parse";
import { createPropertiesRouter } from "./routes/properties";
import { createContactsRouter } from "./routes/contacts";
import { ContactStore } from "./services/contactStore";
import { EarnestWorkflowService } from "./services/earnestWorkflow";
import { GoogleStreetViewService } from "./services/googleStreetView";
import { DrizzlePropertyStore } from "./services/drizzlePropertyStore";
import { DocumentStore } from "./services/documentStore";
import { PropertyEmailSender } from "./services/propertyEmailSender";
import { InboxStore } from "./services/inboxStore";
import { startEmailPolling } from "./services/emailIntake";

const app = express();
const port = Number(process.env.PORT || "3001");
const propertyStore = new DrizzlePropertyStore();
const documentStore = new DocumentStore();
const inboxStore = new InboxStore();
const streetViewService = new GoogleStreetViewService();
const contactStore = new ContactStore();
const propertyEmailSender = new PropertyEmailSender();
const earnestWorkflowService = new EarnestWorkflowService(
  propertyStore,
  documentStore,
  contactStore,
  propertyEmailSender,
);

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    message: "Backend is running",
  });
});

app.use("/api", parseRouter);
app.use(
  "/api",
  createPropertiesRouter(
    propertyStore,
    streetViewService,
    documentStore,
    earnestWorkflowService,
    propertyEmailSender,
  ),
  createPropertiesRouter(
    propertyStore,
    streetViewService,
    documentStore,
    inboxStore,
  ),
);
app.use("/api", createContactsRouter(contactStore));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({
      error: {
        message: "File exceeds the configured max size.",
      },
    });
    return;
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";

  res.status(500).json({
    error: {
      message,
    },
  });
});

app.listen(port, () => {
  // Start email intake polling
  startEmailPolling(propertyStore, documentStore, earnestWorkflowService);
  startEmailPolling(propertyStore, documentStore, inboxStore);

  console.log(
    JSON.stringify({
      event: "server_started",
      port,
      health_url: `http://localhost:${port}/health`,
      parse_url: `http://localhost:${port}/api/parse`,
      properties_url: `http://localhost:${port}/api/properties`,
      property_detail_url: `http://localhost:${port}/api/properties/:propertyId`,
      document_download_url: `http://localhost:${port}/api/properties/:propertyId/documents/:docId/download`,
      property_street_view_url: `http://localhost:${port}/api/properties/:propertyId/street-view`,
    }),
  );
});
