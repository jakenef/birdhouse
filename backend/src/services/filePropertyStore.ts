import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import {
  DuplicatePropertyError,
  PropertyStore,
  PropertyStoreError,
} from "./propertyStore";
import { MockPropertiesFile, StoredPropertyRecord } from "../types/property";
import { derivePropertyName } from "../utils/propertyName";

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
    record.parsed_contract !== null
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
        record.parsed_contract.metadata.doc_hash === parsedContract.metadata.doc_hash,
    );

    if (existing) {
      throw new DuplicatePropertyError(
        `Property already exists for doc_hash ${parsedContract.metadata.doc_hash}.`,
      );
    }

    const timestamp = new Date().toISOString();
    const record: StoredPropertyRecord = {
      id: generatePropertyId(),
      property_name: derivePropertyName(parsedContract),
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
      throw new PropertyStoreError("Property store file contains invalid JSON.");
    }

    if (!isMockPropertiesFile(parsed)) {
      throw new PropertyStoreError("Property store file has an invalid shape.");
    }

    return parsed;
  }

  private async writeDatabase(database: MockPropertiesFile): Promise<void> {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(database, null, 2), "utf8");
    } catch (error) {
      throw new PropertyStoreError(
        error instanceof Error
          ? `Unable to write property store: ${error.message}`
          : "Unable to write property store.",
      );
    }
  }
}
