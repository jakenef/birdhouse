import { Router, Request, Response } from "express";

// -------------------------------------------------------------------------
// In-memory contact storage
// TODO: Move to database when user authentication is implemented
// -------------------------------------------------------------------------
interface Contact {
  type: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  updated_at: string;
}

const contacts = new Map<string, Contact>();

export function createContactsRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /contacts
  //
  // Sets a contact for the user. Supports any contact type:
  //   - escrow_officer: The person to email for earnest money matters
  //   - title_company: Title company contact
  //   - real_estate_agent: Your real estate agent
  //   - etc.
  //
  // Request body:
  //   {
  //     type: string;              // Contact type (required, e.g., "escrow_officer")
  //     name: string;              // Full name (required)
  //     email: string;             // Email address (required)
  //     phone?: string;            // Phone number (optional)
  //     company?: string;          // Company name (optional)
  //   }
  //
  // Response:
  //   { contact: Contact }
  // -------------------------------------------------------------------------
  router.post("/contacts", async (req: Request, res: Response) => {
    try {
      const { type, name, email, phone, company } = req.body;

      // Validate required fields
      if (!type || typeof type !== "string" || type.trim() === "") {
        res.status(400).json({
          error: {
            message: "Missing or invalid 'type' field.",
          },
        });
        return;
      }

      if (!name || typeof name !== "string" || name.trim() === "") {
        res.status(400).json({
          error: { message: "Missing or invalid 'name' field." },
        });
        return;
      }

      if (!email || typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({
          error: { message: "Missing or invalid 'email' field." },
        });
        return;
      }

      const contact: Contact = {
        type: type.trim(),
        name: name.trim(),
        email: email.trim(),
        phone: phone ? phone.trim() : undefined,
        company: company ? company.trim() : undefined,
        updated_at: new Date().toISOString(),
      };

      contacts.set(type.trim(), contact);

      res.status(200).json({ contact });
    } catch (error) {
      res.status(500).json({
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected server error",
        },
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /contacts
  //
  // Returns all configured contacts.
  //
  // Response:
  //   { contacts: Array<Contact> }
  // -------------------------------------------------------------------------
  router.get("/contacts", async (req: Request, res: Response) => {
    try {
      const allContacts = Array.from(contacts.values());
      res.json({ contacts: allContacts });
    } catch (error) {
      res.status(500).json({
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected server error",
        },
      });
    }
  });

  return router;
}
