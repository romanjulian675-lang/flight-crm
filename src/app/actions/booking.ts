"use server";

import { prisma } from "@/lib/db";
import { formBool, formString, runAction } from "@/lib/action";
import { cancelBooking, createBookingPage, updateBookingPage } from "@/modules/booking";
import { calendarProvider, disconnectCalendar } from "@/modules/google-calendar";

export async function createBookingPageAction() {
  return runAction(async (ctx) => {
    await createBookingPage(prisma, ctx);
  });
}

export async function updateBookingPageAction(pageId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    const hours: Record<string, [string, string][]> = {};
    for (let d = 0; d < 7; d++) hours[String(d)] = fd.get(`day${d}`) === "on" ? [[formString(fd, `from${d}`), formString(fd, `to${d}`)]] : [];
    const num = (k: string) => (formString(fd, k) === "" ? NaN : Number(formString(fd, k)));
    await updateBookingPage(prisma, ctx, pageId, {
      title: formString(fd, "title"),
      slug: formString(fd, "slug"),
      durationMin: num("durationMin"),
      bufferMin: num("bufferMin"),
      minNoticeMin: Math.round(num("minNoticeHours") * 60),
      daysAhead: num("daysAhead"),
      timeZone: formString(fd, "timeZone"),
      hours,
      hostIds: fd.getAll("hostIds").map(String),
      enabled: formBool(fd, "enabled"),
    });
  });
}

export async function disconnectCalendarAction() {
  return runAction(async (ctx) => disconnectCalendar(prisma, ctx));
}

export async function cancelCallAction(bookingId: string) {
  return runAction(async (ctx) => cancelBooking(prisma, ctx, bookingId, calendarProvider(prisma)));
}
