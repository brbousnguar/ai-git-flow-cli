import { NextResponse } from "next/server";

import { createReleasePr, previewRelease } from "@/lib/server/release";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: "preview" | "create";
      repoName?: string;
      version?: string;
      baseBranch?: string;
      headBranch?: string;
      title?: string;
      body?: string;
      labels?: string;
    };

    if (body.mode === "create") {
      const result = await createReleasePr({
        baseBranch: body.baseBranch || "main",
        body: body.body || "",
        headBranch: body.headBranch || "develop",
        labels: body.labels,
        repoName: body.repoName || "",
        title: body.title || "Release",
      });
      return NextResponse.json(result);
    }

    const result = await previewRelease(body.repoName || "", body.version);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 400 },
    );
  }
}
