import { describe, it, expect } from 'vitest';
import { createInitialState, dispatchToolCall, MISSION_STATUS } from '../src/game/engine.js';
import { look, move, collect, unlock } from '../src/game/tools.js';

describe('Tool API and Game Mechanics', () => {
  it('look() returns immediate orthogonal surroundings without revealing full maze', () => {
    const state = createInitialState('explorer');
    const result = look(state);

    expect(result.tool).toBe('look');
    expect(result.success).toBe(true);
    expect(result.observation).toHaveProperty('position');
    expect(result.observation).toHaveProperty('surroundings');
    expect(result.observation.surroundings).toHaveProperty('north');
    expect(result.observation.surroundings).toHaveProperty('south');
    expect(result.observation.surroundings).toHaveProperty('east');
    expect(result.observation.surroundings).toHaveProperty('west');
    // Does not expose full grid array
    expect(result.observation).not.toHaveProperty('grid');
  });

  it('move() prevents moving out of grid boundaries', () => {
    let state = createInitialState('explorer');
    // Start is at (7, 1). Move south to (8, 1) if not wall, or try moving west beyond boundary
    state.robot.row = 0;
    state.robot.col = 0;
    const result = move(state, 'north');
    expect(result.success).toBe(false);
    expect(result.observation.blockedReason).toBe('boundary');
    expect(result.message).toContain('Out of grid bounds');
  });

  it('move() prevents robot from crossing walls', () => {
    const state = createInitialState('explorer');
    // Start is at (7, 1). East is (7, 2), West is (7, 0) which is a wall '#'.
    const result = move(state, 'west');
    expect(result.success).toBe(false);
    expect(result.observation.blockedReason).toBe('wall');
    expect(result.message).toContain('blocked by wall');
  });

  it('move() prevents passing through a locked door', () => {
    const state = createInitialState('explorer');
    // Explorer door is at (4, 4). Position robot at (4, 3) facing east towards door
    state.robot.row = 4;
    state.robot.col = 3;
    state.doorUnlocked = false;

    const result = move(state, 'east');
    expect(result.success).toBe(false);
    expect(result.observation.blockedReason).toBe('locked_door');
    expect(result.message).toContain('locked');
  });

  it('move() allows passing through door once unlocked', () => {
    const state = createInitialState('explorer');
    state.robot.row = 4;
    state.robot.col = 3;
    state.doorUnlocked = true;

    const result = move(state, 'east');
    expect(result.success).toBe(true);
    expect(result.observation.position).toEqual({ row: 4, col: 4 });
  });

  it('collect() only succeeds when standing on key tile', () => {
    const state = createInitialState('explorer');
    // Start is at (7, 1), key is at (1, 1)
    const failResult = collect(state);
    expect(failResult.success).toBe(false);
    expect(failResult.observation.hasKey).toBe(false);

    // Place robot on key tile (1, 1)
    state.robot.row = 1;
    state.robot.col = 1;
    const successResult = collect(state);
    expect(successResult.success).toBe(true);
    expect(successResult.observation.hasKey).toBe(true);
  });

  it('unlock() requires key in inventory', () => {
    const state = createInitialState('explorer');
    state.robot.row = 4;
    state.robot.col = 3; // adjacent to door at (4, 4)
    state.hasKey = false;

    const result = unlock(state);
    expect(result.success).toBe(false);
    expect(result.message).toContain('need to collect the Key first');
  });

  describe('unlock() positional rules', () => {
    const doorRow = 4;
    const doorCol = 4;

    it('succeeds from all 4 directly adjacent orthogonal positions (north, south, east, west)', () => {
      const orthogonalOffsets = [
        { name: 'north', row: doorRow - 1, col: doorCol },
        { name: 'south', row: doorRow + 1, col: doorCol },
        { name: 'east',  row: doorRow, col: doorCol + 1 },
        { name: 'west',  row: doorRow, col: doorCol - 1 }
      ];

      for (const pos of orthogonalOffsets) {
        const state = createInitialState('explorer');
        state.robot.row = pos.row;
        state.robot.col = pos.col;
        state.hasKey = true;
        state.doorUnlocked = false;

        const result = unlock(state);
        expect(result.success, `Expected unlock to succeed from ${pos.name} (${pos.row}, ${pos.col})`).toBe(true);
        expect(result.observation.doorUnlocked).toBe(true);
      }
    });

    it('fails when robot stands directly on the locked door tile', () => {
      const state = createInitialState('explorer');
      state.robot.row = doorRow;
      state.robot.col = doorCol;
      state.hasKey = true;
      state.doorUnlocked = false;

      const result = unlock(state);
      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot stand on the locked door tile');
      expect(result.observation.onDoorTile).toBe(true);
    });

    it('fails when robot is in any diagonal position relative to the door', () => {
      const diagonalOffsets = [
        { name: 'north-east', row: doorRow - 1, col: doorCol + 1 },
        { name: 'north-west', row: doorRow - 1, col: doorCol - 1 },
        { name: 'south-east', row: doorRow + 1, col: doorCol + 1 },
        { name: 'south-west', row: doorRow + 1, col: doorCol - 1 }
      ];

      for (const pos of diagonalOffsets) {
        const state = createInitialState('explorer');
        state.robot.row = pos.row;
        state.robot.col = pos.col;
        state.hasKey = true;
        state.doorUnlocked = false;

        const result = unlock(state);
        expect(result.success, `Expected unlock to fail diagonally from ${pos.name}`).toBe(false);
        expect(result.message).toContain('Diagonal positions are not valid');
        expect(result.observation.isDiagonal).toBe(true);
      }
    });

    it('fails when robot is distant from the door', () => {
      const state = createInitialState('explorer');
      state.robot.row = 1;
      state.robot.col = 1; // far away from door at (4, 4)
      state.hasKey = true;
      state.doorUnlocked = false;

      const result = unlock(state);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not adjacent');
    });

    it('fails when door is already unlocked', () => {
      const state = createInitialState('explorer');
      state.robot.row = 4;
      state.robot.col = 3;
      state.hasKey = true;
      state.doorUnlocked = true;

      const result = unlock(state);
      expect(result.success).toBe(false);
      expect(result.message).toContain('already unlocked');
    });
  });
});

describe('Mission Workflow & Engine State Transition', () => {
  it('completes the mission only when reaching exit with door unlocked', () => {
    let state = createInitialState('explorer');
    state.hasKey = true;
    state.doorUnlocked = true;
    // Explorer Exit is at (7, 7)
    state.robot.row = 6;
    state.robot.col = 7;

    state = dispatchToolCall(state, 'move', 'south');
    expect(state.status).toBe(MISSION_STATUS.COMPLETED);
    expect(state.robot.row).toBe(7);
    expect(state.robot.col).toBe(7);
    expect(state.logs.some(l => l.type === 'MISSION_COMPLETED')).toBe(true);
  });

  it('tracks stats for successful and failed actions correctly', () => {
    let state = createInitialState('explorer');
    expect(state.stats.toolCalls).toBe(0);

    // 1. Successful look
    state = dispatchToolCall(state, 'look');
    expect(state.stats.toolCalls).toBe(1);
    expect(state.stats.successfulActions).toBe(1);
    expect(state.stats.failedActions).toBe(0);

    // 2. Failed move into wall
    state = dispatchToolCall(state, 'move', 'west');
    expect(state.stats.toolCalls).toBe(2);
    expect(state.stats.successfulActions).toBe(1);
    expect(state.stats.failedActions).toBe(1);
  });
});

