import type { PipelineStage } from "../../types/pipeline";

interface PipelineStageTrackerProps {
  stages: PipelineStage[];
}

export function PipelineStageTracker({ stages }: PipelineStageTrackerProps) {
  return (
    <section className="bh-pipeline-tracker" aria-label="Pipeline stage tracker">
      <ol>
        {stages.map((stage) => (
          <li key={stage.name} className={`bh-pipeline-tracker__item bh-pipeline-tracker__item--${stage.status}`}>
            <span className="bh-pipeline-tracker__dot" aria-hidden="true" />
            <span className="bh-pipeline-tracker__name">{stage.name}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
