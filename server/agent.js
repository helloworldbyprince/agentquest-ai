import { GoogleGenAI } from '@google/genai';

export const AGENT_SYSTEM_INSTRUCTION = `You are AgentQuest, a small robot exploring an unknown 9 × 9 maze.

Your mission is to find a key, unlock the locked door, and reach the exit.

You do not know the full maze.

You can interact only through the four available tools.

Explore systematically.

Remember visited positions, discovered walls, and useful observations.

Avoid repeatedly attempting actions that already failed unless circumstances have changed.

Collect the key when you reach it.

Unlock the door when you are adjacent and have the key.

Reach the exit to complete the mission.

After each tool result, decide what action is appropriate next. You MUST call one of the four available tools (look, move, collect, unlock) on every turn until the exit is reached.

Do not claim success unless the game engine confirms it.

If you are unable to progress, report that clearly.`;

export const AGENT_TOOLS_CONFIG = [
  {
    functionDeclarations: [
      {
        name: 'look',
        description: 'Inspect the current tile and the 4 immediate orthogonal surroundings (north, south, east, west). Reveals whether each direction is traversable or blocked.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
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
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'unlock',
        description: 'Unlock the security door. Only succeeds if the robot holds the key and is directly adjacent (north, south, east, or west) to the locked door.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      }
    ]
  }
];

// Active sessions Map: sessionId -> session object
const activeSessions = new Map();

// Auto-cleanup stale sessions older than 30 minutes
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

/**
 * Starts a new autonomous Gemini agent session
 */
export async function startAgentSession({
  apiKey = process.env.GEMINI_API_KEY,
  modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  startPos = { row: 7, col: 1 }
} = {}) {
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    return {
      status: 400,
      data: {
        success: false,
        error: 'GEMINI_API_KEY is not configured on the server. Please check your .env file.'
      }
    };
  }

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const chat = ai.chats.create({
      model: modelName,
      config: {
        systemInstruction: AGENT_SYSTEM_INSTRUCTION,
        tools: AGENT_TOOLS_CONFIG
      }
    });

    const initialPrompt = `Mission started. You are positioned at row ${startPos.row}, column ${startPos.col} in an unknown 9×9 maze. Your mission: Find the key, unlock the locked door, and reach the exit. What tool do you want to call first?`;

    const response = await chat.sendMessage({ message: initialPrompt });

    let toolCall = null;
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      toolCall = {
        name: call.name,
        args: call.args || {}
      };
    } else {
      // Fallback: If model replied with text instead of tool call on turn 1, default to look()
      toolCall = { name: 'look', args: {} };
    }

    const sessionData = {
      sessionId,
      chat,
      modelName,
      actionCount: 1,
      lastActivity: Date.now(),
      history: [{ role: 'agent', toolCall, text: response.text || null }]
    };

    activeSessions.set(sessionId, sessionData);

    return {
      status: 200,
      data: {
        success: true,
        sessionId,
        model: modelName,
        toolCall,
        thought: response.text ? response.text.trim() : null,
        actionCount: 1
      }
    };
  } catch (error) {
    const rawMsg = error?.message || String(error);
    return {
      status: 502,
      data: {
        success: false,
        error: `Failed to initialize Gemini agent session: ${rawMsg.replace(/key=[^&\s]+/gi, 'key=***')}`
      }
    };
  }
}

/**
 * Executes a step in an ongoing Gemini agent session by returning tool result
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
      data: { success: false, error: 'Session not found or expired. Please start a new mission.' }
    };
  }

  // Safety check: max 80 actions
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
      data: { success: false, error: 'Valid toolResponse with name and response payload is required.' }
    };
  }

  session.lastActivity = Date.now();

  try {
    // Construct valid functionResponse part
    const responsePart = {
      functionResponse: {
        name: toolResponse.name,
        response: toolResponse.response || { status: 'completed' }
      }
    };

    const response = await session.chat.sendMessage({
      message: [responsePart]
    });

    session.actionCount += 1;

    let toolCall = null;
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      toolCall = {
        name: call.name,
        args: call.args || {}
      };
    } else if (response.text) {
      // If model returned text without a tool call, send a quick reminder
      const reminderResponse = await session.chat.sendMessage({
        message: 'Observation received. Please select your next tool call (look, move, collect, or unlock).'
      });
      if (reminderResponse.functionCalls && reminderResponse.functionCalls.length > 0) {
        const call = reminderResponse.functionCalls[0];
        toolCall = {
          name: call.name,
          args: call.args || {}
        };
      }
    }

    session.history.push({
      role: 'agent',
      toolCall,
      text: response.text || null
    });

    return {
      status: 200,
      data: {
        success: true,
        sessionId,
        toolCall,
        thought: response.text ? response.text.trim() : null,
        actionCount: session.actionCount
      }
    };
  } catch (error) {
    const rawMsg = error?.message || String(error);
    return {
      status: 502,
      data: {
        success: false,
        error: `Agent step failed: ${rawMsg.replace(/key=[^&\s]+/gi, 'key=***')}`,
        actionCount: session.actionCount
      }
    };
  }
}

/**
 * Stops and clears an agent session
 */
export function stopAgentSession(sessionId) {
  if (sessionId && activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    return { status: 200, data: { success: true, message: 'Session terminated.' } };
  }
  return { status: 200, data: { success: true, message: 'Session not active.' } };
}
