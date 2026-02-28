import { useCallback, useEffect, useState } from "react";

import { confirmPipelineTask, getPropertyPipeline } from "../../services/pipeline";
import type { PipelineTask, PropertyPipelineData } from "../../types/pipeline";
import { PipelineTimeline } from "./PipelineTimeline";

interface PipelinePageProps {
  propertyId: string;
}

export function PipelinePage({ propertyId }: PipelinePageProps) {
  const [data, setData] = useState<PropertyPipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [taskToast, setTaskToast] = useState<string | null>(null);

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await getPropertyPipeline(propertyId);
      setData(response);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the pipeline timeline.",
      );
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  const handleTaskSelect = (task: PipelineTask) => {
    setTaskToast(`Task details for "${task.title}" are coming soon.`);
    window.setTimeout(() => setTaskToast(null), 2400);
  };

  if (loading) {
    return (
      <div className="state-card state-card--loading" role="status" aria-live="polite">
        Loading pipeline timeline...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="state-card" role="alert">
        <h2>Unable to load pipeline</h2>
        <p>{errorMessage}</p>
        <button type="button" className="state-card__action" onClick={() => void loadPipeline()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="state-card">
        <h2>Pipeline unavailable</h2>
        <p>We could not build a timeline for this property yet.</p>
      </div>
    );
  }

  return (
    <section className="bh-pipeline-page" aria-label="Property pipeline timeline">
      {taskToast ? <p className="bh-pipeline-task-toast">{taskToast}</p> : null}

      <PipelineTimeline
        stages={data.stages}
        tasks={data.tasks}
        currentStage={data.currentStage}
        onTaskSelect={handleTaskSelect}
        onConfirmTask={async (task) => {
          const response = await confirmPipelineTask(propertyId, task.id);
          setTaskToast(response.message);
          await loadPipeline();
        }}
      />
    </section>
  );
}
