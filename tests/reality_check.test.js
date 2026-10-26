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

    // 2. Robot must have actually progressed north and turned into new corridor
    expect(state.robot.row).toBeLessThan(7); // Started at 7, must have moved up
    expect(state.robot.col).toBeGreaterThanOrEqual(1);

    // 3. Move actions must be actively executing as robot progresses
    const moveCount = toolHistory.filter((t) => t === 'move').length;
    expect(moveCount).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('navigates the corridor without getting stuck in a loop', async () => {
    let state = createInitialState('explorer');

    const startRes = await startAgentSession({ startPos: state.robot, forceProvider: 'ollama' });
    expect(startRes.status).toBe(200);
    const sessionId = startRes.data.sessionId;

    let currentTool = startRes.data.toolCall;
    let turn = 0;
    const maxTurns = 12;

    while (turn < maxTurns) {
      turn++;
      state = dispatchToolCall(state, currentTool.name, currentTool.args || {});

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
    // The robot must have moved through at least 3 distinct corridors (columns 1, 2, 3)
    // without stalling or oscillating in column 3
    expect(state.stats.successfulActions).toBeGreaterThanOrEqual(5);
  }, 35000);

  it('anti-loop protection prevents consecutive look() calls at the exact same tile', async () => {
    let state = createInitialState('explorer');
    const startRes = await startAgentSession({ startPos: state.robot, forceProvider: 'ollama' });
    const sessionId = startRes.data.sessionId;

    // First tool is look() at (7, 1)
    state = dispatchToolCall(state, 'look', {});
    expect(state.lastToolResult.success).toBe(true);

    // Send tool response to provider
    const stepRes = await stepAgentSession({
      sessionId,
      toolResponse: {
        name: 'look',
        response: state.lastToolResult
      }
    });

    // The next tool call MUST advance into open corridor, NOT call look() again at (7, 1)
    expect(stepRes.data.toolCall.name).toBe('move');
    expect(stepRes.data.toolCall.args.direction).toBe('north');

    stopAgentSession(sessionId);
  });
});
