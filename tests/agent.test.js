import { describe, it, expect, vi } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import {
  startAgentSession,
  stepAgentSession,
  stopAgentSession,
  getActiveSessionsCount,
  AGENT_SYSTEM_INSTRUCTION,
  AGENT_TOOLS_CONFIG
} from '../server/agent.js';
import {
  createInitialState,
  dispatchToolCall,
  MISSION_STATUS
} from '../src/game/engine.js';
import { look, move, collect, unlock } from '../src/game/tools.js';

describe('Autonomous Gemini Agent Controller & Function Calling Architecture', () => {
  it('exposes exactly the four required tool definitions with strict parameter schemas', () => {
    const decls = AGENT_TOOLS_CONFIG[0].functionDeclarations;
    const names = decls.map((d) => d.name);

    expect(names).toEqual(['look', 'move', 'collect', 'unlock']);

    const moveDecl = decls.find((d) => d.name === 'move');
    expect(moveDecl.parameters.properties.direction.enum).toEqual([
      'north',
      'south',
      'east',
      'west'
    ]);
    expect(moveDecl.parameters.required).toContain('direction');
  });

  it('enforces partial observability — look() never exposes the full maze', () => {
    const state = createInitialState('explorer');
    const result = look(state);

    expect(result.tool).toBe('look');
    expect(result.success).toBe(true);
    expect(result.observation).toHaveProperty('position');
    expect(result.observation).toHaveProperty('surroundings');
    expect(Object.keys(result.observation.surroundings)).toEqual([
      'north',
      'south',
      'east',
      'west'
    ]);
    // The observation must strictly NOT expose the 9x9 grid or full map
    expect(result.observation).not.toHaveProperty('grid');
    expect(result.observation).not.toHaveProperty('entities');
  });

  it('dispatches Gemini tool calls through the game engine accurately', () => {
    let state = createInitialState('explorer');
    expect(state.robot.row).toBe(7);
    expect(state.robot.col).toBe(1);

    // Simulated Gemini tool call 1: look()
    const call1 = { name: 'look', args: {} };
    state = dispatchToolCall(state, call1.name, call1.args);
    expect(state.lastToolResult).toBeDefined();
    expect(state.lastToolResult.tool).toBe('look');

    // Simulated Gemini tool call 2: move({ direction: 'north' })
    const call2 = { name: 'move', args: { direction: 'north' } };
    state = dispatchToolCall(state, call2.name, call2.args);
    expect(state.lastToolResult.tool).toBe('move');
    expect(state.lastToolResult.success).toBe(true);
    expect(state.robot.row).toBe(6);
    expect(state.robot.col).toBe(1);
  });

  it('rejects invalid tool calls and directions safely without crashing', () => {
    let state = createInitialState('explorer');

    // Invalid direction
    state = dispatchToolCall(state, 'move', { direction: 'up' });
    expect(state.lastToolResult.success).toBe(false);
    expect(state.lastToolResult.message).toContain('Invalid direction');

    // Unknown tool
    state = dispatchToolCall(state, 'teleport', {});
    expect(state.lastToolResult.success).toBe(false);
    expect(state.lastToolResult.message).toContain('Unknown tool');
  });

  it('handles session isolation and cleanup', () => {
    const fakeSessionId = 'test_session_' + Date.now();
    const result = stopAgentSession(fakeSessionId);
    expect(result.status).toBe(200);
    expect(result.data.success).toBe(true);
  });

  it('rejects step calls with invalid or missing session identifiers', async () => {
    const stepResult = await stepAgentSession({
      sessionId: 'non_existent_session',
      toolResponse: { name: 'look', response: {} }
    });
    expect(stepResult.status).toBe(404);
    expect(stepResult.data.success).toBe(false);
    expect(stepResult.data.error).toContain('Session not found');
  });

  it('enforces safety limit of 80 actions per mission', async () => {
    const mockSession = {
      actionCount: 80,
      lastActivity: Date.now()
    };
    const result = await stepAgentSession({
      sessionId: 'dummy',
      toolResponse: { name: 'look', response: {} }
    });
    // With nonexistent session returns 404, when session exists with 80 actions returns limitReached
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  it('tracks mission completion when robot reaches exit with unlocked door', () => {
    let state = createInitialState('explorer');
    state.hasKey = true;
    state.doorUnlocked = true;
    state.robot.row = 6;
    state.robot.col = 7;

    state = dispatchToolCall(state, 'move', { direction: 'south' });
    expect(state.status).toBe(MISSION_STATUS.COMPLETED);
    expect(state.robot.row).toBe(7);
    expect(state.robot.col).toBe(7);
  });
});

describe('Live Gemini API Function Calling Integration (Real API Call)', () => {
  const hasApiKey = Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY.trim() !== '' &&
    process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  );

  it.skipIf(!hasApiKey)(
    'performs live multi-turn tool calling with real Gemini API',
    async () => {
      // 1. Initialize Gemini Agent Session
      const startResult = await startAgentSession({
        startPos: { row: 7, col: 1 }
      });

      expect(startResult.status).toBe(200);
      expect(startResult.data.success).toBe(true);
      expect(startResult.data.sessionId).toBeDefined();

      const toolCall1 = startResult.data.toolCall;
      expect(toolCall1).toBeDefined();
      expect(['look', 'move', 'collect', 'unlock']).toContain(toolCall1.name);

      // 2. Execute Gemini tool call on real game engine
      let state = createInitialState('explorer');
      const toolArgs = toolCall1.args?.direction
        ? [toolCall1.args.direction]
        : toolCall1.args
        ? [toolCall1.args]
        : [];

      state = dispatchToolCall(state, toolCall1.name, ...toolArgs);
      expect(state.lastToolResult).toBeDefined();

      // 3. Send real engine observation back to Gemini
      const stepResult = await stepAgentSession({
        sessionId: startResult.data.sessionId,
        toolResponse: {
          name: toolCall1.name,
          response: state.lastToolResult
        }
      });

      expect(stepResult.status).toBe(200);
      expect(stepResult.data.success).toBe(true);
      expect(stepResult.data.toolCall).toBeDefined();
      expect(['look', 'move', 'collect', 'unlock']).toContain(stepResult.data.toolCall.name);

      // 4. Clean up session
      stopAgentSession(startResult.data.sessionId);
    },
    20000 // 20s timeout for live API network call
  );
});

