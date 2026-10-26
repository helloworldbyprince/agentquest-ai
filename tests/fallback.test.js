import { describe, it, expect, vi } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import { getCandidateModels, isFallbackableError, DEFAULT_FALLBACK_MODELS } from '../server/models.js';
import { testGeminiConnection } from '../server/gemini.js';
import { startAgentSession } from '../server/agent.js';

describe('Fallback Mechanism & Candidate Models', () => {
  it('getCandidateModels puts requested model first and deduplicates', () => {
    const list = getCandidateModels('gemini-2.5-flash');
    expect(list[0]).toBe('gemini-2.5-flash');
    expect(list).toContain('gemini-flash-lite-latest');
    expect(list).toContain('gemini-2.5-flash-lite');
    // No duplicates
    const unique = new Set(list);
    expect(unique.size).toBe(list.length);
  });

  it('isFallbackableError correctly identifies retryable vs non-retryable errors', () => {
    // 429 Quota exhausted -> retryable
    expect(isFallbackableError({ status: 429, message: 'Resource exhausted' })).toBe(true);
    expect(isFallbackableError({ message: 'Quota exceeded for metric' })).toBe(true);

    // 404 Model not found -> retryable
    expect(isFallbackableError({ status: 404, message: 'Model not found' })).toBe(true);

    // 503 Service unavailable -> retryable
    expect(isFallbackableError({ status: 503, message: 'Overloaded' })).toBe(true);

    // Timeout -> retryable
    expect(isFallbackableError({ message: 'REQUEST_TIMEOUT' })).toBe(true);

    // 401 Auth error -> NOT retryable
    expect(isFallbackableError({ status: 401, message: 'API key not valid' })).toBe(false);
    expect(isFallbackableError({ message: 'API_KEY_INVALID' })).toBe(false);
    expect(isFallbackableError({ status: 403, message: 'PERMISSION_DENIED' })).toBe(false);
  });

  it('automatically falls back when requested model is quota-exhausted (gemini-2.5-flash)', async () => {
    // Explicitly request the model that is quota-exhausted on free tier
    const result = await testGeminiConnection({
      modelName: 'gemini-2.5-flash'
    });

    // Should succeed via automatic fallback to an available flash candidate
    expect(result.status).toBe(200);
    expect(result.data.success).toBe(true);
    expect(result.data.fallbackFrom).toBe('gemini-2.5-flash');
    expect(result.data.model).not.toBe('gemini-2.5-flash');
    expect(result.data.message).toBe('AgentQuest AI connection successful.');
  }, 20000);

  it('startAgentSession automatically falls back when requested model is quota-exhausted', async () => {
    // Start session explicitly requesting the quota-exhausted model
    const sessionRes = await startAgentSession({
      modelName: 'gemini-2.5-flash',
      startPos: { row: 7, col: 1 }
    });

    expect(sessionRes.status).toBe(200);
    expect(sessionRes.data.success).toBe(true);
    expect(sessionRes.data.fallbackFrom).toBe('gemini-2.5-flash');
    expect(sessionRes.data.sessionId).toBeDefined();
    expect(sessionRes.data.toolCall).toBeDefined();
    expect(sessionRes.data.toolCall.name).toBeDefined();
  }, 20000);
});
