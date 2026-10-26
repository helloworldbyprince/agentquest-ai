import { describe, it, expect } from 'vitest';
import { MAZE_PRESETS, cloneGrid } from '../src/game/mazes.js';
import { validateMaze, TILE_TYPES } from '../src/game/validation.js';

describe('Maze Presets Solvability and Validation', () => {
  for (const [id, preset] of Object.entries(MAZE_PRESETS)) {
    it(`validates preset "${preset.name}" (${id}) as solvable with essential locked door`, () => {
      const validation = validateMaze(preset.grid);
      expect(validation.isValid, `Validation failed for ${preset.name}: ${validation.errors.join(', ')}`).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.entities.start).not.toBeNull();
      expect(validation.entities.key).not.toBeNull();
      expect(validation.entities.door).not.toBeNull();
      expect(validation.entities.exit).not.toBeNull();
    });
  }

  it('rejects maze if door can be bypassed', () => {
    const explorerGrid = cloneGrid(MAZE_PRESETS.explorer.grid);
    // create a hole in the divider wall at (1, 3) or (0, 4)
    explorerGrid[4][0] = TILE_TYPES.EMPTY; // not bypass
    // let's place a bypass around door: if row 3 col 4 was wall, change to empty
    explorerGrid[4][3] = TILE_TYPES.EMPTY;
    explorerGrid[4][5] = TILE_TYPES.EMPTY;
    // Actually if door at (4,4) has a neighbor path, let's create a clear opening at row 0 or row 8
    explorerGrid[0][4] = TILE_TYPES.EMPTY; // open top
    explorerGrid[1][4] = TILE_TYPES.EMPTY;
    const validation = validateMaze(explorerGrid);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('not a necessary barrier'))).toBe(true);
  });

  it('rejects maze missing a key', () => {
    const grid = cloneGrid(MAZE_PRESETS.beginner.grid);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === TILE_TYPES.KEY) grid[r][c] = TILE_TYPES.EMPTY;
      }
    }
    const validation = validateMaze(grid);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('missing a Key'))).toBe(true);
  });
});

