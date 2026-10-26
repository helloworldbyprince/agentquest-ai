import { GoogleGenAI } from '@google/genai';
import { getCandidateModels, isFallbackableError } from './models.js';

/**
 * Executes a live test request to Gemini with fallback mechanism, timeout & error sanitization.
 */
export async function testGeminiConnection({
  apiKey = process.env.GEMINI_API_KEY,
  modelName = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
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

  const candidateModels = getCandidateModels(modelName);
  let lastError = null;
  let lastFailedModel = modelName;

  for (let i = 0; i < candidateModels.length; i++) {
    const activeModel = candidateModels[i];
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs);
    });

    try {
      const ai = new GoogleGenAI({ apiKey });

      const generatePromise = ai.models.generateContent({
        model: activeModel,
        contents: 'Reply with exactly: AgentQuest AI connection successful.'
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const responseText = response.text ? response.text.trim() : '';

      return {
        status: 200,
        data: {
          success: true,
          model: activeModel,
          message: responseText,
          fallbackFrom: activeModel !== modelName ? modelName : undefined
        }
      };
    } catch (error) {
      lastError = error;
      lastFailedModel = activeModel;

      const rawMsg = error?.message || String(error);
      const status = error?.status || 500;

      // Auth / Permission failure is fatal — do not fallback as all models will fail
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
            model: activeModel,
            error: 'Gemini API authentication failed. Please verify that your GEMINI_API_KEY in .env is valid and active in Google AI Studio.'
          }
        };
      }

      // If error is fallbackable and we have more candidates, continue to next model
      if (isFallbackableError(error) && i < candidateModels.length - 1) {
        console.warn(`[AgentQuest Backend] Test connection failed for model "${activeModel}": ${rawMsg.slice(0, 100)}. Falling back to "${candidateModels[i + 1]}"...`);
        continue;
      }

      // If we exhausted candidates or error is not fallbackable, break and return sanitized error
      break;
    }
  }

  // Format error from last attempt
  const rawMsg = lastError?.message || String(lastError);
  const status = lastError?.status || 500;

  if (rawMsg === 'REQUEST_TIMEOUT') {
    return {
      status: 504,
      data: {
        success: false,
        model: lastFailedModel,
        error: `Gemini API request timed out after ${timeoutMs / 1000} seconds.`
      }
    };
  }

  if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('Quota')) {
    return {
      status: 429,
      data: {
        success: false,
        model: lastFailedModel,
        error: `Gemini API rate limit or quota exceeded across tested models (including ${lastFailedModel}). Please wait a moment or upgrade your Google AI Studio quota.`
      }
    };
  }

  if (status === 404 || rawMsg.includes('NOT_FOUND') || rawMsg.includes('not supported')) {
    return {
      status: 404,
      data: {
        success: false,
        model: lastFailedModel,
        error: `Model "${lastFailedModel}" was not found or is unsupported for this API key.`
      }
    };
  }

  return {
    status: 502,
    data: {
      success: false,
      model: lastFailedModel,
      error: `Failed to connect to Gemini API: ${rawMsg.replace(/key=[^&\s]+/gi, 'key=***')}`
    }
  };
}
