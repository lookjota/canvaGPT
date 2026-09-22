import { z } from 'zod';

export const env = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  AI_PROVIDER: z.enum(['openai', 'mock']).default(process.env.NODE_ENV === 'test' ? 'mock' : 'openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  PROJECT_MEMORY_MAX_ITEMS: z.coerce.number().int().min(0).default(20),
  PROJECT_MEMORY_MAX_CHARS: z.coerce.number().int().min(0).default(12000),
}).parse(process.env);
