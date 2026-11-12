export const fileKinds = ["import", "document", "export"] as const;
export type FileKind = typeof fileKinds[number];
export type FileRecord = { id: string; kind: FileKind; bucket: string; path: string; name: string; mime: string; size: number; sha256: string; titleId: string | null; operationId: string | null; createdAt: string };
export type AttachmentInput = { blob: Blob; name: string; kind: FileKind; titleId?: string };
export type PendingAttachment = AttachmentInput & { id: string };
export const storageRules = {
  import: { bucket: "fonciarch-imports", maxBytes: 10 * 1024 * 1024, extensions: ["csv", "xls", "xlsx"] },
  document: { bucket: "fonciarch-documents", maxBytes: 20 * 1024 * 1024, extensions: ["pdf", "jpg", "jpeg", "png"] },
  export: { bucket: "fonciarch-exports", maxBytes: 20 * 1024 * 1024, extensions: ["csv", "xlsx", "pdf"] },
} as const;
export function fileFormat(name: string, size: number, kind: FileKind) {
  const rule = storageRules[kind];
  if (!rule) throw new Error("Catégorie de fichier invalide.");
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (!(rule.extensions as readonly string[]).includes(extension)) throw new Error(`Format accepté : ${rule.extensions.join(", ")}.`);
  if (size < 1 || size > rule.maxBytes) throw new Error(`Le fichier doit contenir des données et faire au maximum ${rule.maxBytes / 1024 / 1024} Mio.`);
  const mime = { csv: "text/csv", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" }[extension]!;
  return { extension, mime, bucket: rule.bucket };
}
