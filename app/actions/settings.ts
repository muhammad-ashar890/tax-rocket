"use server";

import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SettingsInput = {
  notifications: {
    filingStatus: boolean;
    documentProcessing: boolean;
    riskFlags: boolean;
    paymentReminders: boolean;
    fbrConnect: boolean;
  };
  practice: {
    taxYear: string;
    currency: string;
    autoGeneratePackets: boolean;
    autoAdvanceStatus: boolean;
  };
  twoFactorEnabled: boolean;
};

export async function getUserSettingsAction() {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return { success: false, error: "Unauthorized" };

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        notificationPreferences: true,
        practicePreferences: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) return { success: false, error: "User profile not found" };

    return {
      success: true,
      settings: {
        notifications: JSON.parse(user.notificationPreferences),
        practice: JSON.parse(user.practicePreferences),
        twoFactorEnabled: user.twoFactorEnabled,
      },
    };
  } catch (error) {
    console.error("Error fetching settings:", error);
    return { success: false, error: "Failed to fetch settings" };
  }
}

export async function updateUserSettingsAction(input: SettingsInput) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return { success: false, error: "Unauthorized" };

    await prisma.user.update({
      where: { email },
      data: {
        notificationPreferences: JSON.stringify(input.notifications),
        practicePreferences: JSON.stringify({
          ...input.practice,
          // Product rule: wizard never auto-advances.
          autoAdvanceStatus: false,
        }),
        twoFactorEnabled: input.twoFactorEnabled,
      },
    });

    revalidatePath("/tax/settings");
    return { success: true };
  } catch (error) {
    console.error("Error updating settings:", error);
    return { success: false, error: "Failed to save settings" };
  }
}
