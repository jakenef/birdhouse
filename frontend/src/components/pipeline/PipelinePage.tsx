import { useCallback, useEffect, useMemo, useState } from "react";

import {
  confirmEarnestComplete,
  getEarnestStep,
  getPropertyPipeline,
  prepareEarnestStep,
  sendEarnestDraft,
} from "../../services/pipeline";
import { CONTACTS_UPDATED_EVENT } from "../../services/contacts";
import type {
  EarnestPendingUserAction,
  EarnestStepData,
  PipelineStage,
  PropertyPipelineData,
} from "../../types/pipeline";
import {
  computeCurrentStageId,
  computeStageCompletion,
  stageIsFuture,
} from "../../utils/pipelineDerived";
import { EarnestActionModal } from "./EarnestActionModal";
import { PipelineTimeline } from "./PipelineTimeline";

interface PipelinePageProps {
  propertyId: string;
}

function shouldReconcileEarnest(earnest: EarnestStepData): boolean {
  if (earnest.stepStatus === "locked") {
    return true;
  }

  return (
    earnest.stepStatus === "action_needed" &&
    earnest.pendingUserAction === "send_earnest_email" &&
    (!earnest.draft.subject || !earnest.draft.body)
  );
}

export function PipelinePage({ propertyId }: PipelinePageProps) {
  const [data, setData] = useState<PropertyPipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [earnest, setEarnest] = useState<EarnestStepData | null>(null);
  const [earnestLoading, setEarnestLoading] = useState(true);
  const [earnestError, setEarnestError] = useState<string | null>(null);
  const [earnestModalOpen, setEarnestModalOpen] = useState(false);
  const [earnestSubmitting, setEarnestSubmitting] = useState(false);
  const [earnestSubmitError, setEarnestSubmitError] = useState<string | null>(
    null,
  );
  const [demoModeActive, setDemoModeActive] = useState(false);
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);

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

  const loadEarnest = useCallback(async () => {
    setEarnestLoading(true);
    setEarnestError(null);

    try {
      const response = await getEarnestStep(propertyId);
      if (shouldReconcileEarnest(response)) {
        const refreshed = await prepareEarnestStep(propertyId);
        setEarnest(refreshed);
      } else {
        setEarnest(response);
      }
    } catch (error) {
      setEarnestError(
        error instanceof Error
          ? error.message
          : "Unable to load the Earnest step.",
      );
      setEarnest(null);
    } finally {
      setEarnestLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void loadPipeline();
    void loadEarnest();
  }, [loadEarnest, loadPipeline]);

  useEffect(() => {
    const onContactsUpdated = (event: Event) => {
      const detail =
        event instanceof CustomEvent && typeof event.detail?.type === "string"
          ? event.detail.type
          : null;

      if (detail !== "escrow_officer") {
        return;
      }

      void loadEarnest();
    };

    window.addEventListener(CONTACTS_UPDATED_EVENT, onContactsUpdated);
    return () =>
      window.removeEventListener(CONTACTS_UPDATED_EVENT, onContactsUpdated);
  }, [loadEarnest]);

  const isEarnestActionable =
    earnest?.stepStatus === "action_needed" &&
    earnest.pendingUserAction !== "none";

  const openEarnestAction = useCallback(async () => {
    setEarnestSubmitError(null);

    if (
      earnest?.pendingUserAction === "send_earnest_email" &&
      (!earnest.draft.subject || !earnest.draft.body)
    ) {
      setEarnestSubmitting(true);
      try {
        const refreshed = await prepareEarnestStep(propertyId);
        setEarnest(refreshed);
      } catch (error) {
        setEarnestSubmitError(
          error instanceof Error
            ? error.message
            : "Unable to prepare the Earnest draft.",
        );
      } finally {
        setEarnestSubmitting(false);
      }
    }

    setEarnestModalOpen(true);
  }, [earnest, propertyId]);

  const decoratedPipeline = useMemo<PropertyPipelineData | null>(() => {
    if (!data) {
      return null;
    }

    // Demo mode: all stages completed except closing which is current
    if (demoModeActive) {
      const demoTasks = data.tasks.map((task) => ({
        ...task,
        status:
          task.stage === "Closing" ? ("pending" as const) : ("done" as const),
        completedDate:
          task.stage === "Closing" ? null : new Date().toISOString(),
      }));

      const demoStages: PipelineStage[] = data.stages.map((stage) => ({
        ...stage,
        status:
          stage.name === "Closing"
            ? ("current" as const)
            : ("completed" as const),
        totalTasks: demoTasks.filter((t) => t.stage === stage.name).length,
        completedTasks:
          stage.name === "Closing"
            ? 0
            : demoTasks.filter((t) => t.stage === stage.name).length,
        lastCompletedDate:
          stage.name === "Closing" ? null : new Date().toISOString(),
      }));

      return {
        ...data,
        tasks: demoTasks,
        stages: demoStages,
        currentStage: "Closing",
      };
    }

    if (!earnest) {
      return data;
    }

    const nextTasks = data.tasks.map((task) => {
      if (task.stage !== "Earnest Money") {
        return task;
      }

      let status = task.status;
      let completedDate = task.completedDate;

      if (earnest.stepStatus === "completed") {
        status = "done";
        completedDate = earnest.sendState.sentAtIso || task.completedDate;
      } else if (earnest.stepStatus === "locked") {
        status = "blocked";
        completedDate = null;
      } else {
        status = "pending";
        completedDate = null;
      }

      return {
        ...task,
        status,
        completedDate,
      };
    });

    const nextCurrentStage = computeCurrentStageId(
      data.stages.map((stage) => stage.name),
      nextTasks,
    );

    const nextStages: PipelineStage[] = data.stages.map((stage) => {
      const completion = computeStageCompletion(stage.name, nextTasks);
      const stageTasks = nextTasks.filter((task) => task.stage === stage.name);
      const hasBlocked = stageTasks.some((task) => task.status === "blocked");

      let status: PipelineStage["status"];
      if (completion.allComplete) {
        status = "completed";
      } else if (stage.name === nextCurrentStage) {
        status = hasBlocked ? "blocked" : "current";
      } else if (
        stageIsFuture(
          data.stages.map((item) => item.name),
          stage.name,
          nextCurrentStage,
        )
      ) {
        status = "upcoming";
      } else {
        status = "completed";
      }

      return {
        ...stage,
        status,
        totalTasks: completion.totalTasks,
        completedTasks: completion.completedTasks,
        lastCompletedDate: completion.lastCompletedDate,
      };
    });

    return {
      ...data,
      tasks: nextTasks,
      stages: nextStages,
      currentStage: nextCurrentStage,
    };
  }, [data, earnest]);

  const earnestActionLabel = useMemo(() => {
    if (!isEarnestActionable || !earnest) {
      return null;
    }

    const labels: Record<Exclude<EarnestPendingUserAction, "none">, string> = {
      send_earnest_email: "Review Draft",
      confirm_earnest_complete: "Mark Complete",
    };

    if (earnest.pendingUserAction === "none") {
      return null;
    }

    return labels[earnest.pendingUserAction];
  }, [earnest, isEarnestActionable]);

  const handleStageSelect = useCallback(
    (stage: PipelineStage) => {
      if (stage.name === "Earnest Money" && isEarnestActionable) {
        void openEarnestAction();
      }
    },
    [isEarnestActionable, openEarnestAction],
  );

  const stageSummaryText = useCallback(
    (stage: PipelineStage): string | null => {
      if (stage.name === "Earnest Money" && earnest) {
        if (isEarnestActionable) {
          return (
            earnest.promptToUser ||
            (earnest.pendingUserAction === "send_earnest_email"
              ? "Review and send the earnest email draft."
              : "Follow escrow instructions and mark Earnest complete.")
          );
        }

        if (earnest.stepStatus === "waiting_for_parties") {
          return "Waiting on escrow officer";
        }

        if (earnest.stepStatus === "locked") {
          return earnest.lockedReason || "Earnest is blocked.";
        }

        if (earnest.stepStatus === "completed") {
          return "Earnest complete.";
        }
      }

      if (stage.status === "completed") {
        return stage.lastCompletedDate
          ? `All tasks complete`
          : "All tasks complete";
      }

      if (stage.status === "blocked") {
        return "Blocked";
      }

      if (stage.status === "current") {
        return "Current stage";
      }

      return "Upcoming";
    },
    [earnest, isEarnestActionable],
  );

  if (loading) {
    return (
      <div
        className="state-card state-card--loading"
        role="status"
        aria-live="polite"
      >
        Loading pipeline timeline...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="state-card" role="alert">
        <h2>Unable to load pipeline</h2>
        <p>{errorMessage}</p>
        <button
          type="button"
          className="state-card__action"
          onClick={() => void loadPipeline()}
        >
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
    <section
      className="bh-pipeline-page"
      aria-label="Property pipeline timeline"
    >
      {earnestError ? (
        <p className="bh-pipeline-task-toast bh-pipeline-task-toast--warning">
          Earnest status is temporarily unavailable. The rest of the timeline is
          still loaded.
        </p>
      ) : null}

      <div className="demo-controls">
        {demoControlsOpen && (
          <div className="demo-controls__content">
            <button
              type="button"
              className="demo-controls__button"
              onClick={() => setDemoModeActive(true)}
              disabled={demoModeActive}
            >
              Skip to Closing
            </button>
            {demoModeActive && (
              <button
                type="button"
                className="demo-controls__button demo-controls__button--secondary"
                onClick={() => setDemoModeActive(false)}
              >
                Reset
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          className="demo-controls__toggle"
          onClick={() => setDemoControlsOpen(!demoControlsOpen)}
          aria-expanded={demoControlsOpen}
          aria-label="Demo controls"
        >
          {demoControlsOpen ? "◀" : "▶"}
        </button>
      </div>

      <PipelineTimeline
        stages={decoratedPipeline?.stages || data.stages}
        currentStage={decoratedPipeline?.currentStage || data.currentStage}
        getStageAction={(stage) => {
          const isEarnestStage = stage.name === "Earnest Money";

          if (isEarnestStage && earnestActionLabel && isEarnestActionable) {
            return {
              label: earnestActionLabel,
              onClick: () => handleStageSelect(stage),
              disabled: earnestLoading || earnestSubmitting,
              summaryText: stageSummaryText(stage),
              clickable: true,
            };
          }

          return {
            summaryText: stageSummaryText(stage),
            clickable: false,
          };
        }}
      />

      <EarnestActionModal
        open={earnestModalOpen}
        earnest={earnest}
        loading={earnestLoading}
        submitting={earnestSubmitting}
        errorMessage={earnestSubmitError}
        onClose={() => {
          if (!earnestSubmitting) {
            setEarnestModalOpen(false);
            setEarnestSubmitError(null);
          }
        }}
        onSendDraft={async (input) => {
          setEarnestSubmitting(true);
          setEarnestSubmitError(null);
          try {
            const response = await sendEarnestDraft(propertyId, input);
            setEarnest(response);
            setEarnestModalOpen(false);
            await loadPipeline();
            await loadEarnest();
          } catch (error) {
            setEarnestSubmitError(
              error instanceof Error
                ? error.message
                : "Unable to send the draft.",
            );
          } finally {
            setEarnestSubmitting(false);
          }
        }}
        onConfirmComplete={async () => {
          setEarnestSubmitting(true);
          setEarnestSubmitError(null);
          try {
            const response = await confirmEarnestComplete(propertyId);
            setEarnest(response);
            setEarnestModalOpen(false);
            await loadPipeline();
            await loadEarnest();
          } catch (error) {
            setEarnestSubmitError(
              error instanceof Error
                ? error.message
                : "Unable to complete Earnest.",
            );
          } finally {
            setEarnestSubmitting(false);
          }
        }}
      />
    </section>
  );
}
