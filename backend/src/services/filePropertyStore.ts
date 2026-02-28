import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import {
  DuplicatePropertyError,
  PropertyStore,
  PropertyStoreError,
} from "./propertyStore";
import {
  MockPropertiesFile,
  StoredPropertyRecord,
  StreetViewCacheEntry,
} from "../types/property";
import { PropertyWorkflowState } from "../types/workflow";
import { derivePropertyName } from "../utils/propertyName";
import { buildPropertyEmail } from "../utils/emailSlug";

const EMPTY_DATABASE: MockPropertiesFile = {
  properties: [],
};

function generatePropertyId(): string {
  return `prop_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function isStoredPropertyRecord(value: unknown): value is StoredPropertyRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.property_name === "string" &&
    typeof record.created_at_iso === "string" &&
    typeof record.updated_at_iso === "string" &&
    typeof record.parsed_contract === "object" &&
    record.parsed_contract !== null &&
    (record.workflow_state === undefined ||
      isPropertyWorkflowState(record.workflow_state)) &&
    (record.street_view === undefined ||
      isStreetViewCacheEntry(record.street_view))
  );
}

function isPipelineStepStatus(value: unknown): boolean {
  return (
    value === "locked" ||
    value === "action_needed" ||
    value === "waiting_for_parties" ||
    value === "completed"
  );
}

function isPropertyWorkflowState(value: unknown): value is PropertyWorkflowState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workflow = value as Record<string, unknown>;
  const steps = workflow.steps as Record<string, unknown> | undefined;
  const earnest = workflow.earnest as Record<string, unknown> | undefined;
  const draft = earnest?.draft as Record<string, unknown> | undefined;
  const suggestion = earnest?.suggestion as Record<string, unknown> | undefined;

  return (
    workflow.version === 1 &&
    typeof workflow.current_label === "string" &&
    !!steps &&
    ["under_contract", "earnest_money", "due_diligence_inspection", "financing", "title_escrow", "closing"].every(
      (key) => {
        const step = steps[key] as Record<string, unknown> | undefined;
        return (
          !!step &&
          typeof step.label === "string" &&
          isPipelineStepStatus(step.status) &&
          (step.locked_reason === null || typeof step.locked_reason === "string") &&
          typeof step.last_transition_at_iso === "string" &&
          (step.last_transition_reason === null ||
            typeof step.last_transition_reason === "string")
        );
      },
    ) &&
    !!earnest &&
    !!draft &&
    typeof draft.status === "string" &&
    !!suggestion &&
    typeof suggestion.pending_user_action === "string" &&
    (suggestion.prompt_to_user === null ||
      typeof suggestion.prompt_to_user === "string") &&
    (suggestion.evidence_message_id === null ||
      typeof suggestion.evidence_message_id === "string") &&
    (suggestion.evidence_thread_id === null ||
      typeof suggestion.evidence_thread_id === "string") &&
    (suggestion.latest_summary === null ||
      typeof suggestion.latest_summary === "string") &&
    (suggestion.latest_confidence === null ||
      typeof suggestion.latest_confidence === "number") &&
    (suggestion.latest_reason === null ||
      typeof suggestion.latest_reason === "string") &&
    typeof suggestion.latest_pipeline_label === "string" &&
    typeof suggestion.latest_earnest_signal === "string" &&
    (suggestion.updated_at_iso === null ||
      typeof suggestion.updated_at_iso === "string")
  );
}

function isStreetViewStatus(
  value: unknown,
): value is StreetViewCacheEntry["status"] {
  return value === "available" || value === "unavailable" || value === "error";
}

function isStreetViewCacheEntry(value: unknown): value is StreetViewCacheEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    isStreetViewStatus(entry.status) &&
    typeof entry.last_checked_at_iso === "string" &&
    (entry.source_address === null ||
      typeof entry.source_address === "string") &&
    (entry.resolved_address === null ||
      typeof entry.resolved_address === "string") &&
    (entry.latitude === null || typeof entry.latitude === "number") &&
    (entry.longitude === null || typeof entry.longitude === "number") &&
    (entry.target_latitude === undefined ||
      entry.target_latitude === null ||
      typeof entry.target_latitude === "number") &&
    (entry.target_longitude === undefined ||
      entry.target_longitude === null ||
      typeof entry.target_longitude === "number") &&
    (entry.heading === undefined ||
      entry.heading === null ||
      typeof entry.heading === "number") &&
    (entry.pano_id === null || typeof entry.pano_id === "string") &&
    (entry.error_message === null || typeof entry.error_message === "string")
  );
}

function isMockPropertiesFile(value: unknown): value is MockPropertiesFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const file = value as Record<string, unknown>;
  return (
    Array.isArray(file.properties) &&
    file.properties.every((record) => isStoredPropertyRecord(record))
  );
}

export class FilePropertyStore implements PropertyStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<StoredPropertyRecord[]> {
    const database = await this.readDatabase();
    return [...database.properties].reverse();
  }

  async create(
    parsedContract: ParsedPurchaseContract,
  ): Promise<StoredPropertyRecord> {
    const database = await this.readDatabase();
    const existing = database.properties.find(
      (record) =>
        record.parsed_contract.metadata.doc_hash ===
        parsedContract.metadata.doc_hash,
    );

    if (existing) {
      throw new DuplicatePropertyError(
        `Property already exists for doc_hash ${parsedContract.metadata.doc_hash}.`,
      );
    }

    const timestamp = new Date().toISOString();
    const domain = process.env.EMAIL_DOMAIN || "bronaaelda.resend.app";
    const record: StoredPropertyRecord = {
      id: generatePropertyId(),
      property_name: derivePropertyName(parsedContract),
      property_email: buildPropertyEmail(
        parsedContract.property.address_full,
        domain,
      ),
      created_at_iso: timestamp,
      updated_at_iso: timestamp,
      parsed_contract: parsedContract,
    };

    database.properties.push(record);
    await this.writeDatabase(database);

    return record;
  }

  async findByDocHash(docHash: string): Promise<StoredPropertyRecord | null> {
    const database = await this.readDatabase();
    return (
      database.properties.find(
        (record) => record.parsed_contract.metadata.doc_hash === docHash,
      ) || null
    );
  }

  async findById(id: string): Promise<StoredPropertyRecord | null> {
    const database = await this.readDatabase();
    return database.properties.find((record) => record.id === id) || null;
  }

  async findByPropertyEmail(
    email: string,
  ): Promise<StoredPropertyRecord | null> {
    const database = await this.readDatabase();
    return (
      database.properties.find((record) => record.property_email === email) ||
      null
    );
  }

  async getWorkflowState(propertyId: string): Promise<PropertyWorkflowState | null> {
    const property = await this.findById(propertyId);
    return property?.workflow_state || null;
  }

  async updateWorkflowState(
    id: string,
    workflowState: PropertyWorkflowState,
  ): Promise<StoredPropertyRecord> {
    const database = await this.readDatabase();
    const index = database.properties.findIndex((record) => record.id === id);

    if (index === -1) {
      throw new PropertyStoreError(`Property ${id} was not found.`);
    }

    const updatedRecord: StoredPropertyRecord = {
      ...database.properties[index],
      workflow_state: workflowState,
      updated_at_iso: new Date().toISOString(),
    };

    database.properties[index] = updatedRecord;
    await this.writeDatabase(database);

    return updatedRecord;
  }

  async updateStreetView(
    id: string,
    streetView: StreetViewCacheEntry,
  ): Promise<StoredPropertyRecord> {
    const database = await this.readDatabase();
    const index = database.properties.findIndex((record) => record.id === id);

    if (index === -1) {
      throw new PropertyStoreError(`Property ${id} was not found.`);
    }

    const record = database.properties[index];
    const updatedRecord: StoredPropertyRecord = {
      ...record,
      updated_at_iso: new Date().toISOString(),
      street_view: streetView,
    };

    database.properties[index] = updatedRecord;
    await this.writeDatabase(database);

    return updatedRecord;
  }

  private async ensureDatabaseFile(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(
        this.filePath,
        JSON.stringify(EMPTY_DATABASE, null, 2),
        "utf8",
      );
    }
  }

  private async readDatabase(): Promise<MockPropertiesFile> {
    await this.ensureDatabaseFile();

    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      throw new PropertyStoreError(
        error instanceof Error
          ? `Unable to read property store: ${error.message}`
          : "Unable to read property store.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new PropertyStoreError(
        "Property store file contains invalid JSON.",
      );
    }

    if (!isMockPropertiesFile(parsed)) {
      throw new PropertyStoreError("Property store file has an invalid shape.");
    }

    return parsed;
  }

  private async writeDatabase(database: MockPropertiesFile): Promise<void> {
    try {
      await fs.writeFile(
        this.filePath,
        JSON.stringify(database, null, 2),
        "utf8",
      );
    } catch (error) {
      throw new PropertyStoreError(
        error instanceof Error
          ? `Unable to write property store: ${error.message}`
          : "Unable to write property store.",
      );
    }
  }
}
