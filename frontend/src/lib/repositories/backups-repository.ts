import { apiClient } from "@/lib/api-client";
export type Backup = {
  id: string;
  filename: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
};
export const backupsRepository = {
  findAll(): Promise<Backup[]> {
    return apiClient.get<Backup[]>("/backups");
  },
  create(): Promise<Backup> {
    return apiClient.post<Backup>("/backups", {});
  },
};
