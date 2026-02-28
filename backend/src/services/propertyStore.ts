import { ParsedPurchaseContract } from "../schemas/parsedPurchaseContract.schema";
import { StoredPropertyRecord } from "../types/property";

export interface PropertyStore {
  list(): Promise<StoredPropertyRecord[]>;
  create(parsedContract: ParsedPurchaseContract): Promise<StoredPropertyRecord>;
  findByDocHash(docHash: string): Promise<StoredPropertyRecord | null>;
}

export class DuplicatePropertyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicatePropertyError";
  }
}

export class PropertyStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropertyStoreError";
  }
}
