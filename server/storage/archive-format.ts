import { z } from "zod";

export const storageScalarSchema = z.union([
  z.string(),
  z.number().finite(),
  z.null(),
]);
export type StorageScalar = z.infer<typeof storageScalarSchema>;
export const storageRowSchema = z.record(z.string(), storageScalarSchema);
export type StorageRow = z.infer<typeof storageRowSchema>;
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const tableDescriptionSchema = z
  .object({
    name: identifier,
    columns: z.array(identifier).min(1),
    primaryKey: z.array(identifier),
    createSql: z.string().min(1),
    count: z.number().int().nonnegative(),
    sha256: digest,
  })
  .strict();
export type TableDescription = z.infer<typeof tableDescriptionSchema>;
export const indexDescriptionSchema = z
  .object({
    name: identifier,
    sql: z.string().min(1),
  })
  .strict();
export const blobDescriptionSchema = z
  .object({
    key: z.string().regex(/^media\/[a-f0-9-]{36}\.(mp4|png|jpg|webp|gif)$/),
    sha256: digest,
    size: z.number().int().nonnegative(),
    contentType: z.string().max(100),
  })
  .strict();
export type BlobDescription = z.infer<typeof blobDescriptionSchema>;
export const archiveMetadataSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    tables: z.array(tableDescriptionSchema),
    indexes: z.array(indexDescriptionSchema),
    blobs: z.array(blobDescriptionSchema),
  })
  .strict();
export type ArchiveMetadata = z.infer<typeof archiveMetadataSchema>;

/** Hash this UTF-8 text in primary-key order, or all-column order without a PK. */
export function canonicalRow(columns: string[], row: StorageRow): string {
  if (
    Object.keys(row).length !== columns.length ||
    columns.some((column) => !Object.hasOwn(row, column))
  )
    throw new Error("Storage archive row does not match its columns");
  return JSON.stringify(columns.map((column) => row[column])) + "\n";
}

/** Fixed field order is part of the archive format, independent of object order. */
export function canonicalMetadata(metadata: ArchiveMetadata): string {
  return JSON.stringify({
    schemaVersion: metadata.schemaVersion,
    tables: metadata.tables.map((table) => ({
      name: table.name,
      columns: table.columns,
      primaryKey: table.primaryKey,
      createSql: table.createSql,
      count: table.count,
      sha256: table.sha256,
    })),
    indexes: metadata.indexes.map((index) => ({
      name: index.name,
      sql: index.sql,
    })),
    blobs: metadata.blobs.map((blob) => ({
      key: blob.key,
      sha256: blob.sha256,
      size: blob.size,
      contentType: blob.contentType,
    })),
  });
}

export function quoteIdentifier(value: string): string {
  return `"${identifier.parse(value)}"`;
}
