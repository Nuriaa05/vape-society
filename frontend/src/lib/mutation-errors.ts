import { ApiError } from "@/lib/api-client";

export const getMutationErrorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;
