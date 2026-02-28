import { Pencil, Trash2 } from "lucide-react";

import type { Contact } from "../../types/contact";

interface ContactRowProps {
  contact: Contact;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}

function formatContactType(type: string): string {
  const normalized = type.trim().replace(/[_-]+/g, " ");
  if (!normalized) {
    return "Contact";
  }

  return normalized
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ContactRow({ contact, onEdit, onDelete }: ContactRowProps) {
  return (
    <li className="bh-contact-row">
      <div className="bh-contact-row__details">
        <p className="bh-contact-row__name-line">
          <span className="bh-contact-row__name">{contact.name}</span>
          <span className="bh-contact-row__type" aria-label="Contact type">
            {formatContactType(contact.id)}
          </span>
        </p>
        <p className="bh-contact-row__email">{contact.email}</p>
      </div>

      <div className="bh-contact-row__actions">
        <button
          type="button"
          className="bh-contact-row__icon-btn"
          aria-label={`Edit ${contact.name}`}
          onClick={() => onEdit(contact)}
        >
          <Pencil size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="bh-contact-row__icon-btn bh-contact-row__icon-btn--danger"
          aria-label={`Delete ${contact.name}`}
          onClick={() => onDelete(contact)}
        >
          <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
