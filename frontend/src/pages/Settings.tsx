import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { ContactFormModal } from "../components/contacts/ContactFormModal";
import { ContactList } from "../components/contacts/ContactList";
import {
  createContact,
  deleteContact,
  getContacts,
  updateContact,
} from "../services/contacts";
import type { Contact, ContactInput } from "../types/contact";

type ContactModalState =
  | { open: false }
  | { open: true; mode: "add" }
  | { open: true; mode: "edit"; contact: Contact };

export function Settings() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [modal, setModal] = useState<ContactModalState>({ open: false });
  const [saving, setSaving] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await getContacts();
      setContacts(response);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load contacts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2200);
  };

  const handleSave = async (value: ContactInput) => {
    setSaving(true);
    try {
      if (modal.open && modal.mode === "edit") {
        const updated = await updateContact(modal.contact.id, value);
        setContacts((current) =>
          [updated, ...current.filter(
            (contact) =>
              contact.id !== modal.contact.id && contact.id !== updated.id,
          )].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
        showToast("Contact updated");
      } else {
        const created = await createContact(value);
        setContacts((current) =>
          [created, ...current].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
        showToast("Contact added");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    const confirmed = window.confirm(`Delete ${contact.name}?`);
    if (!confirmed) {
      return;
    }

    const response = await deleteContact(contact.id);
    setContacts((current) =>
      current.filter((candidate) => candidate.id !== contact.id),
    );
    showToast(response.localOnly ? response.message : "Contact deleted");
  };

  return (
    <section className="settings-page" aria-label="Settings page">
      <header className="settings-page__header">
        <h1>Settings</h1>
        <p>
          Manage contacts the agent will email (escrow, lender, inspector,
          etc.).
        </p>
      </header>

      <section className="bh-settings-contacts-card" aria-label="Contacts">
        <header className="bh-settings-contacts-card__header">
          <div>
            <h2>Contacts</h2>
            <p>Name and email only.</p>
          </div>
          <button
            type="button"
            className="bh-settings-add-contact-btn"
            onClick={() => setModal({ open: true, mode: "add" })}
          >
            <Plus size={15} strokeWidth={2.3} aria-hidden="true" />
            Add contact
          </button>
        </header>

        {toastMessage ? <p className="bh-settings-toast">{toastMessage}</p> : null}

        {loading ? (
          <div className="state-card state-card--loading" role="status" aria-live="polite">
            Loading contacts...
          </div>
        ) : errorMessage ? (
          <div className="state-card" role="alert">
            <h2>Unable to load contacts</h2>
            <p>{errorMessage}</p>
            <button
              type="button"
              className="state-card__action"
              onClick={() => void loadContacts()}
            >
              Retry
            </button>
          </div>
        ) : (
          <ContactList
            contacts={contacts}
            onEdit={(contact) => setModal({ open: true, mode: "edit", contact })}
            onDelete={handleDelete}
          />
        )}
      </section>

      <ContactFormModal
        open={modal.open}
        mode={modal.open ? modal.mode : "add"}
        initialValue={
          modal.open && modal.mode === "edit"
            ? { name: modal.contact.name, email: modal.contact.email }
            : undefined
        }
        saving={saving}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
      />
    </section>
  );
}
