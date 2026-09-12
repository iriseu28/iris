export function enforceTaskLineage(plan, interpretation) {
  const sources = new Map(
    Object.entries(interpretation || {}).flatMap(([category, items]) =>
      (items || []).filter((item) => item?.id).map((item) => [item.id, category])
    )
  )

  function normalizeTask(task) {
    if (!task?.source_id) {
      return task?.source_category ? { ...task, source_category: null } : task
    }
    const sourceCategory = sources.get(task.source_id)
    if (!sourceCategory || (task.source_category && task.source_category !== sourceCategory)) {
      return { ...task, source_id: null, source_category: null }
    }
    return {
      ...task,
      source_category: sourceCategory,
      subtasks: task.subtasks?.map(normalizeTask),
    }
  }

  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      tasks: (day.tasks || []).map(normalizeTask),
    })),
  }
}
