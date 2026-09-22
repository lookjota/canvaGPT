import 'dotenv/config';
import OpenAI from 'openai';
import { env } from './env.js';

export type AiInput = { message: string; history: Array<{ role: 'user' | 'assistant'; content: string }>; context: string };
export type AiResult = { content: string };
export interface AiProvider { generate(input: AiInput): Promise<AiResult>; }

export class MockAiProvider implements AiProvider {
  async generate(input: AiInput): Promise<AiResult> { return { content: `Mock Orion response: ${input.message}${input.context ? `\nContext received (${input.context.length} characters).` : ''}` }; }
}

export class OpenAiProvider implements AiProvider {
  private readonly client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  async generate(input: AiInput): Promise<AiResult> {
    const response = await this.client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: 'You are Orion, an AI assistant working inside a visual project workspace. Use the supplied project context when relevant. Distinguish information present in the context from assumptions. Do not claim to have access to project elements that were not supplied.',
      input: [...input.history, { role: 'user', content: `${input.context ? `${input.context}\n\n` : ''}${input.message}` }],
      store: false,
    });
    return { content: response.output_text || 'Não foi possível gerar uma resposta.' };
  }
}

export function createAiProvider(): AiProvider { return env.AI_PROVIDER === 'mock' ? new MockAiProvider() : new OpenAiProvider(); }
