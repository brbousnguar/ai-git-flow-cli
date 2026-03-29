import { NextResponse } from "next/server";

import {
  getDeployComments,
  previewDeployMessage,
  publishDeployMessage,
  removeDeployComment,
} from "@/lib/server/deploy-message";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: "preview" | "publish" | "list-comments" | "delete-comment";
      repoName?: string;
      ticketKey?: string;
      reporterName?: string;
      variant?: number;
      message?: string;
      tag?: string;
      commentId?: string;
    };

    if (!body.ticketKey) {
      throw new Error("ticketKey is required.");
    }

    if (body.mode === "publish") {
      await publishDeployMessage(body.ticketKey, body.message || "", body.tag || "");
      return NextResponse.json({ ok: true });
    }

    if (body.mode === "list-comments") {
      return NextResponse.json({ comments: await getDeployComments(body.ticketKey) });
    }

    if (body.mode === "delete-comment") {
      if (!body.commentId) {
        throw new Error("commentId is required.");
      }
      await removeDeployComment(body.ticketKey, body.commentId);
      return NextResponse.json({ ok: true });
    }

    const result = await previewDeployMessage({
      repoName: body.repoName || "",
      reporterName: body.reporterName,
      ticketKey: body.ticketKey,
      variant: body.variant,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 400 },
    );
  }
}
