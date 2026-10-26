import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  dispatchToolCall,
  applyEditorAction,
  MISSION_STATUS
} from '../src/game/engine.js';
import { TILE_TYPES } from '../src/game/validation.js';

describe('Game Lifecycle, Reset & Full Playthrough', () => {
  it('reset restores initial state while preserving maze layout', () => {
    let state = createInitialState('explorer');
    // Simulate actions
    state = dispatchToolCall(state, 'move', 'north');
    expect(state.stats.toolCalls).toBeGreaterThan(0);

    // Reset
    const resetState = createInitialState(state.presetId, state.grid);
    expect(resetState.stats.toolCalls).toBe(0);
    expect(resetState.hasKey).toBe(false);
    expect(resetState.doorUnlocked).toBe(false);
    expect(resetState.robot.row).toBe(resetState.entities.start.row);
    expect(resetState.robot.col).toBe(resetState.entities.start.col);
    expect(resetState.status).toBe(MISSION_STATUS.READY);
  });

  it('completes a full playthrough on Explorer maze using only tool calls', () => {
    let state = createInitialState('explorer');
    expect(state.status).toBe(MISSION_STATUS.READY);
    expect(state.robot.row).toBe(7);
    expect(state.robot.col).toBe(1);

    // Explorer Maze path to Key at (1, 1):
    // From S(7, 1) -> (6, 1) -> (5, 1)
    state = dispatchToolCall(state, 'move', 'north'); // (6, 1)
    state = dispatchToolCall(state, 'move', 'north'); // (5, 1)
    expect(state.status).toBe(MISSION_STATUS.RUNNING);

    // Around wall at (4, 1):
    // (5, 1) -> (5, 2) -> (5, 3) -> (4, 3) -> (3, 3) -> (3, 2) -> (3, 1)
    state = dispatchToolCall(state, 'move', 'east');  // (5, 2)
    state = dispatchToolCall(state, 'move', 'east');  // (5, 3)
    state = dispatchToolCall(state, 'move', 'north'); // (4, 3)
    state = dispatchToolCall(state, 'move', 'north'); // (3, 3)
    state = dispatchToolCall(state, 'move', 'west');  // (3, 2)
    state = dispatchToolCall(state, 'move', 'west');  // (3, 1)

    // North into (2, 1) -> (1, 1) [Key]
    state = dispatchToolCall(state, 'move', 'north'); // (2, 1)
    state = dispatchToolCall(state, 'move', 'north'); // (1, 1) [Key]
    expect(state.robot.row).toBe(1);
    expect(state.robot.col).toBe(1);

    // Call look()
    state = dispatchToolCall(state, 'look');
    expect(state.logs[state.logs.length - 1].text.toLowerCase()).toContain('key');

    // Call collect() to pick up the key
    state = dispatchToolCall(state, 'collect');
    expect(state.hasKey).toBe(true);
    expect(state.logs.some(l => l.type === 'OBJECT_COLLECTED')).toBe(true);

    // Navigate to Door at (4, 4), adjacent tile is (4, 3):
    // (1, 1) -> (2, 1) -> (3, 1) -> (3, 2) -> (3, 3) -> (4, 3)
    state = dispatchToolCall(state, 'move', 'south'); // (2, 1)
    state = dispatchToolCall(state, 'move', 'south'); // (3, 1)
    state = dispatchToolCall(state, 'move', 'east');  // (3, 2)
    state = dispatchToolCall(state, 'move', 'east');  // (3, 3)
    state = dispatchToolCall(state, 'move', 'south'); // (4, 3)
    expect(state.robot.row).toBe(4);
    expect(state.robot.col).toBe(3);

    // Try moving east into locked door -> blocked
    state = dispatchToolCall(state, 'move', 'east');
    expect(state.robot.col).toBe(3);
    expect(state.logs[state.logs.length - 1].type).toBe('ACTION_FAILED');

    // Unlock door
    state = dispatchToolCall(state, 'unlock');
    expect(state.doorUnlocked).toBe(true);
    expect(state.logs.some(l => l.type === 'DOOR_UNLOCKED')).toBe(true);

    // Pass through Door into right chamber: (4, 3) -> (4, 4) -> (4, 5) -> (4, 6) -> (4, 7)
    state = dispatchToolCall(state, 'move', 'east'); // (4, 4) Door
    expect(state.robot.row).toBe(4);
    expect(state.robot.col).toBe(4);

    state = dispatchToolCall(state, 'move', 'east'); // (4, 5)
    state = dispatchToolCall(state, 'move', 'east'); // (4, 6)
    state = dispatchToolCall(state, 'move', 'east'); // (4, 7)
    expect(state.robot.row).toBe(4);
    expect(state.robot.col).toBe(7);

    // Move south towards Exit at (7, 7): (4, 7) -> (5, 7) -> (6, 7) -> (7, 7)
    state = dispatchToolCall(state, 'move', 'south'); // (5, 7)
    state = dispatchToolCall(state, 'move', 'south'); // (6, 7)
    state = dispatchToolCall(state, 'move', 'south'); // (7, 7) [Exit]

    expect(state.robot.row).toBe(7);
    expect(state.robot.col).toBe(7);
    expect(state.status).toBe(MISSION_STATUS.COMPLETED);
    expect(state.logs.some(l => l.type === 'MISSION_COMPLETED')).toBe(true);
  });
});

describe('Student Maze Editor & Entity Uniqueness', () => {
  it('relocating Start removes previous Start tile', () => {
    let state = createInitialState('explorer');
    const oldStart = { ...state.entities.start };

    // Move start to (6, 1)
    state = applyEditorAction(state, 6, 1, 'start');
    expect(state.entities.start).toEqual({ row: 6, col: 1 });
    expect(state.grid[oldStart.row][oldStart.col]).toBe(TILE_TYPES.EMPTY);
    expect(state.grid[6][1]).toBe(TILE_TYPES.START);
  });

  it('detects unsolvable state if a wall completely seals the Key', () => {
    let state = createInitialState('explorer');
    // In Explorer Maze, Key is at (1, 1). Its only corridor exit is (2, 1).
    // Placing a wall at (2, 1) seals the key completely.
    state = applyEditorAction(state, 2, 1, 'wall');
    expect(state.validation.isValid).toBe(false);
    expect(state.validation.message).toContain('cannot reach the Key');
  });

  it('does not allow editing during active mission', () => {
    let state = createInitialState('explorer');
    state = dispatchToolCall(state, 'move', 'north');
    expect(state.status).toBe(MISSION_STATUS.RUNNING);

    const prevGrid = state.grid;
    state = applyEditorAction(state, 2, 2, 'wall');
    // Grid remains unchanged
    expect(state.grid).toBe(prevGrid);
  });
});
