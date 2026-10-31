import OpenAI from 'openai';

/**
 * The chat and the safety checks run on OpenAI (gpt-5.4-mini, paid, no tight rate limits), speech-to-text on Groq
 * (whisper-large-v3, free). Groq speaks the OpenAI API, so the official `openai` SDK serves both – no LangChain
 * or LiteLLM, since the chat uses neither RAG nor tool calling.
 *
 * Created lazily, because main.ts loads backend/.env only after all modules have been imported.
 */
let openaiClient: OpenAI | undefined;
let groqClient: OpenAI | undefined;

export function openai(): OpenAI {
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

export function groq(): OpenAI {
  groqClient ??= new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  return groqClient;
}

export const models = {
  get chat(): string {
    return process.env.LLM_MODEL ?? 'gpt-5.4-mini';
  },
  get transcription(): string {
    return process.env.TRANSCRIPTION_MODEL ?? 'whisper-large-v3';
  },
  get safety(): string {
    return process.env.SAFETY_MODEL ?? 'gpt-5.4-mini';
  },
};

/**
 * Why a request to OpenAI failed, as the app shows it:
 * - `unavailable`: no credit left, project budget used up or the API key is wrong – only the parents can fix that,
 * - `rate_limit`: too many requests at once – trying again shortly helps,
 * - `failed`: anything else.
 */
export function llmError(err: unknown): 'unavailable' | 'rate_limit' | 'failed' {
  const { status, code } = err as { status?: number; code?: string };
  if (status === 401 || status === 403) return 'unavailable';
  // Only a real per-minute limit passes by itself – any other 429 (no credit, project budget used up) lasts
  if (status === 429) return code === 'rate_limit_exceeded' ? 'rate_limit' : 'unavailable';
  return 'failed';
}
