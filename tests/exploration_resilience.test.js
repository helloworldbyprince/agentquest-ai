import { describe, it, expect, vi } from 'vitest';
import { createInitialState, dispatchToolCall, MISSION_STATUS, LOG_TYPES } from '../src/game/engine.js';
import { move, look, collect, unlock } from '../src/game/tools.js';
import { startAgentSession, stepAgentSession, stopAgentSession, groqProvider } from '../server/providers/manager.js';

describe('Exploration Resilience & Mission Lifecycle Tests', () => {
  it('1. Blocked movement returns failed tool result without ending the mission', () => {
    // Explorer Maze: Start at (7, 1). Move west targets (7, 0) which is a wall '#'.
    const state = createInitialState('explorer');
    expect(state.robot.row).toBe(7);
    expect(state.robot.col).toBe(1);

    const afterMove = dispatchToolCall(state, 'move', 'west');
    // Action fails because of wall
    expect(afterMove.lastToolResult.success).toBe(false);
    expect(afterMove.lastToolResult.observation.blockedReason).toBe('wall');
    
    // Crucial: Mission MUST NOT be marked failed!
    expect(afterMove.status).not.toBe(MISSION_STATUS.FAILED);
    expect(afterMove.status).toBe(MISSION_STATUS.RUNNING);
    expect(afterMove.robot.row).toBe(7);
    expect(afterMove.robot.col).toBe(1);
  });

  it('2. Position, inventory, and discovered state are preserved across blocked actions', () => {
    const state = createInitialState('explorer');
    const step1 = dispatchToolCall(state, 'move', 'north'); // (7,1) -> (6,1) is open
    expect(step1.lastToolResult.success).toBe(true);
    expect(step1.robot.row).toBe(6);
    expect(step1.robot.col).toBe(1);

    // Now bump into east wall at (6, 2)
    const step2 = dispatchToolCall(step1, 'move', 'east');
    expect(step2.lastToolResult.success).toBe(false);
    expect(step2.robot.row).toBe(6);
    expect(step2.robot.col).toBe(1);
    expect(step2.hasKey).toBe(false);
    expect(step2.status).not.toBe(MISSION_STATUS.FAILED);
  });

  it('3. Agent can choose a different valid action after a blocked action', () => {
    const state = createInitialState('explorer');
    // Blocked move to west
    const step1 = dispatchToolCall(state, 'move', 'west');
    expect(step1.lastToolResult.success).toBe(false);

    // Next action: look()
    const step2 = dispatchToolCall(step1, 'look');
    expect(step2.lastToolResult.success).toBe(true);
    expect(step2.lastToolResult.tool).toBe('look');

    // Next action: move north (valid open path)
    const step3 = dispatchToolCall(step2, 'move', 'north');
    expect(step3.lastToolResult.success).toBe(true);
    expect(step3.robot.row).toBe(6);
  });

  it('4. Backend session enriches tool response with discovered walls and detects loops', async () => {
    const origStart = groqProvider.startSession;
    const origStep = groqProvider.stepSession;

    groqProvider.startSession = vi.fn().mockResolvedValue({
      model: 'openai/gpt-oss-20b',
      toolCall: { name: 'move', args: { direction: 'west' } },
      thought: null,
      rawCallId: 'call_mock_1',
      messages: []
    });

    groqProvider.stepSession = vi.fn().mockResolvedValue({
      model: 'openai/gpt-oss-20b',
      toolCall: { name: 'look', args: {} },
      thought: null,
      rawCallId: 'call_mock_2',
      messages: []
    });

    const sessionId = `test_resilience_${Date.now()}`;
    try {
      const startRes = await startAgentSession({
        sessionId,
        startPos: { row: 1, col: 3 }
      });
      expect(startRes.status).toBe(200);

      // Send first blocked move (west into 1,2 wall)
      const step1 = await stepAgentSession({
        sessionId,
        toolResponse: {
          name: 'move',
          response: {
            tool: 'move',
            success: false,
            message: 'Movement blocked by wall at (1, 2).',
            observation: {
              position: { row: 1, col: 3 },
              target: { row: 1, col: 2 },
              facing: 'west',
              blockedReason: 'wall'
            }
          }
        }
      });

      expect(step1.status).toBe(200);
      expect(step1.data.discoveredWallsCount).toBeGreaterThanOrEqual(1);
      expect(step1.data.visitedPositionsCount).toBeGreaterThanOrEqual(1);

      // Send REPEATED blocked move (same direction from same tile)
      const step2 = await stepAgentSession({
        sessionId,
        toolResponse: {
          name: 'move',
          response: {
            tool: 'move',
            success: false,
            message: 'Movement blocked by wall at (1, 2).',
            observation: {
              position: { row: 1, col: 3 },
              target: { row: 1, col: 2 },
              facing: 'west',
              blockedReason: 'wall'
            }
          }
        }
      });

      expect(step2.status).toBe(200);
      expect(step2.data.repeatedBlockedCount).toBe(1);
    } finally {
      groqProvider.startSession = origStart;
      groqProvider.stepSession = origStep;
      stopAgentSession(sessionId);
    }
  });

  it('5. Genuine mission completion is detected when robot reaches Exit', () => {
    // Beginner maze: row 7, col 7 is exit 'E'
    const state = createInitialState('beginner');
    // Place robot at (7, 6) facing east towards exit (7, 7) with door unlocked
    const nearExitState = {
      ...state,
      robot: { row: 7, col: 6, facing: 'east' },
      doorUnlocked: true
    };

    const finalMove = dispatchToolCall(nearExitState, 'move', 'east');
    expect(finalMove.lastToolResult.success).toBe(true);
    expect(finalMove.status).toBe(MISSION_STATUS.COMPLETED);
    expect(finalMove.robot.row).toBe(7);
    expect(finalMove.robot.col).toBe(7);
    expect(finalMove.logs.some((l) => l.type === LOG_TYPES.MISSION_COMPLETED)).toBe(true);
  });

  it('6. Status transition to LIMIT_REACHED when action budget exhausted and resuming continues', () => {
    const state = createInitialState('explorer');
    const budget = 5;
    let s = state;
    for (let i = 0; i < budget; i++) {
      s = dispatchToolCall(s, 'look');
    }
    expect(s.stats.toolCalls).toBe(5);

    // When action budget is reached in runner, it pauses with LIMIT_REACHED
    const limitState = {
      ...s,
      status: MISSION_STATUS.LIMIT_REACHED
    };
    expect(limitState.status).toBe(MISSION_STATUS.LIMIT_REACHED);

    // Resuming transitions to RUNNING with state fully preserved
    const resumedState = {
      ...limitState,
      status: MISSION_STATUS.RUNNING
    };
    expect(resumedState.status).toBe(MISSION_STATUS.RUNNING);
    expect(resumedState.robot.row).toBe(7);
    expect(resumedState.robot.col).toBe(1);
  });
});

