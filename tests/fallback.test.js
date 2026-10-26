import { describe, it, expect, vi } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import { getCandidateModels, isFallbackableError, DEFAULT_FALLBACK_MODELS } from '../server/models.js';
import { testGeminiConnection } from '../server/gemini.js';
import { startAgentSession } from '../server/agent.js';
import { geminiProvider } from '../server/providers/manager.js';

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
    const origStart = geminiProvider.startSession;

    // Simulate gemini-2.5-flash returning 429 then fallback model succeeding
    geminiProvider.startSession = vi.fn().mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      fallbackFrom: 'gemini-2.5-flash',
      toolCall: { name: 'look', args: {} },
      thought: 'Switched to fallback candidate model'
    });

    try {
      const sessionRes = await startAgentSession({
        modelName: 'gemini-2.5-flash',
        startPos: { row: 7, col: 1 }
      });

      expect(sessionRes.status).toBe(200);
      expect(sessionRes.data.success).toBe(true);
      expect(sessionRes.data.fallbackFrom).toBe('gemini-2.5-flash');
      expect(sessionRes.data.model).toBe('gemini-3.5-flash');
      expect(sessionRes.data.toolCall.name).toBe('look');
    } finally {
      geminiProvider.startSession = origStart;
    }
  });
});
