import { useEffect, useState, type FormEvent } from "react";

import type { ContactInput } from "../../types/contact";

interface ContactFormModalProps {
  open: boolean;
  mode: "add" | "edit";
  initialValue?: ContactInput;
  saving: boolean;
  onClose: () => void;
  onSave: (value: ContactInput) => Promise<void>;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ContactFormModal({
  open,
  mode,
  initialValue,
  saving,
  onClose,
  onSave,
}: ContactFormModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initialValue?.name || "");
    setEmail(initialValue?.email || "");
    setErrorMessage(null);
  }, [open, initialValue]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (name.trim().length === 0) {
      setErrorMessage("Name is required.");
      return;
    }

    if (email.trim().length === 0) {
      setErrorMessage("Email is required.");
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    try {
      await onSave({ name: name.trim(), email: email.trim() });
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save contact.",
      );
    }
  };

  return (
    <div className="bh-contact-modal-backdrop" onClick={onClose}>
      <section
        className="bh-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "add" ? "Add contact" : "Edit contact"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bh-contact-modal__header">
          <h2>{mode === "add" ? "Add contact" : "Edit contact"}</h2>
          <button type="button" onClick={onClose} disabled={saving}>
            Close
          </button>
        </header>

        <form className="bh-contact-modal__form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sarah Chen"
              autoComplete="name"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="sarah@titleco.com"
              autoComplete="email"
            />
          </label>

          {errorMessage ? (
            <p className="bh-contact-modal__error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="bh-contact-modal__actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
