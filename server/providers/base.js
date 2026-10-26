/**
 * Base AI Provider definitions, error classification, tool definitions, and system prompts.
 */

export const AGENT_SYSTEM_INSTRUCTION = `You are AgentQuest, a small robot exploring an unknown 9 × 9 maze.

Your mission is to find a key, unlock the locked door, and reach the exit.

You do not know the full maze.

You can interact only through the four available tools: look, move, collect, unlock.

Explore systematically.

Remember visited positions, discovered walls, and useful observations.

Avoid repeatedly attempting actions that already failed unless circumstances have changed.

Collect the key when you reach it.

Unlock the door when you are adjacent and have the key.

Reach the exit to complete the mission.

After each tool result, decide what action is appropriate next. You MUST call one of the four available tools (look, move, collect, unlock) on every turn until the exit is reached.

The only tool names you can call are strictly: look, move, collect, unlock. NEVER append any suffixes, commentary, channels, or extra tokens to the function name.

Do not claim success unless the game engine confirms it.

If you are unable to progress, report that clearly.`;

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
