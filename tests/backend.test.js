import { describe, it, expect } from 'vitest';
import { testGeminiConnection } from '../server/gemini.js';

describe('Backend Express API & Gemini Connection Logic', () => {
  it('rejects missing GEMINI_API_KEY without exposing credentials', async () => {
    const result = await testGeminiConnection({ apiKey: '' });
    expect(result.status).toBe(400);
    expect(result.data.success).toBe(false);
    expect(result.data.error).toContain('GEMINI_API_KEY is not configured');
    expect(JSON.stringify(result)).not.toContain('AIza');
  });

  it('rejects placeholder GEMINI_API_KEY from .env.example', async () => {
    const result = await testGeminiConnection({ apiKey: 'your_gemini_api_key_here' });
    expect(result.status).toBe(400);
    expect(result.data.success).toBe(false);
    expect(result.data.error).toContain('GEMINI_API_KEY is not configured');
  });

  it('handles invalid API key safely without leaking the key string', async () => {
    const dummyKey = 'secret_invalid_key_99999';
    const result = await testGeminiConnection({ apiKey: dummyKey });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.data.success).toBe(false);
    expect(result.data).toHaveProperty('error');
    // Ensure the raw secret key is never leaked in the returned payload
    expect(JSON.stringify(result.data)).not.toContain(dummyKey);
  });
});

