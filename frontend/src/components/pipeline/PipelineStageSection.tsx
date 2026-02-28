import { PipelineTaskRow } from "./PipelineTaskRow";
import type { PipelineStage, PipelineTask } from "../../types/pipeline";

interface PipelineStageSectionProps {
  stage: PipelineStage;
  tasks: PipelineTask[];
  collapsed: boolean;
  onToggle: () => void;
  onTaskSelect: (task: PipelineTask) => void;
  onConfirmTask: (task: PipelineTask) => Promise<void>;
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

export function PipelineStageSection({
  stage,
  tasks,
  collapsed,
  onToggle,
  onTaskSelect,
  onConfirmTask,
}: PipelineStageSectionProps) {
  return (
    <section
      className={`bh-pipeline-stage-section bh-pipeline-stage-section--${stage.status}${collapsed ? " is-collapsed" : ""}`}
      aria-label={`${stage.name} stage`}
    >
      <span
        className={`bh-pipeline-stage-section__marker bh-pipeline-stage-section__marker--${stage.status}`}
        aria-hidden="true"
      >
        <MarkerIcon status={stage.status} />
      </span>

      <button
        type="button"
        className="bh-pipeline-stage-section__header"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className="bh-pipeline-stage-section__header-left">
          <span className="bh-pipeline-stage-section__title">{stage.name}</span>
          <span className="bh-pipeline-stage-section__meta">
            {stage.completedTasks}/{stage.totalTasks} complete
          </span>
        </span>
        <span className="bh-pipeline-stage-section__toggle" aria-hidden="true">
          <ToggleChevron collapsed={collapsed} />
        </span>
      </button>

      {collapsed ? (
        <p className="bh-pipeline-stage-section__summary">
          {stage.status === "completed"
            ? `All tasks complete${
                stage.lastCompletedDate
                  ? ` · last completed ${formatShortDate(stage.lastCompletedDate)}`
                  : ""
              }`
            : "Tap to view tasks"}
        </p>
      ) : (
        <ul className="bh-pipeline-stage-section__tasks">
          {tasks.map((task) => (
            <PipelineTaskRow
              key={task.id}
              task={task}
              onSelect={onTaskSelect}
              onConfirm={onConfirmTask}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ToggleChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
    >
      <path
        d="m6.7 9.5 5.3 5.4 5.3-5.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
