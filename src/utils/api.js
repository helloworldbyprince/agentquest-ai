/**
 * Unified API Client for AgentQuest
 * Connects directly to Express backend on port 3001 during local Vite dev,
 * with automatic fallback and resilient JSON parsing.
 */

export async function apiFetch(path, options = {}) {
  const isDev = typeof window !== 'undefined' && window.location.port === '5173';
  const primaryUrl = isDev ? `http://localhost:3001${path}` : path;
  const secondaryUrl = isDev ? path : `http://localhost:3001${path}`;

  try {
    const response = await fetch(primaryUrl, options);
    // If proxy returned an empty 500 error, try the alternative endpoint
    if (!response.ok && response.status >= 500) {
      try {
        const altResponse = await fetch(secondaryUrl, options);
        if (altResponse.ok || altResponse.status < 500) {
          return altResponse;
        }
      } catch {
        // Return original response
      }
    }
    return response;
  } catch (err) {
    // If primary failed with network error, try secondary
    return await fetch(secondaryUrl, options);
  }
}

/**
 * Safely parses response JSON, avoiding "unexpected end of data" syntax errors
 */
export async function safeJson(response) {
  if (!response) {
    return { success: false, error: 'No response received from server.' };
  }

  const text = await response.text();
  if (!text || text.trim() === '') {
    return {
      success: false,
      error: `Server returned empty response (HTTP ${response.status}). Ensure the Express backend is running on port 3001 (\`npm run server\`).`
    };
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    return {
      success: false,
      error: `Invalid response format from server: ${text.slice(0, 120)}`
    };
  }
}
