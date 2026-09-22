import { z } from 'zod';

export const env = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  AI_PROVIDER: z.enum(['openai', 'mock']).default(process.env.NODE_ENV === 'test' ? 'mock' : 'openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
}).parse(process.env);
