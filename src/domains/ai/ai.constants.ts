export const AI_MODELS = {
  LLAMA_33_70B_VERSATILE: 'llama-3.3-70b-versatile',
  LLAMA_4_SCOUT_17B: 'meta-llama/llama-4-scout-17b-16e-instruct',
  QWEN3_32B: 'qwen/qwen3-32b',
  GPT_OSS_120B: 'openai/gpt-oss-120b',
  GPT_OSS_20B: 'openai/gpt-oss-20b',
} as const;

export const DEFAULT_AI_MODEL = AI_MODELS.LLAMA_4_SCOUT_17B;

export const AI_MODEL_ENV_KEY = 'AXON_AI_MODEL';
