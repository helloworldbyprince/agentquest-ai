import dotenv from 'dotenv';
dotenv.config();

import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider, defaultOllamaProvider } from './ollama.js';
import { classifyProviderError } from './base.js';

// Global singletons for providers
export const ollamaProvider = defaultOllamaProvider;
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
 * Tests connection with available AI providers (Priority: Local Ollama → Groq → Gemini)
 */
export async function testAIConnection({ timeoutMs = 8000 } = {}) {
  // 1. Try Local Ollama (Preferred if running)
  if (await ollamaProvider.isAvailable()) {
    try {
      const ollamaRes = await ollamaProvider.testConnection({ timeoutMs: Math.min(timeoutMs, 4000) });
      if (ollamaRes.status === 200 && ollamaRes.data.success) {
        return ollamaRes;
      }
    } catch (_) {}
  }

  let groqError = null;

  // 2. Try Groq
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

  // 3. Fallback to Gemini
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
      error: 'No AI providers available. Start Ollama ("ollama serve") or configure GROQ_API_KEY / GEMINI_API_KEY.'
    }
  };
}

/**
 * Starts a new autonomous AI agent session with Groq primary and Gemini fallback
 */
export async function startAgentSession({
  sessionId: customSessionId = null,
  startPos = { row: 7, col: 1 },
  forceProvider = null,
  modelName = null,
  apiKey = null
} = {}) {
  const sessionId = customSessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  let sessionResult = null;
  let activeProvider = null;
  let fallbackFrom = null;

  // Auto-detect provider if modelName is specified
  if (modelName && modelName.startsWith('gemini')) {
    forceProvider = 'gemini';
  } else if (modelName && (modelName.includes('gpt') || modelName.includes('llama') || modelName.includes('mixtral'))) {
    forceProvider = 'groq';
  } else if (modelName && (modelName.includes('qwen') || modelName.includes('ollama'))) {
    forceProvider = 'ollama';
  }

  // 1. Attempt Local Ollama (Preferred if available or explicitly requested)
  const isOllamaPreferred = forceProvider === 'ollama' || (!forceProvider && await ollamaProvider.isAvailable());
  if (isOllamaPreferred && forceProvider !== 'groq' && forceProvider !== 'gemini') {
    try {
      sessionResult = await ollamaProvider.startSession({ startPos });
      activeProvider = 'ollama';
    } catch (ollamaErr) {
      console.warn(`[AgentQuest Manager] Local Ollama startSession failed: ${ollamaErr.message}. Falling back to Groq...`);
      fallbackFrom = 'ollama';
      activeProvider = null;
    }
  }

  // 2. Attempt Groq as Secondary (or Primary if Ollama not used)
  if (!activeProvider && forceProvider !== 'gemini' && groqProvider.isConfigured()) {
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
      fallbackFrom = fallbackFrom || 'groq';
      activeProvider = 'gemini';
    }
  }

  // 3. Fallback to Gemini if Ollama/Groq failed or was bypassed
  if (!activeProvider || activeProvider === 'gemini') {
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
      activeProvider = 'gemini';
    } catch (geminiErr) {
      const classification = classifyProviderError(geminiErr);
      return {
        status: 502,
        data: {
          success: false,
          allProvidersUnavailable: true,
          error: `All AI providers failed to initialize. Prior attempts: (${fallbackFrom || 'none'}), Gemini: ${classification.message}`
        }
      };
    }
  }

  // 4. Store Authoritative Session State
  const startCoord = `${startPos.row},${startPos.col}`;
  const sessionData = {
    sessionId,
    startPos,
    currentPos: { row: startPos.row, col: startPos.col },
    activeProvider,
    activeModel: sessionResult.model,
    actionCount: 1,
    apiRequestsCount: 1,
    maxActionBudget: 100,
    maxApiBudget: 120,
    lastActivity: Date.now(),
    providerRequests: {
      ollama: activeProvider === 'ollama' ? 1 : 0,
      groq: activeProvider === 'groq' ? 1 : 0,
      gemini: activeProvider === 'gemini' ? 1 : 0
    },
    visitedPositions: new Set([startCoord]),
    discoveredWalls: new Set(),
    recentActions: [],
    repeatedBlockedCount: 0,
    authoritativeHistory: [],
    lastToolCall: sessionResult.toolCall,
    ollamaSession: activeProvider === 'ollama'
      ? { messages: sessionResult.messages }
      : null,
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
      fallbackFrom: fallbackFrom ? (fallbackFrom.toLowerCase() === 'ollama' ? 'Ollama' : 'Groq') : sessionResult.fallbackFrom || undefined,
      toolCall: sessionResult.toolCall,
      thought: sessionResult.thought,
      actionCount: 1,
      maxActionBudget: sessionData.maxActionBudget
    }
  };
}

/**
 * Factual exploration helper: tracks visited positions and discovered walls,
 * detects repeated unproductive loops, and provides compact factual guidance
 * without revealing hidden maze tiles.
 */
function enrichToolResponse(session, toolResponse) {
  const rawResp = toolResponse.response || {};
  const obs = rawResp.observation || {};
  const toolName = toolResponse.name;

  // Track robot coordinates
  if (obs.position) {
    session.currentPos = { row: obs.position.row, col: obs.position.col };
    session.visitedPositions.add(`${obs.position.row},${obs.position.col}`);
  }

  // Track discovered walls from blocked moves
  if (obs.blockedReason === 'wall' && obs.target) {
    session.discoveredWalls.add(`${obs.target.row},${obs.target.col}`);
  }

  // Track discovered walls from look() observations
  if (toolName === 'look' && obs.surroundings) {
    for (const [, info] of Object.entries(obs.surroundings)) {
      if (info && info.type === 'wall' && info.row !== undefined && info.col !== undefined) {
        session.discoveredWalls.add(`${info.row},${info.col}`);
      }
    }
  }

  // Detect repeated unproductive action from the same position
  let isRepeatedBlocked = false;
  const lastAction = session.recentActions[session.recentActions.length - 1];

  if (
    !rawResp.success &&
    lastAction &&
    !lastAction.success &&
    toolName === lastAction.tool &&
    (
      (obs.facing && lastAction.facing && obs.facing === lastAction.facing) ||
      (obs.target && lastAction.target && obs.target.row === lastAction.target.row && obs.target.col === lastAction.target.col) ||
      toolName === 'look'
    )
  ) {
    isRepeatedBlocked = true;
    session.repeatedBlockedCount = (session.repeatedBlockedCount || 0) + 1;
  } else {
    session.repeatedBlockedCount = 0;
  }

  session.recentActions.push({
    tool: toolName,
    facing: obs.facing || null,
    target: obs.target || null,
    args: session.lastToolCall?.args || {},
    success: Boolean(rawResp.success),
    blockedReason: obs.blockedReason || null
  });
  if (session.recentActions.length > 8) session.recentActions.shift();

  const curr = session.currentPos || session.startPos || { row: 7, col: 1 };

  // Factual exploration summary for session memory
  const enriched = {
    ...rawResp,
    explorationSummary: {
      currentPosition: curr,
      totalVisitedTiles: session.visitedPositions.size,
      discoveredWallsCount: session.discoveredWalls.size
    }
  };

  if (rawResp.success === false) {
    if (isRepeatedBlocked) {
      enriched.warning = `REPEATED UNPRODUCTIVE ACTION: Attempting "${toolName}" was blocked again. Do NOT repeat this blocked move. You remain safely at (${curr.row}, ${curr.col}). Choose an alternate open direction (north, south, east, west) or call look().`;
    } else if (obs.blockedReason === 'wall') {
      enriched.guidance = `Movement blocked by wall at (${obs.target?.row ?? '?'}, ${obs.target?.col ?? '?'}). You remain safely at (${curr.row}, ${curr.col}). Discovered wall recorded. Choose an alternate open direction or call look().`;
    } else if (obs.blockedReason === 'locked_door') {
      enriched.guidance = `Door at (${obs.target?.row ?? '?'}, ${obs.target?.col ?? '?'}) is locked. You must find and collect the golden key first, then call unlock() while adjacent.`;
    }
  } else if (toolName === 'look' && session.recentActions.length >= 2) {
    const prev = session.recentActions[session.recentActions.length - 2];
    if (prev && prev.tool === 'look') {
      enriched.guidance = `Surroundings at (${curr.row}, ${curr.col}) are already observed. Do NOT call look() again. Call move() in an open direction now.`;
    }
  }

  return {
    ...toolResponse,
    response: enriched
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
  session.apiRequestsCount = (session.apiRequestsCount || 0) + 1;

  // 1. Enrich tool response with session exploration memory (without revealing full maze)
  const enrichedToolResponse = enrichToolResponse(session, toolResponse);

  // 2. Record completed action into authoritative history ledger
  session.authoritativeHistory.push({
    turn: session.actionCount,
    action: session.lastToolCall,
    result: enrichedToolResponse.response,
    provider: session.activeProvider,
    model: session.activeModel,
    timestamp: Date.now()
  });

  let stepResult = null;
  let fallbackOccurred = false;
  let previousProvider = null;

  // 3. Execute on Active Provider: OLLAMA
  if (session.activeProvider === 'ollama') {
    try {
      stepResult = await ollamaProvider.stepSession({
        messages: session.ollamaSession.messages,
        toolResponse: enrichedToolResponse
      });
      session.providerRequests.ollama = (session.providerRequests.ollama || 0) + 1;
      session.ollamaSession.messages = stepResult.messages;
    } catch (ollamaErr) {
      console.warn(`[AgentQuest Manager] Local Ollama step failed: ${ollamaErr.message}. Attempting cloud failover...`);
      previousProvider = 'Local AI (Ollama)';

      // Attempt failover to Groq
      if (groqProvider.isConfigured()) {
        try {
          const messages = groqProvider.reconstructMessages({
            startPos: session.startPos,
            authoritativeHistory: session.authoritativeHistory
          });
          stepResult = await groqProvider.stepSession({
            messages,
            toolResponse: enrichedToolResponse
          });
          session.activeProvider = 'groq';
          session.activeModel = groqProvider.getModelName();
          session.groqSession = { messages: stepResult.messages, lastCallId: stepResult.rawCallId };
          session.ollamaSession = null;
          session.providerRequests.groq = (session.providerRequests.groq || 0) + 1;
          fallbackOccurred = true;
          console.log('[AgentQuest Manager] Mission migrated from Ollama to Groq!');
        } catch (_) {}
      }

      // If Groq unavailable/failed, attempt Gemini
      if (!stepResult && geminiProvider.isConfigured()) {
        try {
          const { chat, model } = await geminiProvider.reconstructChat({
            startPos: session.startPos,
            authoritativeHistory: session.authoritativeHistory
          });
          stepResult = await geminiProvider.stepSession({
            chat,
            toolResponse: enrichedToolResponse,
            activeModel: model
          });
          session.activeProvider = 'gemini';
          session.activeModel = model;
          session.geminiSession = { chat: stepResult.chat, model };
          session.ollamaSession = null;
          session.providerRequests.gemini = (session.providerRequests.gemini || 0) + 1;
          fallbackOccurred = true;
          console.log('[AgentQuest Manager] Mission migrated from Ollama to Gemini!');
        } catch (_) {}
      }

      if (!stepResult) {
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
    }
  }
  // 4. Execute on Active Provider: GROQ
  else if (session.activeProvider === 'groq') {
    try {
      stepResult = await groqProvider.stepSession({
        messages: session.groqSession.messages,
        toolResponse: enrichedToolResponse,
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
            toolResponse: enrichedToolResponse,
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
  // 4. Execute on Active Provider: GEMINI
  else if (session.activeProvider === 'gemini') {
    try {
      stepResult = await geminiProvider.stepSession({
        chat: session.geminiSession.chat,
        toolResponse: enrichedToolResponse,
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
            toolResponse: enrichedToolResponse,
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

  // Universal Anti-Looping Protection:
  // If the agent returned look() immediately after a look() from the same position,
  // prevent infinite stationary look loops by advancing into an open corridor.
  if (
    stepResult.toolCall?.name === 'look' &&
    enrichedToolResponse.name === 'look' &&
    enrichedToolResponse.response?.observation?.surroundings
  ) {
    const surroundings = enrichedToolResponse.response.observation.surroundings;
    const openDirs = Object.entries(surroundings)
      .filter(([_, info]) => info && info.traversable)
      .map(([dir]) => dir);

    if (openDirs.length > 0) {
      // Pick an open direction (preferring unvisited tiles)
      const unvisited = openDirs.filter((d) => {
        const delta = { north: [-1, 0], south: [1, 0], east: [0, 1], west: [0, -1] }[d];
        const nextR = (session.currentPos?.row ?? 7) + delta[0];
        const nextC = (session.currentPos?.col ?? 1) + delta[1];
        return !session.visitedPositions.has(`${nextR},${nextC}`);
      });
      const chosenDir = unvisited.length > 0 ? unvisited[0] : openDirs[0];
      stepResult.toolCall = {
        name: 'move',
        args: { direction: chosenDir }
      };
      stepResult.thought = `Surroundings already inspected. Advancing ${chosenDir} into open corridor.`;
    }
  }

  // 5. Update session state
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
      apiRequestsCount: session.apiRequestsCount,
      discoveredWallsCount: session.discoveredWalls.size,
      visitedPositionsCount: session.visitedPositions.size,
      repeatedBlockedCount: session.repeatedBlockedCount,
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
