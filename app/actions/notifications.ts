"use server";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

// If the same title fires again for the same user within this window,
// treat it as a duplicate (e.g. a double button-press, a double-fired
// effect, or a retried server action) and skip creating a second row.
const DEDUPE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

async function getCurrentUserId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) throw new Error("User profile not found");
  return user.id;
}

function serializeNotification(n: {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}): NotificationView {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function getNotificationsAction() {
  try {
    const userId = await getCurrentUserId();

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      success: true,
      notifications: notifications.map(serializeNotification),
      unreadCount,
    };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return {
      success: false,
      error: "Failed to fetch notifications",
      notifications: [] as NotificationView[],
      unreadCount: 0,
    };
  }
}

export async function markNotificationReadAction(notificationId: string) {
  try {
    const userId = await getCurrentUserId();
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { success: false, error: "Failed to mark notification as read" };
  }
}

export async function markAllNotificationsReadAction() {
  try {
    const userId = await getCurrentUserId();
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return {
      success: false,
      error: "Failed to mark all notifications as read",
    };
  }
}

// Internal helper — reuse this from ANY server action whenever a
// user-facing event happens: FBR status change, packet approved,
// filing submitted, etc. Not exposed to the client directly.
//
// Includes a dedupe guard: if the exact same title was already created
// for this user within DEDUPE_WINDOW_MS, this is a no-op. This protects
// against double-fired calls (double click, a double-invoked effect,
// retried server actions) producing duplicate notices in the bell.
export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const recentDuplicate = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      title: input.title,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentDuplicate) {
    return recentDuplicate;
  }

  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
    },
  });
}
