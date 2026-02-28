import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";

import { parseRouter } from "./routes/parse";
import { propertiesRouter } from "./routes/properties";
import { seedProperties } from "./db/seed";

const requiredEnvVars = [
  "GOOGLE_CLOUD_PROJECT_ID",
  "GOOGLE_CLOUD_LOCATION",
  "DOCUMENT_AI_PROCESSOR_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
] as const;

const missingEnvVars = requiredEnvVars.filter((envVar) => {
  const value = process.env[envVar];
  return !value || value.trim().length === 0;
});

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
}

const app = express();
const port = Number(process.env.PORT || "3001");

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
app.use("/api/properties", propertiesRouter);

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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
  },
);

app.listen(port, async () => {
  // Seed sample data in dev
  await seedProperties();

  console.log(
    JSON.stringify({
      event: "server_started",
      port,
      health_url: `http://localhost:${port}/health`,
      parse_url: `http://localhost:${port}/api/parse`,
      properties_url: `http://localhost:${port}/api/properties`,
    }),
  );
});
