import "dotenv/config";
import path from "path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer from "multer";

import { parseRouter } from "./routes/parse";
import { createPropertiesRouter } from "./routes/properties";
import { DrizzlePropertyStore } from "./services/drizzlePropertyStore";
import { startEmailPolling } from "./services/emailIntake";

const app = express();
const port = Number(process.env.PORT || "3001");
const propertyStore = new DrizzlePropertyStore();

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
app.use("/api", createPropertiesRouter(propertyStore));

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
  startEmailPolling(propertyStore);

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
