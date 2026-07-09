// app/actions/filing.ts

"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

// In a real app, you would get this from the session (e.g. getServerSession)
// For now, we will use a dummy user ID or create one if it doesn't exist.
// This allows testing the database flow without fully enforcing strict auth matching yet.
async function getOrCreateDemoUserId() {
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "demo@example.com",
        name: "Demo User",
      },
    });
  }
  return user.id;
}

export async function createFilingDraftAction(formData: FormData) {
  try {
    const userId = await getOrCreateDemoUserId();
    
    // Parse form data
    const taxYear = parseInt(formData.get("taxYear") as string, 10);
    const filerType = formData.get("filerType") as string;
    const businessStructure = formData.get("businessStructure") as string | null;
    const salaryPercentage = formData.get("salaryPercentage") as string | null;
    
    // Income sources come as multiple identical keys in FormData
    const incomeSources = formData.getAll("incomeSources").map(String);
    const incomeSourcesJson = JSON.stringify(incomeSources);
    
    // Create new draft in DB
    const newDraft = await prisma.filingDraft.create({
      data: {
        userId,
        taxYear,
        filerType,
        businessStructure,
        salaryPercentage,
        incomeSources: incomeSourcesJson,
        currentStep: 8, // Represents reaching the pipeline phase after creation
        status: "IN_PROGRESS",
      },
    });

    // Tell Next.js to clear cache for dashboard to show new filing
    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/filings");
    
    return { success: true, draftId: newDraft.id };
  } catch (error) {
    console.error("Error creating filing draft:", error);
    return { success: false, error: "Failed to create filing draft" };
  }
}

export async function updateFilingStepAction(
  draftId: string,
  newStep: number,
  status: string = "IN_PROGRESS"
) {
  try {
    await prisma.filingDraft.update({
      where: { id: draftId },
      data: {
        currentStep: newStep,
        status: status,
      },
    });

    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/filings");
    
    return { success: true };
  } catch (error) {
    console.error("Error updating filing step:", error);
    return { success: false, error: "Failed to update step" };
  }
}