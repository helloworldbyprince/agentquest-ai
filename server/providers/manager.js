import dotenv from 'dotenv';
dotenv.config();

import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { classifyProviderError } from './base.js';

// Global singletons for providers
export const groqProvider = new GroqProvider();
export const geminiProvider = new GeminiProvider();

// Active mission sessions Map: sessionId -> session
const activeSessions = new Map();

// Periodically purge stale sessions (idle > 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      activeSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function getActiveSessionsCount() {
  return activeSessions.size;
}

export function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

/**
 * Tests connection with primary Groq provider and Gemini fallback
 */
export async function testAIConnection({ timeoutMs = 12000 } = {}) {
  let groqError = null;

  // 1. Try Groq (Primary)
  if (groqProvider.isConfigured()) {
    try {
      const groqRes = await groqProvider.testConnection({ timeoutMs });
      if (groqRes.status === 200 && groqRes.data.success) {
        return groqRes;
      }
      groqError = groqRes.data.error;
    } catch (err) {
      groqError = err.message;
    }
  } else {
    groqError = 'GROQ_API_KEY is not configured';
  }

  // 2. Fallback to Gemini
  if (geminiProvider.isConfigured()) {
    console.warn(`[AgentQuest Manager] Groq test connection unavailable (${groqError}). Falling back to Gemini...`);
    const geminiRes = await geminiProvider.testConnection({ timeoutMs });
    if (geminiRes.status === 200 && geminiRes.data.success) {
      geminiRes.data.fallbackFrom = 'groq';
      return geminiRes;
    }
    return geminiRes;
  }

  return {
    status: 400,
    data: {
      success: false,
      error: 'Neither GROQ_API_KEY nor GEMINI_API_KEY is configured on the server. Please check your .env file.'
    }
  };
}

/**
 * Starts a new autonomous AI agent session with Groq primary and Gemini fallback
 */
export async function startAgentSession({
  startPos = { row: 7, col: 1 },
  forceProvider = null,
  modelName = null,
  apiKey = null
} = {}) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  let sessionResult = null;
  let activeProvider = null;
  let fallbackFrom = null;

  // Auto-detect provider if modelName is specified
  if (modelName && modelName.startsWith('gemini')) {
    forceProvider = 'gemini';
  } else if (modelName && (modelName.includes('gpt') || modelName.includes('llama') || modelName.includes('mixtral'))) {
    forceProvider = 'groq';
  }

  // 1. Attempt Groq as Primary
  if (forceProvider === 'gemini' || !groqProvider.isConfigured()) {
    activeProvider = 'gemini';
  } else {
    try {
      sessionResult = await groqProvider.startSession({ startPos });
      activeProvider = 'groq';
    } catch (err) {
      const classification = classifyProviderError(err);
      if (classification.isAuthError) {
        // Fatal Groq auth error
        console.error('[AgentQuest Manager] Groq authentication failed:', classification.message);
      } else {
        console.warn(`[AgentQuest Manager] Groq startSession failed (${classification.message.slice(0, 100)}). Falling back to Gemini...`);
      }
      fallbackFrom = 'groq';
      activeProvider = 'gemini';
    }
  }

  // 2. Fallback to Gemini if Groq failed or was bypassed
  if (activeProvider === 'gemini') {
    if (!geminiProvider.isConfigured()) {
      return {
        status: 400,
        data: {
          success: false,
          error: 'Gemini fallback is unavailable: GEMINI_API_KEY is not configured in .env.'
        }
      };
    }

    try {
      sessionResult = await geminiProvider.startSession({ startPos, modelName });
    } catch (geminiErr) {
      const classification = classifyProviderError(geminiErr);
      return {
        status: 502,
        data: {
          success: false,
          allProvidersUnavailable: true,
          error: `All AI providers failed to initialize. Groq (${fallbackFrom ? 'fallback triggered' : 'not used'}), Gemini: ${classification.message}`
        }
      };
    }
  }

  // 3. Store Authoritative Session State
  const sessionData = {
    sessionId,
    startPos,
    activeProvider,
    activeModel: sessionResult.model,
    actionCount: 1,
    lastActivity: Date.now(),
    providerRequests: {
      groq: activeProvider === 'groq' ? 1 : 0,
      gemini: activeProvider === 'gemini' ? 1 : 0
    },
    authoritativeHistory: [],
    lastToolCall: sessionResult.toolCall,
    groqSession: activeProvider === 'groq'
      ? { messages: sessionResult.messages, lastCallId: sessionResult.rawCallId }
      : null,
    geminiSession: activeProvider === 'gemini'
      ? { chat: sessionResult.chat, model: sessionResult.model }
      : null
  };

  activeSessions.set(sessionId, sessionData);

  return {
    status: 200,
    data: {
      success: true,
      sessionId,
      provider: activeProvider,
      model: sessionResult.model,
      fallbackFrom: fallbackFrom ? 'Groq' : sessionResult.fallbackFrom || undefined,
      toolCall: sessionResult.toolCall,
      thought: sessionResult.thought,
      actionCount: 1
    }
  };
}

/**
 * Steps the autonomous agent mission by sending the authoritative engine result
 * to the active provider, with automatic mid-mission migration if rate limits occur.
 */
export async function stepAgentSession({
  sessionId,
  toolResponse
} = {}) {
  if (!sessionId) {
    return {
      status: 400,
      data: { success: false, error: 'sessionId is required.' }
    };
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    return {
      status: 404,
      data: { success: false, error: 'Session not found or expired. Please start a fresh mission.' }
    };
  }

  // Safety limit: max 80 actions
  if (session.actionCount >= 80) {
    return {
      status: 200,
      data: {
        success: false,
        limitReached: true,
        error: 'Safety limit of 80 tool calls reached for this mission.',
        actionCount: session.actionCount
      }
    };
  }

  if (!toolResponse || !toolResponse.name) {
    return {
      status: 400,
      data: { success: false, error: 'Valid toolResponse is required.' }
    };
  }

  session.lastActivity = Date.now();

  // 1. Record completed action into authoritative history ledger
  session.authoritativeHistory.push({
    turn: session.actionCount,
    action: session.lastToolCall,
    result: toolResponse.response,
    provider: session.activeProvider,
    model: session.activeModel,
    timestamp: Date.now()
  });

  let stepResult = null;
  let fallbackOccurred = false;
  let previousProvider = null;

  // 2. Execute on Active Provider: GROQ
  if (session.activeProvider === 'groq') {
    try {
      stepResult = await groqProvider.stepSession({
        messages: session.groqSession.messages,
        toolResponse,
        lastCallId: session.groqSession.lastCallId
      });
      session.providerRequests.groq += 1;
      session.groqSession.lastCallId = stepResult.rawCallId;
    } catch (groqErr) {
      const classification = classifyProviderError(groqErr);

      if (classification.isFallbackable && geminiProvider.isConfigured()) {
        console.warn(`[AgentQuest Manager] Mid-mission Groq step failed (${classification.message.slice(0, 100)}). Migrating mission to Gemini...`);
        previousProvider = 'Groq';

        try {
          // Reconstruct pristine Gemini chat from authoritative history
          const { chat, model } = await geminiProvider.reconstructChat({
            startPos: session.startPos,
            authoritativeHistory: session.authoritativeHistory
          });

          // Step Gemini with the pending tool response
          stepResult = await geminiProvider.stepSession({
            chat,
            toolResponse,
            activeModel: model
          });

          // Stick with Gemini for the remainder of this mission
          session.activeProvider = 'gemini';
          session.activeModel = model;
          session.geminiSession = { chat: stepResult.chat, model };
          session.groqSession = null;
          session.providerRequests.gemini += 1;
          fallbackOccurred = true;
          console.log(`[AgentQuest Manager] Mission successfully migrated to Gemini (${model})!`);
        } catch (migrationErr) {
          console.error('[AgentQuest Manager] Fallback to Gemini also failed:', migrationErr.message);
          if (session.authoritativeHistory.length > 0) {
            session.authoritativeHistory.pop();
          }
          return {
            status: 503,
            data: {
              success: false,
              allProvidersUnavailable: true,
              error: 'All AI providers are temporarily unavailable. Your mission is safely paused.',
              actionCount: session.actionCount
            }
          };
        }
      } else {
        return {
          status: classification.status,
          data: {
            success: false,
            error: `Groq agent step failed: ${classification.message}`,
            actionCount: session.actionCount
          }
        };
      }
    }
  }
  // 3. Execute on Active Provider: GEMINI
  else if (session.activeProvider === 'gemini') {
    try {
      stepResult = await geminiProvider.stepSession({
        chat: session.geminiSession.chat,
        toolResponse,
        activeModel: session.geminiSession.model
      });
      session.providerRequests.gemini += 1;
    } catch (geminiErr) {
      const classification = classifyProviderError(geminiErr);

      if (classification.isFallbackable) {
        console.warn(`[AgentQuest Manager] Gemini step failed (${classification.message.slice(0, 100)}). Trying alternate Gemini models...`);
        try {
          const { chat, model } = await geminiProvider.reconstructChat({
            startPos: session.startPos,
            authoritativeHistory: session.authoritativeHistory
          });

          stepResult = await geminiProvider.stepSession({
            chat,
            toolResponse,
            activeModel: model
          });

          session.activeModel = model;
          session.geminiSession = { chat: stepResult.chat, model };
          session.providerRequests.gemini += 1;
          fallbackOccurred = true;
        } catch (secondaryErr) {
          if (session.authoritativeHistory.length > 0) {
            session.authoritativeHistory.pop();
          }
          return {
            status: 503,
            data: {
              success: false,
              allProvidersUnavailable: true,
              error: 'All AI providers are temporarily unavailable. Your mission is safely paused.',
              actionCount: session.actionCount
            }
          };
        }
      } else {
        return {
          status: classification.status,
          data: {
            success: false,
            error: `Gemini agent step failed: ${classification.message}`,
            actionCount: session.actionCount
          }
        };
      }
    }
  }

  // 4. Update session state
  session.actionCount += 1;
  session.lastToolCall = stepResult.toolCall;

  return {
    status: 200,
    data: {
      success: true,
      sessionId,
      provider: session.activeProvider,
      model: session.activeModel,
      fallbackOccurred,
      previousProvider,
      toolCall: stepResult.toolCall,
      thought: stepResult.thought,
      actionCount: session.actionCount,
      providerRequests: session.providerRequests
    }
  };
}

/**
 * Stops an active session and frees memory
 */
export function stopAgentSession(sessionId) {
  if (sessionId && activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    return { status: 200, data: { success: true, message: 'Session terminated.' } };
  }
  return { status: 200, data: { success: true, message: 'Session not active.' } };
}
