import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { SearchConfig } from './types';
import type { NikeWatch } from './nike/product-feed';

const siteSchema = z.enum(['contactcars', 'dubizzle', 'sylndr']);

const searchSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sources: z
    .array(z.object({ site: siteSchema, url: z.string().url() }))
    .min(1),
  filters: z
    .object({
      priceMin: z.number().positive().optional(),
      priceMax: z.number().positive().optional(),
      titleMustInclude: z.array(z.string()).optional(),
    })
    .optional(),
});

const searchesSchema = z.array(searchSchema).min(1);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadSearches(path = resolve(repoRoot, 'config/searches.json')): SearchConfig[] {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return searchesSchema.parse(parsed);
}

const nikeWatchSchema = z.object({
  label: z.string().min(1),
  productUrl: z.string().url(),
  styleColor: z.string().min(1),
  marketplace: z.string().min(1),
  language: z.string().min(1),
  sizes: z.array(z.string().min(1)).min(1),
});

const nikeWatchesSchema = z.array(nikeWatchSchema).min(1);

export function loadNikeWatches(path = resolve(repoRoot, 'config/nike-watches.json')): NikeWatch[] {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return nikeWatchesSchema.parse(parsed);
}

export interface AppEnv {
  readonly telegramBotToken: string;
  readonly telegramChatId: string;
  readonly jinaApiKey?: string;
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

  return {
    telegramBotToken,
    telegramChatId,
    jinaApiKey: process.env.JINA_API_KEY || undefined,
    dryRun,
  };
}
