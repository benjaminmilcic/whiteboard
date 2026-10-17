import OpenAI from 'openai';

/**
 * Groq speaks the OpenAI API, so the official `openai` SDK is all we need – no LangChain or LiteLLM,
 * since the chat uses neither RAG nor tool calling.
 *
 * Created lazily, because main.ts loads backend/.env only after all modules have been imported.
 */
let client: OpenAI | undefined;

export function groq(): OpenAI {
  client ??= new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  return client;
}

export const models = {
  get chat(): string {
    return process.env.LLM_MODEL ?? 'openai/gpt-oss-120b';
  },
  get transcription(): string {
    return process.env.TRANSCRIPTION_MODEL ?? 'whisper-large-v3';
  },
  get safety(): string {
    return process.env.SAFETY_MODEL ?? 'openai/gpt-oss-120b';
  },
};
