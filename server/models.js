/**
 * Model candidate definitions and fallback detection for resilient Gemini integration.
 */

export const DEFAULT_FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-flash-latest'
];

/**
 * Returns an ordered, deduplicated list of candidate models to try.
 * The requested model (or GEMINI_MODEL env) is always first.
 */
export function getCandidateModels(requestedModel) {
  const primary = requestedModel || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  return Array.from(new Set([primary, ...DEFAULT_FALLBACK_MODELS]));
}

/**
 * Determines if an API error should trigger automatic model fallback.
 * Authentication errors (401/403/invalid key) are NOT fallbackable.
 * Quotas (429), model availability (404), timeouts, and service overloads (503) ARE fallbackable.
 */
export function isFallbackableError(error) {
  if (!error) return false;
  const status = error.status || error.code;
  const msg = error.message || String(error);

  // Authentication & permission errors will fail on all models, do not retry
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('API key not valid') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('unregistered project')
  ) {
    return false;
  }

  // Quota exhausted (429), Model not found (404), Overloaded (503), Timeouts, 500s
  return (
    status === 429 ||
    status === 404 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg === 'REQUEST_TIMEOUT' ||
    msg === 'TIMEOUT' ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('Quota') ||
    msg.includes('rate limit') ||
    msg.includes('Rate limit') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('not supported') ||
    msg.includes('overloaded') ||
    msg.includes('experiencing high demand') ||
    msg.includes('temporarily unavailable')
  );
}
