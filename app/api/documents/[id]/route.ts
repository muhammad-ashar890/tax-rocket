import { readFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      userId: user.id,
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const storedFileName = path.basename(document.fileUrl);
  if (storedFileName !== document.fileUrl) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
  }

  try {
    const filePath = path.join(process.cwd(), "uploads", storedFileName);
    const file = await readFile(filePath);
    const safeDownloadName = document.fileName.replace(/["\r\n]/g, "_");

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `inline; filename="${safeDownloadName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Stored file not found" }, { status: 404 });
  }
}
