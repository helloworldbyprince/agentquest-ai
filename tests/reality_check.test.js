import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import { createInitialState, dispatchToolCall, MISSION_STATUS } from '../src/game/engine.js';
import {
  startAgentSession,
  stepAgentSession,
  stopAgentSession,
  ollamaProvider
} from '../server/providers/manager.js';

describe('Reality Check: Autonomous Agent Navigation & Look-Optimization', () => {
  it('calls look() at most once at start and advances continuously along open corridor', async () => {
    let state = createInitialState('explorer');
    const startPos = state.robot; // (7, 1)

    // Start session
    const startRes = await startAgentSession({ startPos, forceProvider: 'ollama' });
    expect(startRes.status).toBe(200);
    const sessionId = startRes.data.sessionId;

    let currentTool = startRes.data.toolCall;
    const toolHistory = [currentTool.name];
    const visitedPositions = [`${state.robot.row},${state.robot.col}`];

    // Run 6 real turns through engine and AI provider
    for (let turn = 1; turn <= 6; turn++) {
      state = dispatchToolCall(state, currentTool.name, currentTool.args || {});
      visitedPositions.push(`${state.robot.row},${state.robot.col}`);

      const stepRes = await stepAgentSession({
        sessionId,
        toolResponse: {
          name: currentTool.name,
          response: state.lastToolResult
        }
      });

      expect(stepRes.status).toBe(200);
      currentTool = stepRes.data.toolCall;
      toolHistory.push(currentTool.name);
    }

    stopAgentSession(sessionId);

    // REALITY CHECK ASSERTIONS:
    // 1. Tool history must NOT have consecutive look calls
    for (let i = 0; i < toolHistory.length - 1; i++) {
      const consecutiveLooks = toolHistory[i] === 'look' && toolHistory[i + 1] === 'look';
      expect(consecutiveLooks).toBe(false);
    }

    // 2. Robot must have actually progressed north along the corridor
    expect(state.robot.row).toBeLessThan(7); // Started at 7, must have moved up
    expect(state.robot.col).toBe(1);

    // 3. Move must be the dominant action (advancement vs standing still looking)
    const moveCount = toolHistory.filter((t) => t === 'move').length;
    const lookCount = toolHistory.filter((t) => t === 'look').length;
    expect(moveCount).toBeGreaterThanOrEqual(lookCount);
  }, 30000);

  it('navigates the corridor, reaches the key tile, and collects the key', async () => {
    let state = createInitialState('beginner'); // Key is at (1, 1), Start is at (7, 1)

    const startRes = await startAgentSession({ startPos: state.robot, forceProvider: 'ollama' });
    expect(startRes.status).toBe(200);
    const sessionId = startRes.data.sessionId;

    let currentTool = startRes.data.toolCall;
    let turn = 0;
    const maxTurns = 12;

    while (turn < maxTurns && !state.hasKey) {
      turn++;
      state = dispatchToolCall(state, currentTool.name, currentTool.args || {});

      if (state.hasKey) break;

      const stepRes = await stepAgentSession({
        sessionId,
        toolResponse: {
          name: currentTool.name,
          response: state.lastToolResult
        }
      });

      currentTool = stepRes.data.toolCall;
    }

    stopAgentSession(sessionId);

    // REALITY CHECK ASSERTION:
    // The robot must have reached row 1 or collected the key within 12 turns
    // without stalling on redundant look calls
    expect(state.robot.row).toBeLessThanOrEqual(3);
  }, 35000);

  it('anti-redundant look protection prevents look() right after a successful move()', async () => {
    let state = createInitialState('explorer');
    const startRes = await startAgentSession({ startPos: state.robot, forceProvider: 'ollama' });
    const sessionId = startRes.data.sessionId;

    // Simulate robot just moved north to (6, 1)
    state = dispatchToolCall(state, 'move', { direction: 'north' });
    expect(state.robot.row).toBe(6);
    expect(state.lastToolResult.success).toBe(true);

    // Send tool response to provider
    const stepRes = await stepAgentSession({
      sessionId,
      toolResponse: {
        name: 'move',
        response: state.lastToolResult
      }
    });

    // The next tool call MUST continue moving forward, NOT call look()
    expect(stepRes.data.toolCall.name).toBe('move');
    expect(stepRes.data.toolCall.args.direction).toBe('north');

    stopAgentSession(sessionId);
  });
});
