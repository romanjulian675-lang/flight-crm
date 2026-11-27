"use server";

import { prisma } from "@/lib/db";
import { formString, runAction } from "@/lib/action";
import { commentContent, createContent, reviewContent, updateContent, type ReviewStatus } from "@/modules/content";

function input(fd: FormData) {
  return { title: formString(fd, "title"), caption: formString(fd, "caption"), videoUrl: formString(fd, "videoUrl"), coverUrl: formString(fd, "coverUrl"), date: formString(fd, "date"), time: formString(fd, "time") || "16:00" };
}

export async function createContentAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await createContent(prisma, ctx, input(fd)); });
}
export async function updateContentAction(id: string, version: number, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await updateContent(prisma, ctx, id, version, input(fd)); });
}
export async function reviewContentAction(id: string, version: number, status: ReviewStatus, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await reviewContent(prisma, ctx, id, version, status, formString(fd, "body")); });
}
export async function commentContentAction(id: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await commentContent(prisma, ctx, id, formString(fd, "body")); });
}
