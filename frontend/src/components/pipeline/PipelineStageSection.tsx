import type { PipelineStage } from "../../types/pipeline";

interface PipelineStageSectionProps {
  stage: PipelineStage;
  clickable?: boolean;
  summaryText?: string | null;
  actionLabel?: string | null;
  actionDisabled?: boolean;
  onActionClick?: () => void;
}

function formatShortDate(value: string | null): string {
  if (!value) {
    return "recently";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function defaultSummaryText(stage: PipelineStage): string {
  if (stage.status === "completed") {
    return `All tasks complete${
      stage.lastCompletedDate
        ? ` · last completed ${formatShortDate(stage.lastCompletedDate)}`
        : ""
    }`;
  }

  if (stage.status === "blocked") {
    return "Blocked";
  }

  if (stage.status === "current") {
    return "Current stage";
  }

  return "Upcoming";
}

export function PipelineStageSection({
  stage,
  clickable = false,
  summaryText = null,
  actionLabel,
  actionDisabled = false,
  onActionClick,
}: PipelineStageSectionProps) {
  const className = `bh-pipeline-stage-section bh-pipeline-stage-section--${stage.status}${clickable ? " is-clickable" : ""}`;
  const resolvedSummary = summaryText || defaultSummaryText(stage);

  const content = (
    <>
      <span
        className={`bh-pipeline-stage-section__marker bh-pipeline-stage-section__marker--${stage.status}`}
        aria-hidden="true"
      >
        <MarkerIcon status={stage.status} />
      </span>

      <div className="bh-pipeline-stage-section__header-row">
        <div className="bh-pipeline-stage-section__header">
          <span className="bh-pipeline-stage-section__header-left">
            <span className="bh-pipeline-stage-section__title">{stage.name}</span>
            <span className="bh-pipeline-stage-section__meta">
              {stage.completedTasks}/{stage.totalTasks} complete
            </span>
          </span>
        </div>

        {actionLabel ? (
          <span
            className={`bh-pipeline-stage-section__action${actionDisabled ? " is-disabled" : ""}`}
          >
            {actionLabel}
          </span>
        ) : null}
      </div>

      <p className="bh-pipeline-stage-section__summary">{resolvedSummary}</p>
    </>
  );

  if (clickable && onActionClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onActionClick}
        disabled={actionDisabled}
        aria-label={`${stage.name}. ${resolvedSummary}.${actionLabel ? ` ${actionLabel}.` : ""}`}
      >
        {content}
      </button>
    );
  }

  return (
    <section className={className} aria-label={`${stage.name} stage`}>
      {content}
    </section>
  );
}

function MarkerIcon({ status }: { status: PipelineStage["status"] }) {
  if (status === "completed") {
    return (
      <svg viewBox="0 0 24 24">
        <path
          d="m7.8 12.3 2.8 2.9 5.6-5.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === "current") {
    return <span className="bh-pipeline-stage-section__marker-dot" />;
  }

  if (status === "blocked") {
    return (
      <svg viewBox="0 0 24 24">
        <path
          d="M12 5.2 19.6 18H4.4L12 5.2Zm0 4.1v4.8m0 2.6h.01"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return null;
}
