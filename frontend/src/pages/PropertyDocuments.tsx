import { useEffect, useMemo, useState } from "react";

import { getPropertyDocuments } from "../services/documents";
import type { Document } from "../types/document";

interface PropertyDocumentsProps {
  propertyId: string;
  onBackToHome: () => void;
}

type DocumentCardModel = {
  document: Document;
  aiTitle: string;
  aiSummary: string;
  summaryHighlights: string[];
};

function formatDocumentDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Uploaded date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function buildMockAiContent(
  document: Document,
): Omit<DocumentCardModel, "document"> {
  const normalizedFilename = document.filename.toLowerCase();

  if (normalizedFilename.includes("contract")) {
    return {
      aiTitle: "Purchase Contract and Timeline Terms",
      aiSummary:
        "AI summary (mock): This contract defines buyer and seller obligations, price terms, and the transaction schedule. Focus on settlement deadline, contingency windows, earnest money handling, and any addenda that change default obligations.",
      summaryHighlights: [
        "Confirm closing date and deadline dependencies.",
        "Validate contingency and objection windows.",
        "Check addenda for overrides to standard terms.",
      ],
    };
  }

  if (normalizedFilename.includes("title")) {
    return {
      aiTitle: "Title and Ownership Review Package",
      aiSummary:
        "AI summary (mock): This title document captures current ownership details and exceptions that can impact transfer. Review vesting language, liens or encumbrances, and requirements that must be resolved before closing.",
      summaryHighlights: [
        "Verify owner and vesting details match transaction intent.",
        "Review listed exceptions and unresolved items.",
        "Flag issues requiring title company follow-up.",
      ],
    };
  }

  if (normalizedFilename.includes("inspection")) {
    return {
      aiTitle: "Inspection Findings and Risk Snapshot",
      aiSummary:
        "AI summary (mock): This report outlines observed property condition findings and their severity. Prioritize structural, safety, and systems defects, then map repair credits or remediation obligations into negotiation and timeline planning.",
      summaryHighlights: [
        "Identify high-risk health/safety findings first.",
        "Track repair requests and owner responses.",
        "Align repair outcomes with closing timelines.",
      ],
    };
  }

  if (normalizedFilename.includes("disclosure")) {
    return {
      aiTitle: "Seller Disclosures and Material Notices",
      aiSummary:
        "AI summary (mock): This disclosure package summarizes known property conditions and prior events relevant to buyer risk. Validate that all required disclosures are present and reconcile any conflicts with inspection or title records.",
      summaryHighlights: [
        "Check for missing mandatory disclosures.",
        "Cross-reference disclosures against inspection and title.",
        "Document items that require legal or agent review.",
      ],
    };
  }

  return {
    aiTitle: "Transaction Document Review Brief",
    aiSummary:
      "AI summary (mock): This file is part of the property transaction record. Review deadlines, obligations, and exceptions to determine what must be completed next and which stakeholders need action.",
    summaryHighlights: [
      "Extract key dates and responsible parties.",
      "Identify unresolved obligations before close.",
      "Capture action items for lender/title/agent coordination.",
    ],
  };
}

function toCardModel(document: Document): DocumentCardModel {
  // Use real AI summary if available, otherwise fall back to mock
  if (document.ai_summary) {
    return {
      document,
      aiTitle: document.ai_summary.title,
      aiSummary: document.ai_summary.summary,
      summaryHighlights: document.ai_summary.highlights,
    };
  }

  return {
    document,
    ...buildMockAiContent(document),
  };
}

function fileTypeBadge(document: Document): string {
  if (document.mime_type.includes("pdf")) {
    return "PDF";
  }

  const parts = document.filename.split(".");
  if (parts.length > 1) {
    return parts[parts.length - 1].toUpperCase();
  }

  return "DOC";
}

function isPdfDocument(document: Document): boolean {
  return document.mime_type.toLowerCase().includes("pdf");
}

export function PropertyDocuments({
  propertyId,
  onBackToHome,
}: PropertyDocumentsProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [viewerDocumentId, setViewerDocumentId] = useState<string | null>(null);
  const [demoDocuments, setDemoDocuments] = useState<Document[]>([]);
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);

  useEffect(() => {
    const loadDocuments = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await getPropertyDocuments(propertyId);
        setDocuments(response.property.documents);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load property documents.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadDocuments();
  }, [propertyId]);

  const cards = useMemo(
    () =>
      [...demoDocuments, ...documents].map((document) => toCardModel(document)),
    [documents, demoDocuments],
  );

  const fillDemoDocuments = () => {
    const mockDocs: Document[] = [
      {
        id: "demo-doc-1",
        filename: "Purchase_Contract.pdf",
        mime_type: "application/pdf",
        size_bytes: 245800,
        source: "email_intake",
        created_at: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        download_url: null,
        ai_summary: {
          title: "Purchase Contract and Timeline Terms",
          summary:
            "This contract defines buyer and seller obligations, purchase price of $485,000, and critical deadlines. Settlement date is March 14, 2026 with inspection objection deadline of February 25.",
          highlights: [
            "Purchase price: $485,000 with $10,000 earnest money",
            "Settlement deadline: March 14, 2026",
            "Inspection objection deadline: February 25, 2026",
            "Loan contingency expires March 1, 2026",
          ],
        },
      },
      {
        id: "demo-doc-2",
        filename: "Home_Inspection_Report.pdf",
        mime_type: "application/pdf",
        size_bytes: 1842600,
        source: "email_intake",
        created_at: new Date(
          Date.now() - 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        download_url: null,
        ai_summary: {
          title: "Inspection Findings and Risk Snapshot",
          summary:
            "Overall property is in good condition with minor maintenance items. HVAC system is 8 years old and functioning properly. Roof has 5-7 years remaining life.",
          highlights: [
            "No major structural issues found",
            "HVAC system functional, 8 years old",
            "Roof needs monitoring, 5-7 years remaining",
            "Minor electrical updates recommended",
            "Water heater is 4 years old, well maintained",
          ],
        },
      },
      {
        id: "demo-doc-3",
        filename: "Preliminary_Title_Report.pdf",
        mime_type: "application/pdf",
        size_bytes: 892400,
        source: "email_intake",
        created_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        download_url: null,
        ai_summary: {
          title: "Title and Ownership Review Package",
          summary:
            "Title search came back clean with standard exceptions. No liens or encumbrances affecting transfer. Property ownership is clear with no disputes.",
          highlights: [
            "No outstanding liens or judgments",
            "Ownership vests with current seller only",
            "Standard title exceptions apply",
            "Easements are typical for subdivision",
          ],
        },
      },
    ];
    setDemoDocuments(mockDocs);
  };

  const activeCard = useMemo(
    () => cards.find((card) => card.document.id === activeDocumentId) ?? null,
    [cards, activeDocumentId],
  );

  const viewerCard = useMemo(
    () => cards.find((card) => card.document.id === viewerDocumentId) ?? null,
    [cards, viewerDocumentId],
  );

  const closeSummary = () => {
    setActiveDocumentId(null);
  };

  const closeViewer = () => {
    setViewerDocumentId(null);
  };

  const openViewer = () => {
    if (!activeCard?.document.download_url) {
      return;
    }

    setViewerDocumentId(activeCard.document.id);
    setActiveDocumentId(null);
  };

  useEffect(() => {
    if (!activeDocumentId && !viewerDocumentId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (viewerDocumentId) {
        closeViewer();
        return;
      }

      closeSummary();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeDocumentId, viewerDocumentId]);

  return (
    <section className="property-page" aria-label="Property documents page">
      <button type="button" className="back-link" onClick={onBackToHome}>
        <ChevronLeftIcon />
        Back to home
      </button>

      <div className="demo-controls">
        <button
          type="button"
          className="demo-controls__toggle"
          onClick={() => setDemoControlsOpen(!demoControlsOpen)}
          aria-expanded={demoControlsOpen}
        >
          {demoControlsOpen ? "▼" : "▶"} Demo Controls
        </button>
        {demoControlsOpen && (
          <div className="demo-controls__content">
            <button
              type="button"
              className="demo-controls__button"
              onClick={fillDemoDocuments}
              disabled={demoDocuments.length > 0}
            >
              Fill Documents
            </button>
            {demoDocuments.length > 0 && (
              <button
                type="button"
                className="demo-controls__button demo-controls__button--secondary"
                onClick={() => setDemoDocuments([])}
              >
                Clear Demo
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div
          className="state-card state-card--loading"
          role="status"
          aria-live="polite"
        >
          Loading documents...
        </div>
      ) : errorMessage ? (
        <div className="state-card" role="alert">
          <h2>Unable to load documents</h2>
          <p>{errorMessage}</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="state-card" role="status" aria-live="polite">
          <h2>No documents yet</h2>
          <p>
            Documents for this property will appear here as they are attached.
          </p>
        </div>
      ) : (
        <div className="documents-list-wrap" aria-label="Documents list">
          <ul className="documents-cards">
            {cards.map((card) => (
              <li key={card.document.id}>
                <button
                  type="button"
                  className="document-card document-card--button"
                  onClick={() => {
                    setActiveDocumentId(card.document.id);
                  }}
                >
                  <div className="document-card__preview" aria-hidden="true">
                    <div className="document-card__ai-badge">
                      <AiSparkleIcon />
                    </div>
                    {card.document.download_url &&
                    isPdfDocument(card.document) ? (
                      <iframe
                        src={`${card.document.download_url}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`}
                        title=""
                        tabIndex={-1}
                      />
                    ) : (
                      <div className="document-card__fallback">
                        <span>{fileTypeBadge(card.document)}</span>
                      </div>
                    )}
                  </div>
                  <div className="document-card__body">
                    <h2 className="document-card__ai-title">{card.aiTitle}</h2>
                    <p className="document-card__file-title">
                      {card.document.filename}
                    </p>
                    <p className="document-card__date">
                      Uploaded {formatDocumentDate(card.document.created_at)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeCard && (
        <div className="document-sheet-backdrop" onClick={closeSummary}>
          <section
            className="document-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Document AI summary"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="document-sheet__handle" aria-hidden="true" />
            <h2>{activeCard.aiTitle}</h2>
            <p className="document-sheet__file-title">
              {activeCard.document.filename}
            </p>
            <p className="document-sheet__date">
              Uploaded {formatDocumentDate(activeCard.document.created_at)}
            </p>

            <div className="document-sheet__summary">
              <p>{activeCard.aiSummary}</p>
              <ul>
                {activeCard.summaryHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="document-sheet__actions">
              <button
                type="button"
                className="document-sheet__button document-sheet__button--primary"
                onClick={openViewer}
                disabled={!activeCard.document.download_url}
              >
                View full document
              </button>
              <button
                type="button"
                className="document-sheet__button document-sheet__button--ghost"
                onClick={closeSummary}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {viewerCard && (
        <div className="document-viewer-backdrop" onClick={closeViewer}>
          <section
            className="document-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Document viewer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="document-viewer__header">
              <div className="document-viewer__meta">
                <h2>{viewerCard.aiTitle}</h2>
                <p>{viewerCard.document.filename}</p>
              </div>
              <button
                type="button"
                className="document-viewer__close"
                onClick={closeViewer}
              >
                Close
              </button>
            </header>

            <div className="document-viewer__content">
              {viewerCard.document.download_url &&
              isPdfDocument(viewerCard.document) ? (
                <iframe
                  src={`${viewerCard.document.download_url}#toolbar=1&navpanes=0&view=FitH`}
                  title={viewerCard.document.filename}
                />
              ) : (
                <div className="document-viewer__fallback">
                  <p>This file type cannot be previewed inline yet.</p>
                  {viewerCard.document.download_url ? (
                    <a
                      href={viewerCard.document.download_url}
                      download={viewerCard.document.filename}
                    >
                      Download file
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.72 5.22a1 1 0 0 1 .06 1.41L9.42 12l5.36 5.37a1 1 0 0 1-1.41 1.41l-6.07-6.07a1 1 0 0 1 0-1.42l6.07-6.07a1 1 0 0 1 1.35 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AiSparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.6 13.6 8l4.4 1.6-4.4 1.6L12 15.6l-1.6-4.4L6 9.6 10.4 8 12 3.6Z"
        fill="currentColor"
      />
      <path
        d="M18.3 13.5 19 15.4l1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9Zm-10.8 1.8.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z"
        fill="currentColor"
        opacity="0.86"
      />
    </svg>
  );
}
