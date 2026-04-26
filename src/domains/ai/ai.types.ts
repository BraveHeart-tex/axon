import { AI_MODELS } from './ai.constants.js';

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];
