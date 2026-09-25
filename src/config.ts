import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { siteFor } from './sources';
import type { TrackerConfig } from './types';

const trackerSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z
      .string()
      .url()
      .refine(
        (url) => {
          try {
            siteFor(url);
            return true;
          } catch {
            return false;
          }
        },
        (url) => ({ message: `unsupported site: ${url}` }),
      ),
    filters: z
      .object({
        priceMin: z.number().positive().optional(),
        priceMax: z.number().positive().optional(),
        titleMustInclude: z.array(z.string()).optional(),
        minBatteryHealth: z.number().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
    phoneTaxEgp: z.number().nonnegative().optional(),
    details: z.array(z.string()).optional(),
    compareBy: z.array(z.string()).optional(),
  })
  // Reject unknown keys: a typo ("minBateryHealth") fails loudly instead of silently not filtering.
  .strict();

const trackersSchema = z
  .array(trackerSchema)
  .min(1)
  .refine((trackers) => new Set(trackers.map((tracker) => tracker.id)).size === trackers.length, {
    message: 'tracker ids must be unique — the id is the key the seen-state is stored under',
  });

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadTrackers(path = resolve(repoRoot, 'config/trackers.json')): TrackerConfig[] {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return trackersSchema.parse(parsed);
}

export interface AppEnv {
  readonly telegramBotToken: string;
  readonly telegramChatId: string;
  readonly dryRun: boolean;
}

export function loadEnv(): AppEnv {
  const dryRun = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const telegramChatId = process.env.TELEGRAM_CHAT_ID ?? '';

  if (!dryRun && (!telegramBotToken || !telegramChatId)) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set (or run with DRY_RUN=1 to preview without sending).',
    );
  }

  return { telegramBotToken, telegramChatId, dryRun };
}
