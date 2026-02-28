import { useState } from "react";

import { getTaskDueState } from "../../utils/pipelineDerived";
import type { PipelineTask } from "../../types/pipeline";

interface PipelineTaskRowProps {
  task: PipelineTask;
  onSelect: (task: PipelineTask) => void;
  onConfirm: (task: PipelineTask) => Promise<void>;
}

function formatDateLabel(task: PipelineTask): string {
  if (task.status === "done" && task.completedDate) {
    return `Done ${formatShortDate(task.completedDate)}`;
  }

  if (task.dueDate) {
    return `Due ${formatShortDate(task.dueDate)}`;
  }

  return "";
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function PipelineTaskRow({
  task,
  onSelect,
  onConfirm,
}: PipelineTaskRowProps) {
  const [confirming, setConfirming] = useState(false);
  const dateLabel = formatDateLabel(task);
  const dueState = getTaskDueState(task.dueDate, task.status);

  return (
    <li>
      <button
        type="button"
        className={`bh-pipeline-task-row bh-pipeline-task-row--${task.status}`}
        onClick={() => onSelect(task)}
        aria-label={`${task.title}${dateLabel ? `. ${dateLabel}` : ""}`}
      >
        <span className="bh-pipeline-task-row__icon" aria-hidden="true">
          <StatusIcon status={task.status} />
        </span>

        <span className="bh-pipeline-task-row__content">
          <span className="bh-pipeline-task-row__title">
            {task.title}
          </span>

          {task.status === "suggested_done" ? (
            <span className="bh-pipeline-task-row__actions">
              <button
                type="button"
                className="bh-pipeline-task-row__confirm"
                onClick={async (event) => {
                  event.stopPropagation();
                  setConfirming(true);
                  try {
                    await onConfirm(task);
                  } finally {
                    setConfirming(false);
                  }
                }}
                disabled={confirming}
              >
                {confirming ? "Confirming..." : "Confirm"}
              </button>
            </span>
          ) : null}
        </span>

        {dateLabel ? (
          <span className={`bh-pipeline-task-row__date bh-pipeline-task-row__date--${dueState}`}>
            {dateLabel}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function StatusIcon({ status }: { status: PipelineTask["status"] }) {
  if (status === "done") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="m8.4 12.3 2.5 2.6 4.8-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === "blocked") {
    return (
      <svg viewBox="0 0 24 24">
        <path
          d="M12 4.5 20 19.2H4L12 4.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 9.2v4.9m0 2.8h.01"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (status === "suggested_done") {
    return (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="m9.5 12.3 2.1 2.1 3.7-3.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
