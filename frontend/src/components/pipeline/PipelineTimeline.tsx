import { useEffect, useMemo, useState } from "react";

import { type PipelineStage, type PipelineStageName, type PipelineTask } from "../../types/pipeline";
import { PipelineStageSection } from "./PipelineStageSection";

interface PipelineTimelineProps {
  stages: PipelineStage[];
  tasks: PipelineTask[];
  currentStage: PipelineStageName;
  onTaskSelect: (task: PipelineTask) => void;
  onConfirmTask: (task: PipelineTask) => Promise<void>;
}

function defaultCollapsedStages(
  stages: PipelineStage[],
  currentStage: PipelineStageName,
): Set<string> {
  const collapsed = new Set<string>();
  for (const stage of stages) {
    if (stage.name === currentStage) {
      continue;
    }

    if (stage.status === "completed" || stage.status === "upcoming") {
      collapsed.add(stage.name);
    }
  }
  return collapsed;
}

export function PipelineTimeline({
  stages,
  tasks,
  currentStage,
  onTaskSelect,
  onConfirmTask,
}: PipelineTimelineProps) {
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(
    () => defaultCollapsedStages(stages, currentStage),
  );

  useEffect(() => {
    setCollapsedStages(defaultCollapsedStages(stages, currentStage));
  }, [stages, currentStage]);

  const tasksByStage = useMemo(() => {
    const map = new Map<string, PipelineTask[]>();
    for (const stage of stages) {
      map.set(
        stage.name,
        tasks.filter((task) => task.stage === stage.name),
      );
    }
    return map;
  }, [stages, tasks]);

  return (
    <div className="bh-pipeline-timeline" aria-label="Pipeline timeline">
      {stages.map((stage) => (
        <PipelineStageSection
          key={stage.name}
          stage={stage}
          tasks={tasksByStage.get(stage.name) || []}
          collapsed={collapsedStages.has(stage.name)}
          onToggle={() =>
            setCollapsedStages((prev) => {
              const next = new Set(prev);
              if (next.has(stage.name)) {
                next.delete(stage.name);
              } else {
                next.add(stage.name);
              }
              return next;
            })
          }
          onTaskSelect={onTaskSelect}
          onConfirmTask={onConfirmTask}
        />
      ))}
    </div>
  );
}
