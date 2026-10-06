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
  getLocation(): Promise<{ directory: string }> {
    return apiClient.get<{ directory: string }>("/backups/location");
  },
  create(): Promise<Backup> {
    return apiClient.post<Backup>("/backups", {});
  },
};
