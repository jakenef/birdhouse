export type Contact = {
  type: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  updated_at: string;
};

export class ContactStore {
  private readonly contacts = new Map<string, Contact>();

  set(contact: Contact): Contact {
    this.contacts.set(contact.type, contact);
    return contact;
  }

  getByType(type: string): Contact | null {
    return this.contacts.get(type) || null;
  }

  list(): Contact[] {
    return Array.from(this.contacts.values());
  }
}
