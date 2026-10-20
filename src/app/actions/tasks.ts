"use server";

import { prisma } from "@/lib/db";
import { formOptional, formString, runAction } from "@/lib/action";
import { completeTask, createTask, deleteTask, reopenTask } from "@/modules/tasks";

export async function createTaskAction(leadId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await createTask(prisma, ctx, leadId, {
      title: formString(fd, "title"),
      date: formString(fd, "date"),
      time: formString(fd, "time") || "09:00",
      assigneeId: formOptional(fd, "assigneeId"),
    });
  });
}

export async function completeTaskAction(taskId: string) {
  return runAction(async (ctx) => completeTask(prisma, ctx, taskId));
}

export async function reopenTaskAction(taskId: string) {
  return runAction(async (ctx) => reopenTask(prisma, ctx, taskId));
}

export async function deleteTaskAction(taskId: string) {
  return runAction(async (ctx) => deleteTask(prisma, ctx, taskId));
}
