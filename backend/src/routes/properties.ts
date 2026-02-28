import { Router, Request, Response } from "express";
import { db } from "../db";
import { properties } from "../db/schema";
import { eq } from "drizzle-orm";

export const propertiesRouter = Router();

// GET /api/properties - list all active properties
propertiesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const allProperties = await db
      .select()
      .from(properties)
      .where(eq(properties.status, "active"));

    res.json(allProperties);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch properties";
    res.status(500).json({ error: { message } });
  }
});

// GET /api/properties/:id - get single property
propertiesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, req.params.id));

    if (!property) {
      res.status(404).json({ error: { message: "Property not found" } });
      return;
    }

    res.json(property);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch property";
    res.status(500).json({ error: { message } });
  }
});
