import { type PipelineStage, type PipelineStageName } from "../../types/pipeline";
import { PipelineStageSection } from "./PipelineStageSection";

interface PipelineTimelineProps {
  stages: PipelineStage[];
  currentStage: PipelineStageName;
  getStageAction?: (
    stage: PipelineStage,
  ) => {
    label?: string | null;
    onClick?: () => void;
    disabled?: boolean;
    summaryText?: string | null;
    clickable?: boolean;
  } | null;
}

export function PipelineTimeline({
  stages,
  getStageAction,
}: PipelineTimelineProps) {
  return (
    <div className="bh-pipeline-timeline" aria-label="Pipeline timeline">
      {stages.map((stage) => (
        (() => {
          const action = getStageAction?.(stage) || null;

          return (
            <PipelineStageSection
              key={stage.name}
              stage={stage}
              actionLabel={action?.label || null}
              onActionClick={action?.onClick}
              actionDisabled={action?.disabled}
              summaryText={action?.summaryText || null}
              clickable={action?.clickable || false}
            />
          );
        })()
      ))}
    </div>
  );
}
