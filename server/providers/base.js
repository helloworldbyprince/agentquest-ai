/**
 * Base AI Provider definitions, error classification, tool definitions, and system prompts.
 */

export const AGENT_SYSTEM_INSTRUCTION = `You are AgentQuest, an intelligent exploration robot in an unknown 9 × 9 maze.

Your ultimate objective is:
1. Find and collect the Golden Key.
2. Navigate to and unlock the Locked Door with the key.
3. Reach the Exit portal to escape.

CRITICAL EXPLORATION RULES:
- You do NOT know the full maze. You discover the environment through actual tool observations.
- Available tools: look(), move(direction), collect(), unlock().
- Facing a wall or locked door is NORMAL, EXPECTED FEEDBACK in maze exploration. It is NOT a mission failure.
- When a move is blocked, you remain safely in your current tile. Never surrender, never give up, and NEVER say "I am unable to progress".
- When blocked by a wall or obstacle:
  1. Note that the attempted direction is impassable.
  2. Choose an unexplored or alternative direction (north, south, east, west) to navigate around the obstacle.
  3. Or call look() to inspect your immediate orthogonal surroundings.
- Never repeatedly attempt an action that just failed. If moving in a direction was blocked, choose a DIFFERENT direction immediately.
- If you hit a dead end, backtrack through visited corridors toward unexplored branches.
- When standing on the Key tile, call collect().
- When adjacent to the locked Door and holding the key, call unlock().
- You MUST call one of the four available tools on EVERY turn. Never output conversational text without an actionable tool call.
- The ONLY allowed tool names are strictly: look, move, collect, unlock. Do NOT append any extra tokens or commentary to function names.`;

export const GROQ_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'look',
      description: 'Inspect the current tile and the 4 immediate orthogonal surroundings (north, south, east, west). Reveals whether each direction is traversable or blocked.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move',
      description: 'Move the robot exactly one tile in an orthogonal direction (north, south, east, or west). Movement will fail if blocked by a wall or locked door.',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['north', 'south', 'east', 'west'],
            description: 'The orthogonal direction to move.'
          }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'collect',
      description: 'Collect the golden key. Only succeeds if the robot is currently standing on the key tile.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unlock',
      description: 'Unlock the security door. Only succeeds if the robot holds the key and is directly adjacent (north, south, east, or west) to the locked door.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

export const GEMINI_TOOLS_CONFIG = [
  {
    functionDeclarations: [
      {
        name: 'look',
        description: 'Inspect the current tile and the 4 immediate orthogonal surroundings (north, south, east, west). Reveals whether each direction is traversable or blocked.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'move',
        description: 'Move the robot exactly one tile in an orthogonal direction (north, south, east, or west). Movement will fail if blocked by a wall or locked door.',
        parameters: {
          type: 'OBJECT',
          properties: {
            direction: {
              type: 'STRING',
              description: 'The orthogonal direction to move.',
              enum: ['north', 'south', 'east', 'west']
            }
          },
          required: ['direction']
        }
      },
      {
        name: 'collect',
        description: 'Collect the golden key. Only succeeds if the robot is currently standing on the key tile.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'unlock',
        description: 'Unlock the security door. Only succeeds if the robot holds the key and is directly adjacent (north, south, east, or west) to the locked door.',
        parameters: { type: 'OBJECT', properties: {} }
      }
    ]
  }
];

/**
 * Classifies an error into:
 * - isFallbackable: true if error is rate limit (429), server error (500/502/503/504), timeout, or model unavailable.
 * - isAuthError: true if error is invalid credentials or missing key (fatal, should NOT retry).
 */
export function classifyProviderError(error) {
  if (!error) return { isFallbackable: false, isAuthError: false, message: 'Unknown error' };

  const status = error.status || error.code || error.statusCode;
  const rawMsg = error.message || String(error);

  const isAuthError =
    status === 401 ||
    status === 403 ||
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('API key not valid') ||
    rawMsg.includes('invalid_api_key') ||
    rawMsg.includes('Invalid API Key') ||
    rawMsg.includes('PERMISSION_DENIED') ||
    rawMsg.includes('unregistered project');

  if (isAuthError) {
    return {
      isFallbackable: false,
      isAuthError: true,
      status: 401,
      message: 'Authentication failed. Please verify API credentials in .env.'
    };
  }

  const isFallbackable =
    status === 429 ||
    status === 404 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    rawMsg === 'REQUEST_TIMEOUT' ||
    rawMsg === 'TIMEOUT' ||
    rawMsg.includes('RESOURCE_EXHAUSTED') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('Quota') ||
    rawMsg.includes('rate limit') ||
    rawMsg.includes('rate_limit_exceeded') ||
    rawMsg.includes('Rate limit') ||
    rawMsg.includes('NOT_FOUND') ||
    rawMsg.includes('not supported') ||
    rawMsg.includes('model_not_found') ||
    rawMsg.includes('tool_use_failed') ||
    rawMsg.includes('Tool call validation failed') ||
    rawMsg.includes('overloaded') ||
    rawMsg.includes('experiencing high demand') ||
    rawMsg.includes('temporarily unavailable') ||
    rawMsg.includes('ECONNRESET') ||
    rawMsg.includes('ETIMEDOUT') ||
    rawMsg.includes('fetch failed');

  return {
    isFallbackable,
    isAuthError: false,
    status: status || 500,
    message: rawMsg
  };
}

/**
 * Normalizes tool call argument outputs across OpenAI / Groq and Gemini SDKs
 */
export function normalizeToolCall(name, rawArgs) {
  let args = {};
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs);
    } catch (_) {
      args = {};
    }
  } else if (rawArgs && typeof rawArgs === 'object') {
    args = rawArgs;
  }
  return {
    name,
    args
  };
}
