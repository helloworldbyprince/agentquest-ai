import { GoogleGenAI } from '@google/genai';

/**
 * Executes a live test request to Gemini with timeout & error sanitization.
 */
export async function testGeminiConnection({
  apiKey = process.env.GEMINI_API_KEY,
  modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  timeoutMs = 15000
} = {}) {
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    return {
      status: 400,
      data: {
        success: false,
        error: 'GEMINI_API_KEY is not configured on the server. Please copy .env.example to .env and set your Google Gemini API key.'
      }
    };
  }

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs);
  });

  try {
    const ai = new GoogleGenAI({ apiKey });

    const generatePromise = ai.models.generateContent({
      model: modelName,
      contents: 'Reply with exactly: AgentQuest AI connection successful.'
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const responseText = response.text ? response.text.trim() : '';

    return {
      status: 200,
      data: {
        success: true,
        model: modelName,
        message: responseText
      }
    };
  } catch (error) {
    const rawMsg = error?.message || String(error);
    const status = error?.status || 500;

    // Timeout
    if (rawMsg === 'REQUEST_TIMEOUT') {
      return {
        status: 504,
        data: {
          success: false,
          model: modelName,
          error: `Gemini API request timed out after ${timeoutMs / 1000} seconds.`
        }
      };
    }

    // Invalid API key / Auth failure
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      rawMsg.includes('API_KEY_INVALID') ||
      rawMsg.includes('PERMISSION_DENIED') ||
      rawMsg.includes('unregistered project') ||
      rawMsg.includes('API key not valid')
    ) {
      return {
        status: 401,
        data: {
          success: false,
          model: modelName,
          error: 'Gemini API authentication failed. Please verify that your GEMINI_API_KEY in .env is valid and active in Google AI Studio.'
        }
      };
    }

    // Quota / Rate limit
    if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('Quota')) {
      return {
        status: 429,
        data: {
          success: false,
          model: modelName,
          error: 'Gemini API rate limit or quota exceeded. Please wait a moment and try again.'
        }
      };
    }

    // Model not found
    if (status === 404 || rawMsg.includes('NOT_FOUND') || rawMsg.includes('not supported')) {
      return {
        status: 404,
        data: {
          success: false,
          model: modelName,
          error: `Model "${modelName}" was not found or is unsupported for this API key.`
        }
      };
    }

    // General network or fetch failures
    return {
      status: 502,
      data: {
        success: false,
        model: modelName,
        error: `Failed to connect to Gemini API: ${rawMsg.replace(/key=[^&\s]+/gi, 'key=***')}`
      }
    };
  }
}

