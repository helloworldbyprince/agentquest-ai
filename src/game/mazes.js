import { TILE_TYPES } from './validation.js';

/**
 * Helper to convert array of 9 strings (9 chars each) to a 9x9 grid of TILE_TYPES
 * '#' = WALL
 * '.' = EMPTY
 * 'S' = START
 * 'K' = KEY
 * 'D' = DOOR
 * 'E' = EXIT
 */
export function parseMaze(asciiRows) {
  const charMap = {
    '#': TILE_TYPES.WALL,
    '.': TILE_TYPES.EMPTY,
    'S': TILE_TYPES.START,
    'K': TILE_TYPES.KEY,
    'D': TILE_TYPES.DOOR,
    'E': TILE_TYPES.EXIT
  };

  return asciiRows.map((row, r) => {
    const chars = row.replace(/\s+/g, '').split('');
    if (chars.length !== 9) {
      throw new Error(`Row ${r} must have 9 characters, got ${chars.length}: "${row}"`);
    }
    return chars.map((ch, c) => {
      const type = charMap[ch];
      if (!type) throw new Error(`Unknown char '${ch}' at (${r},${c})`);
      return type;
    });
  });
}

/**
 * 1. Beginner Maze
 * A friendly starter maze with clean corridors and one central locked gate.
 * Start: (7, 1)
 * Key: (1, 1)
 * Door: (4, 4)
 * Exit: (7, 7)
 */
const BEGINNER_ASCII = [
  '#########',
  '#K..#...#',
  '#.#.#.#.#',
  '#.#.#.#.#',
  '#...D...#',
  '#.#.#.#.#',
  '#.#.#.#.#',
  '#S..#..E#',
  '#########'
];

/**
 * 2. Explorer Maze (Default)
 * The flagship DevFest challenge: winding corridors, dead-end branches,
 * and a locked central portal separating the robot's starting quadrant from the exit.
 * Start: (7, 1)
 * Key: (1, 1)
 * Door: (4, 4)
 * Exit: (7, 7)
 */
const EXPLORER_ASCII = [
  '#########',
  '#K#.#.###',
  '#.#.#...#',
  '#...###.#',
  '###.D...#',
  '#...###.#',
  '#.#.#...#',
  '#S#.#.#E#',
  '#########'
];

/**
 * 3. Challenge Maze
 * A tight labyrinth with winding zig-zag corridors requiring precise exploration.
 * Start: (1, 1)
 * Key: (7, 2)
 * Door: (4, 4)
 * Exit: (1, 7)
 */
const CHALLENGE_ASCII = [
  '#########',
  '#S#.#.E.#',
  '#.#.#.###',
  '#...#.#.#',
  '###.D.#.#',
  '#.#.#.#.#',
  '#.#.###.#',
  '#.#K#...#',
  '#########'
];

export const MAZE_PRESETS = {
  beginner: {
    id: 'beginner',
    name: 'Beginner Maze',
    difficulty: 'Easy',
    description: 'A friendly starter maze with clear corridors and one central locked gate.',
    grid: parseMaze(BEGINNER_ASCII)
  },
  explorer: {
    id: 'explorer',
    name: 'Explorer Maze',
    difficulty: 'Standard',
    description: 'The standard DevFest challenge with winding pathways and a central locked checkpoint.',
    grid: parseMaze(EXPLORER_ASCII)
  },
  challenge: {
    id: 'challenge',
    name: 'Challenge Maze',
    difficulty: 'Advanced',
    description: 'A deep labyrinth requiring careful navigation across both chambers.',
    grid: parseMaze(CHALLENGE_ASCII)
  }
};

export const DEFAULT_PRESET_ID = 'explorer';

export function cloneGrid(grid) {
  return grid.map(row => [...row]);
}

