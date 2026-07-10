"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

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
    
    const incomeSources = formData.getAll("incomeSources").map(String);
    const incomeSourcesJson = JSON.stringify(incomeSources);

    // Upsert avoids the P2002 Unique Constraint error if a draft already exists for this year
    const newDraft = await prisma.filingDraft.upsert({
      where: {
        userId_taxYear: {
          userId: userId,
          taxYear: taxYear
        }
      },
      update: {
        filerType,
        businessStructure,
        salaryPercentage,
        incomeSources: incomeSourcesJson,
        currentStep: 8,
        status: "IN_PROGRESS",
      },
      create: {
        userId,
        taxYear,
        filerType,
        businessStructure,
        salaryPercentage,
        incomeSources: incomeSourcesJson,
        currentStep: 8,
        status: "IN_PROGRESS",
      },
    });

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
    // Basic validation to avoid breaking if an old demo draftId is passed 
    // that doesn't exist in Prisma (e.g. "draft_xxxxxx")
    if(draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }
    
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

export async function getFilingDraftAction(draftId: string) {
  try {
    if(draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }
    
    const draft = await prisma.filingDraft.findUnique({
      where: { id: draftId }
    });
    
    if(!draft) return { success: false, error: "Not found" };
    
    // Transform JSON strings back to arrays to match component expectations
    return {
      success: true,
      draft: {
        ...draft,
        incomeSources: JSON.parse(draft.incomeSources),
        readinessCompleted: JSON.parse(draft.readinessChecks)
      }
    };
  } catch (error) {
    return { success: false, error: "Failed to fetch draft" };
  }
}

export async function updateFilingDraftAction(draftId: string, formData: any) {
  try {
    if(draftId.startsWith("draft_")) {
      return { success: false, error: "Legacy draft ID not supported" };
    }
    
    const dataToUpdate: any = {};
    
    if (formData.filerType !== undefined) dataToUpdate.filerType = formData.filerType;
    if (formData.businessStructure !== undefined) dataToUpdate.businessStructure = formData.businessStructure;
    if (formData.salaryPercentage !== undefined) dataToUpdate.salaryPercentage = formData.salaryPercentage;
    
    if (formData.incomeSources !== undefined) {
      dataToUpdate.incomeSources = JSON.stringify(formData.incomeSources);
    }
    
    if (formData.readinessCompleted !== undefined) {
      dataToUpdate.readinessChecks = JSON.stringify(formData.readinessCompleted);
    }

    await prisma.filingDraft.update({
      where: { id: draftId },
      data: dataToUpdate,
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating draft:", error);
    return { success: false, error: "Failed to update draft" };
  }
}