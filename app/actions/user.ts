"use server";

import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getUserProfile() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return { success: false };

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) return { success: false };

    return {
      success: true,
      user: {
        fullName: user.name || "",
        email: user.email || "",
        image: user.image || "",
        cnic: user.cnic || "",
        ntn: user.ntn || "",
        phone: user.phone || "",
        address: user.address || "",
        city: user.city || "",
        dateOfBirth: user.dateOfBirth
          ? user.dateOfBirth.toISOString().split("T")[0]
          : "",
        taxYear: user.defaultTaxYear
          ? user.defaultTaxYear.toString()
          : new Date().getFullYear().toString(),
      },
    };
  } catch (error) {
    console.error("Error fetching profile:", error);
    return { success: false, error: "Failed to fetch profile" };
  }
}

export async function uploadUserAvatarAction(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) return { success: false, error: "Unauthorized" };

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Profile image is required" };
    }

    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      return { success: false, error: "Profile image must be smaller than 5 MB" };
    }

    if (!file.type.startsWith("image/")) {
      return { success: false, error: "Only image files are supported" };
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) return { success: false, error: "User profile not found" };

    const uploadDirectory = path.join(process.cwd(), "uploads", "profile");
    await mkdir(uploadDirectory, { recursive: true });

    const extension = path.extname(file.name).toLowerCase() || ".jpg";
    const storedFileName = `${randomUUID()}${extension}`;
    const relativeFilePath = path.join("profile", storedFileName);

    await writeFile(
      path.join(process.cwd(), "uploads", relativeFilePath),
      Buffer.from(await file.arrayBuffer()),
    );

    const avatarDocument = await prisma.document.create({
      data: {
        userId: user.id,
        documentType: "PROFILE_AVATAR",
        fileName: file.name,
        fileUrl: relativeFilePath,
        mimeType: file.type,
        sizeBytes: file.size,
        extractionStatus: "NOT_APPLICABLE",
      },
      select: { id: true },
    });

    const avatarUrl = `/api/documents/${avatarDocument.id}`;
    await prisma.user.update({
      where: { id: user.id },
      data: { image: avatarUrl },
    });

    revalidatePath("/tax/profile");
    return { success: true, avatarUrl };
  } catch (error) {
    console.error("Error uploading user avatar:", error);
    return { success: false, error: "Failed to upload profile image" };
  }
}

export async function removeUserAvatarAction() {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;

    if (!email) return { success: false, error: "Unauthorized" };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, image: true },
    });

    if (!user) return { success: false, error: "User profile not found" };

    if (user.image?.startsWith("/api/documents/")) {
      const documentId = user.image.split("/").pop();
      if (documentId) {
        const avatarDocument = await prisma.document.findFirst({
          where: {
            id: documentId,
            userId: user.id,
            documentType: "PROFILE_AVATAR",
          },
          select: { id: true, fileUrl: true },
        });

        if (avatarDocument) {
          const relativePath = path.normalize(avatarDocument.fileUrl);
          if (!path.isAbsolute(relativePath) && !relativePath.startsWith("..")) {
            await unlink(
              path.join(process.cwd(), "uploads", relativePath),
            ).catch(() => undefined);
          }
          await prisma.document.delete({ where: { id: avatarDocument.id } });
        }
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { image: null },
    });

    revalidatePath("/tax/profile");
    revalidatePath("/tax/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error removing user avatar:", error);
    return { success: false, error: "Failed to remove profile image" };
  }
}

export async function updateUserProfile(data: {
  fullName: string;
  cnic: string;
  ntn: string;
  dateOfBirth: string;
  phone: string;
  address: string;
  city: string;
  taxYear: string;
}) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return { success: false, error: "Unauthorized" };

    const dob = data.dateOfBirth ? new Date(data.dateOfBirth) : null;

    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        name: data.fullName,
        cnic: data.cnic || null,
        ntn: data.ntn || null,
        phone: data.phone || null,
        dateOfBirth: dob,
        address: data.address || null,
        city: data.city || null,
        defaultTaxYear: data.taxYear ? parseInt(data.taxYear, 10) : null,
      },
    });

    revalidatePath("/tax/profile");
    revalidatePath("/tax/dashboard");
    revalidatePath("/tax/settings");
    revalidatePath("/tax/new");
    return { success: true };
  } catch (error) {
    console.error("Error updating profile:", error);
    return {
      success: false,
      error: "Failed to update profile. Make sure CNIC/NTN are unique.",
    };
  }
}
