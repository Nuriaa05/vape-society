import { apiClient } from "@/lib/api-client";
export type Backup = {
  id: string;
  filename: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
};

export type BackupAutomation = {
  enabled: boolean;
};

export type DatabaseImportPreview = {
  id: string;
  counts: {
    products: number;
    combos: number;
    sales: number;
    purchases: number;
    suppliers: number;
    movements: number;
  };
};

export type DatabaseImportResult = {
  imported: true;
  safetyBackup: Backup;
};

export const backupsRepository = {
  findAll(): Promise<Backup[]> {
    return apiClient.get<Backup[]>("/backups");
  },
  getLocation(): Promise<{ directory: string }> {
    return apiClient.get<{ directory: string }>("/backups/location");
  },
  getAutomation(): Promise<BackupAutomation> {
    return apiClient.get<BackupAutomation>("/backups/automation");
  },
  updateAutomation(enabled: boolean): Promise<BackupAutomation> {
    return apiClient.patch<BackupAutomation>("/backups/automation", {
      enabled,
    });
  },
  create(): Promise<Backup> {
    return apiClient.post<Backup>("/backups", {});
  },
  validateImport(file: File): Promise<DatabaseImportPreview> {
    return apiClient.upload<DatabaseImportPreview>(
      "/backups/import/validate",
      file,
    );
  },
  confirmImport(id: string): Promise<DatabaseImportResult> {
    return apiClient.post<DatabaseImportResult>(
      `/backups/import/${id}/confirm`,
      {
        confirmed: true,
      },
    );
  },
  discardImport(id: string): Promise<void> {
    return apiClient.delete<void>(`/backups/import/${id}`);
  },
};
