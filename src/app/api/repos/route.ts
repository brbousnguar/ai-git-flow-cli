import { NextResponse } from "next/server";

import { listAvailableRepos, resolveRepoPath, getReposBaseDir } from "@/lib/server/config";
import { getRepoStatus } from "@/lib/server/git";

export async function GET() {
  try {
    return NextResponse.json({
      baseDir: getReposBaseDir(),
      repos: listAvailableRepos(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { repoName?: string };
    const repoPath = resolveRepoPath(body.repoName || "");
    const status = await getRepoStatus(repoPath);
    return NextResponse.json({
      repoName: body.repoName,
      repoPath,
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 400 },
    );
  }
}
