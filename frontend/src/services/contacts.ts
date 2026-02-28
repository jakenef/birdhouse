import type { Contact, ContactInput } from "../types/contact";

const CONTACTS_DELETED_STORAGE_KEY = "settings_contacts_deleted_ids";
const CONTACTS_CACHE_STORAGE_KEY = "settings_contacts_cache_v1";
const ESCROW_CONTACT_TYPE = "escrow_officer";

type ApiContact = {
  type: string;
  name: string;
  email: string;
  updated_at?: string;
};

type ApiListContactsResponse = {
  contacts: ApiContact[];
};

type ApiContactResponse = {
  contact: ApiContact;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiContact(value: unknown): value is ApiContact {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    (value.updated_at === undefined || typeof value.updated_at === "string")
  );
}

function isApiListContactsResponse(
  value: unknown,
): value is ApiListContactsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.contacts) &&
    value.contacts.every((contact) => isApiContact(contact))
  );
}

function isApiContactResponse(value: unknown): value is ApiContactResponse {
  return isRecord(value) && isApiContact(value.contact);
}

function normalizeContact(contact: ApiContact): Contact {
  return {
    id: contact.type,
    name: contact.name,
    email: contact.email,
    updatedAt: contact.updated_at ?? new Date().toISOString(),
  };
}

function readCachedContacts(): Contact[] {
  try {
    const raw = window.localStorage.getItem(CONTACTS_CACHE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (value): value is Contact =>
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.email === "string" &&
        typeof value.updatedAt === "string",
    );
  } catch {
    return [];
  }
}

function writeCachedContacts(contacts: Contact[]): void {
  try {
    window.localStorage.setItem(
      CONTACTS_CACHE_STORAGE_KEY,
      JSON.stringify(contacts),
    );
  } catch {
    // no-op: cache is best-effort only
  }
}

function mergeAndPersistContact(contact: Contact): Contact {
  const current = readCachedContacts();
  const next = [...current.filter((item) => item.id !== contact.id), contact];
  next.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  writeCachedContacts(next);
  return contact;
}

function removeCachedContact(id: string): void {
  const current = readCachedContacts();
  writeCachedContacts(current.filter((item) => item.id !== id));
}

function sortContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function toErrorMessage(status: number, payload: unknown, fallback: string): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return `${fallback} (${status}).`;
}

function readDeletedContactIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CONTACTS_DELETED_STORAGE_KEY);
    if (!raw) {
      return new Set<string>();
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set<string>();
  }
}

function writeDeletedContactIds(ids: Set<string>): void {
  window.localStorage.setItem(
    CONTACTS_DELETED_STORAGE_KEY,
    JSON.stringify(Array.from(ids)),
  );
}

function clearDeletedId(id: string): void {
  const ids = readDeletedContactIds();
  if (!ids.has(id)) {
    return;
  }
  ids.delete(id);
  writeDeletedContactIds(ids);
}

export async function getContacts(): Promise<Contact[]> {
  const deletedIds = readDeletedContactIds();

  try {
    const response = await fetch("/api/contacts");
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(toErrorMessage(response.status, payload, "Failed to fetch contacts"));
    }

    if (!isApiListContactsResponse(payload)) {
      throw new Error("Invalid contacts response payload.");
    }

    const contacts = payload.contacts.map((contact) => normalizeContact(contact));
    writeCachedContacts(contacts);

    return sortContacts(contacts.filter((contact) => !deletedIds.has(contact.id)));
  } catch (error) {
    if (error instanceof TypeError) {
      const cached = readCachedContacts().filter((contact) => !deletedIds.has(contact.id));
      if (cached.length > 0) {
        return sortContacts(cached);
      }

      throw new Error(
        "Unable to reach contacts API. Start backend on http://localhost:3001 and retry.",
      );
    }

    throw error;
  }
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const type = ESCROW_CONTACT_TYPE;

  try {
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        name: input.name.trim(),
        email: input.email.trim(),
      }),
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(toErrorMessage(response.status, payload, "Failed to create contact"));
    }

    if (!isApiContactResponse(payload)) {
      throw new Error("Invalid create contact response.");
    }

    clearDeletedId(payload.contact.type);
    return mergeAndPersistContact(normalizeContact(payload.contact));
  } catch (error) {
    if (error instanceof TypeError) {
      const localContact = mergeAndPersistContact({
        id: type,
        name: input.name.trim(),
        email: input.email.trim(),
        updatedAt: new Date().toISOString(),
      });
      clearDeletedId(localContact.id);
      return localContact;
    }

    throw error;
  }
}

export async function updateContact(
  _id: string,
  input: ContactInput,
): Promise<Contact> {
  try {
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: ESCROW_CONTACT_TYPE,
        name: input.name.trim(),
        email: input.email.trim(),
      }),
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(toErrorMessage(response.status, payload, "Failed to update contact"));
    }

    if (!isApiContactResponse(payload)) {
      throw new Error("Invalid update contact response.");
    }

    clearDeletedId(payload.contact.type);
    return mergeAndPersistContact(normalizeContact(payload.contact));
  } catch (error) {
    if (error instanceof TypeError) {
      const localContact = mergeAndPersistContact({
        id: ESCROW_CONTACT_TYPE,
        name: input.name.trim(),
        email: input.email.trim(),
        updatedAt: new Date().toISOString(),
      });
      clearDeletedId(localContact.id);
      return localContact;
    }

    throw error;
  }
}

export async function deleteContact(
  id: string,
): Promise<{ localOnly: boolean; message: string }> {
  removeCachedContact(id);
  const deletedIds = readDeletedContactIds();
  deletedIds.add(id);
  writeDeletedContactIds(deletedIds);

  return {
    localOnly: true,
    message: "Mock: deleted locally",
  };
}
