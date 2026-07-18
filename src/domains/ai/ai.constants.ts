export const AI_MODELS = {
  GPT_OSS_120B: 'openai/gpt-oss-120b',
  GPT_OSS_20B: 'openai/gpt-oss-20b',
  QWEN3_6_27B: 'qwen/qwen3.6-27b',
} as const;

export const DEFAULT_AI_MODEL = AI_MODELS.GPT_OSS_120B;

export const AI_MODEL_ENV_KEY = 'AXON_AI_MODEL';

export const COMMIT_MESSAGE_MAX_OUTPUT_CHARS = 100;

export const COMMIT_DIFF_MAX_CHARS = 12_000;
