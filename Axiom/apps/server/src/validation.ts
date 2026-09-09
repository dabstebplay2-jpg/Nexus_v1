import { z } from 'zod';
const attachment = z.object({
  id: z.string().max(100),
  name: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().min(0).max(2_000_000),
});
export const partsSchema = z
  .array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('text'), text: z.string().max(100_000) }),
      z.object({ type: z.literal('file'), attachment, text: z.string().max(100_000) }),
      z.object({
        type: z.literal('image'),
        attachment,
        dataUrl: z
          .string()
          .max(2_800_000)
          .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
      }),
    ]),
  )
  .min(1)
  .max(8);
export const generationSchema = z
  .object({
    providerId: z.string(),
    modelId: z.string(),
    parts: partsSchema.optional(),
    editMessageId: z.string().optional(),
    regenerate: z.boolean().optional(),
  })
  .refine((v) => !(v.editMessageId && v.regenerate));
export const providerSchema = z.object({
  timeouts: z
    .object({
      connectionMs: z.number().int().positive().max(2_147_483_647).optional(),
      idleMs: z.number().int().positive().max(2_147_483_647).optional(),
      absoluteMs: z.number().int().positive().max(2_147_483_647).optional(),
    })
    .optional(),
  name: z.string().trim().min(1).max(80),
  baseUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    }),
  apiKey: z.string().max(4096).optional(),
  clearSecret: z.boolean().optional(),
  locality: z.enum(['local', 'cloud']),
  models: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        displayName: z.string().trim().min(1).max(200),
        contextWindow: z.number().int().positive().optional(),
        capabilities: z.record(z.string(), z.boolean()),
      }),
    )
    .max(500),
});
export const settingsSchema = z.object({
  favoriteModels: z.array(z.string().max(500)).max(500),
  selectedModel: z.string().max(500).optional(),
});
