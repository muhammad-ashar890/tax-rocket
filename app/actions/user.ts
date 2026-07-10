// app/actions/user.ts

"use server";

import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

// Database se user ka pura data laane ka function
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
        cnic: user.cnic || "",
        ntn: user.ntn || "",
        phone: user.phone || "",
        address: user.address || "",
        city: user.city || "",
        dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().split('T')[0] : "",
        taxYear: user.defaultTaxYear ? user.defaultTaxYear.toString() : new Date().getFullYear().toString(),
      }
    };
  } catch (error) {
    console.error("Error fetching profile:", error);
    return { success: false, error: "Failed to fetch profile" };
  }
}

// User ka naya data database mein save karne ka function
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
    return { success: true };
  } catch (error) {
    console.error("Error updating profile:", error);
    return { success: false, error: "Failed to update profile. Make sure CNIC/NTN are unique." };
  }
}