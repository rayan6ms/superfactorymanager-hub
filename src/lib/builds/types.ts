import type { BuildVisibility } from "@prisma/client";

export type BuildSummary = {
  username: string;
  slug: string;
  nameOriginal: string;
  nameLower: string;
  tag: string;
  visibility: BuildVisibility;
  createdAt: string;
  updatedAt: string;
};

export type BuildCommitSummary = {
  id: string;
  createdAt: string;
  message: string | null;
};

export type BuildCommitHistorySummary = {
  totalCount: number;
  visibleCount: number;
  limit: number;
  hasMore: boolean;
  includesSelectedCommitOutsideWindow: boolean;
};

export type BuildReference = {
  username: string;
  slug: string;
};

export type BuildDetailPayload = {
  build: {
    username: string;
    slug: string;
    nameOriginal: string;
    tag: string;
    visibility: BuildVisibility;
    createdAt: string;
    updatedAt: string;
    forkedFrom: BuildReference | null;
  };
  code: string;
  commits: BuildCommitSummary[];
  commitHistory: BuildCommitHistorySummary;
  selectedCommitId: string | null;
};

export type BuildWriteError =
  | "BUILD_NAME_TAKEN"
  | "CODE_TOO_SHORT"
  | "Not found"
  | string;

export type BuildWriteResponse = {
  build?: BuildSummary;
  error?: BuildWriteError;
  nonWhitespaceCount?: number;
  minNonWhitespaceCount?: number;
};
