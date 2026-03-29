export type Provider = "cloud" | "local";

export type CommitVariant = {
  branch: string;
  commit: string;
  labels: string;
};

export type GitCommandResult = {
  stdout: string;
  stderr: string;
};

export type AppConfig = {
  provider: string;
  local: {
    default: string;
    baseURL: string;
  };
  cloud: {
    model: string;
    pricing?: Record<
      string,
      {
        inputPer1M: number;
        cachedInputPer1M?: number;
        outputPer1M: number;
      }
    >;
  };
  muleLogs?: {
    defaultPath?: string;
    defaultLines?: number;
  };
  jira?: {
    baseUrl?: string;
    email?: string;
    apiToken?: string;
  };
};
