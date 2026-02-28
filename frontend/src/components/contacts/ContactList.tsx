import { ContactRow } from "./ContactRow";
import type { Contact } from "../../types/contact";

interface ContactListProps {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}

export function ContactList({ contacts, onEdit, onDelete }: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <div className="state-card" role="status" aria-live="polite">
        <h2>No contacts yet</h2>
        <p>Add one so the agent can email the right people.</p>
      </div>
    );
  }

  return (
    <div className="bh-contacts-list-wrap" aria-label="Contacts list">
      <ul className="bh-contacts-list">
        {contacts.map((contact) => (
          <ContactRow
            key={contact.id}
            contact={contact}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}
