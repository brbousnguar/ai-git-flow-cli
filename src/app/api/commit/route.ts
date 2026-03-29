import { NextResponse } from "next/server";

import { executeCommitWorkflow, previewCommitWorkflow } from "@/lib/server/commit";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: "preview" | "execute";
      repoName?: string;
      ticket?: string;
      developerMessage?: string;
      labels?: string;
      excludedLabels?: string[];
      branch?: string;
      commit?: string;
      baseBranch?: string;
    };

    if (body.mode === "execute") {
      const result = await executeCommitWorkflow({
        baseBranch: body.baseBranch,
        branch: body.branch || "",
        commit: body.commit || "",
        labels: body.labels,
        repoName: body.repoName || "",
      });
      return NextResponse.json(result);
    }

    const result = await previewCommitWorkflow({
      developerMessage: body.developerMessage,
      excludedLabels: body.excludedLabels || [],
      labels: body.labels,
      repoName: body.repoName || "",
      ticket: body.ticket,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 400 },
    );
  }
}
