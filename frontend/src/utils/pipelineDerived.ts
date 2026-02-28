import type {
  PipelineStageName,
  PipelineTask,
  PipelineTaskStatus,
} from "../types/pipeline";

export function isTaskDone(status: PipelineTaskStatus): boolean {
  return status === "done";
}

export function isTaskIncomplete(status: PipelineTaskStatus): boolean {
  return status !== "done";
}

export function getTaskDueState(
  dueDate: string | null,
  status: PipelineTaskStatus,
): "overdue" | "due_soon" | "normal" | "none" {
  if (!dueDate || !isTaskIncomplete(status)) {
    return "none";
  }

  const target = new Date(dueDate);
  if (Number.isNaN(target.getTime())) {
    return "none";
  }

  const now = new Date();
  const nowDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const dueDay = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    0,
    0,
    0,
    0,
  );
  const dayDiff = Math.round((dueDay.getTime() - nowDay.getTime()) / 86400000);

  if (dayDiff < 0) {
    return "overdue";
  }

  if (dayDiff <= 3) {
    return "due_soon";
  }

  return "normal";
}

export function computeCurrentStageId(
  stageOrder: readonly PipelineStageName[],
  tasks: PipelineTask[],
): PipelineStageName {
  for (const stage of stageOrder) {
    const stageTasks = tasks.filter((task) => task.stage === stage);
    if (stageTasks.length === 0) {
      continue;
    }

    const hasIncomplete = stageTasks.some((task) =>
      isTaskIncomplete(task.status),
    );
    if (hasIncomplete) {
      return stage;
    }
  }

  return stageOrder[stageOrder.length - 1];
}

export function computeStageCompletion(
  stage: PipelineStageName,
  tasks: PipelineTask[],
): {
  totalTasks: number;
  completedTasks: number;
  allComplete: boolean;
  lastCompletedDate: string | null;
} {
  const stageTasks = tasks.filter((task) => task.stage === stage);
  const completed = stageTasks.filter((task) => isTaskDone(task.status));
  const completedDates = completed
    .map((task) => task.completedDate)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return {
    totalTasks: stageTasks.length,
    completedTasks: completed.length,
    allComplete: stageTasks.length > 0 && completed.length === stageTasks.length,
    lastCompletedDate: completedDates[0] || null,
  };
}

export function computeNextTaskId(
  tasks: PipelineTask[],
  currentStage: PipelineStageName,
): string | null {
  const currentStageTasks = tasks.filter((task) => task.stage === currentStage);
  const incomplete = currentStageTasks.filter((task) =>
    isTaskIncomplete(task.status),
  );

  if (incomplete.length === 0) {
    return null;
  }

  const withDueDate = incomplete
    .filter((task) => task.dueDate)
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.dueDate || "").getTime();
      const bTime = new Date(b.dueDate || "").getTime();
      return aTime - bTime;
    });
  if (withDueDate.length > 0) {
    return withDueDate[0].id;
  }

  return incomplete[0].id;
}

export function stageIsFuture(
  stageOrder: readonly PipelineStageName[],
  stage: PipelineStageName,
  currentStage: PipelineStageName,
): boolean {
  return stageOrder.indexOf(stage) > stageOrder.indexOf(currentStage);
}
