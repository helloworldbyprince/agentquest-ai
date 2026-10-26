/**
 * Grid & Maze Validation Module
 * Verifies correctness, object constraints, and guaranteed solvability.
 */

export const TILE_TYPES = {
  EMPTY: 'empty',
  WALL: 'wall',
  START: 'start',
  KEY: 'key',
  DOOR: 'door',
  EXIT: 'exit'
};

export const GRID_SIZE = 9;

/**
 * Finds all unique items in a 9x9 grid
 */
export function extractGridEntities(grid) {
  let start = null;
  let key = null;
  let door = null;
  let exit = null;

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const tile = grid[r][c];
      if (tile === TILE_TYPES.START) {
        if (start) throw new Error(`Multiple starts found at (${r},${c})`);
        start = { row: r, col: c };
      } else if (tile === TILE_TYPES.KEY) {
        if (key) throw new Error(`Multiple keys found at (${r},${c})`);
        key = { row: r, col: c };
      } else if (tile === TILE_TYPES.DOOR) {
        if (door) throw new Error(`Multiple doors found at (${r},${c})`);
        door = { row: r, col: c };
      } else if (tile === TILE_TYPES.EXIT) {
        if (exit) throw new Error(`Multiple exits found at (${r},${c})`);
        exit = { row: r, col: c };
      }
    }
  }

  return { start, key, door, exit };
}

/**
 * BFS helper to find if target is reachable from startPos given allowed tiles
 */
export function isReachable(grid, startPos, targetPos, allowThroughDoor = false) {
  if (!startPos || !targetPos) return false;
  if (startPos.row === targetPos.row && startPos.col === targetPos.col) return true;

  const queue = [{ row: startPos.row, col: startPos.col }];
  const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  visited[startPos.row][startPos.col] = true;

  const dirs = [
    [-1, 0], // North
    [1, 0],  // South
    [0, 1],  // East
    [0, -1]  // West
  ];

  while (queue.length > 0) {
    const { row, col } = queue.shift();

    if (row === targetPos.row && col === targetPos.col) {
      return true;
    }

    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;

      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (visited[nr][nc]) continue;

      const tile = grid[nr][nc];
      if (tile === TILE_TYPES.WALL) continue;

      // If door is not allowed to pass through, cannot enter it unless target is the door itself
      if (tile === TILE_TYPES.DOOR && !allowThroughDoor) {
        // Robot can reach the door tile or adjacent to it, but cannot step through it
        // If the target is the door, reaching the door is valid
        if (nr === targetPos.row && nc === targetPos.col) {
          return true;
        }
        continue;
      }

      visited[nr][nc] = true;
      queue.push({ row: nr, col: nc });
    }
  }

  return false;
}

/**
 * Checks if posA is adjacent to posB orthogonally
 */
export function isAdjacent(posA, posB) {
  if (!posA || !posB) return false;
  const dr = Math.abs(posA.row - posB.row);
  const dc = Math.abs(posA.col - posB.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

/**
 * Full maze validation
 */
export function validateMaze(grid) {
  const errors = [];

  if (!grid || grid.length !== GRID_SIZE || grid.some(row => row.length !== GRID_SIZE)) {
    return {
      isValid: false,
      errors: ['Grid must be 9 columns by 9 rows.'],
      message: 'Invalid grid dimensions.'
    };
  }

  let start = null;
  let key = null;
  let door = null;
  let exit = null;

  try {
    const entities = extractGridEntities(grid);
    start = entities.start;
    key = entities.key;
    door = entities.door;
    exit = entities.exit;
  } catch (err) {
    errors.push(err.message);
  }

  if (!start) errors.push('Maze is missing a Robot Start position.');
  if (!key) errors.push('Maze is missing a Key.');
  if (!door) errors.push('Maze is missing a Locked Door.');
  if (!exit) errors.push('Maze is missing an Exit.');

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      message: errors[0]
    };
  }

  // 1. Can Robot reach Key without passing through locked door?
  const canReachKey = isReachable(grid, start, key, false);
  if (!canReachKey) {
    errors.push('The robot cannot reach the Key from the starting position.');
  }

  // 2. Can Robot reach Door with Key?
  // Since robot reached key, from key it must be able to reach door (adjacent to door or door itself)
  const canReachDoorFromKey = isReachable(grid, key, door, false);
  if (!canReachDoorFromKey) {
    errors.push('The robot cannot reach the Door from the Key location.');
  }

  // 3. Can Robot reach Exit WITHOUT opening Door?
  // The door must act as a meaningful barrier! Exit must NOT be reachable without door
  const canBypassDoorToExit = isReachable(grid, start, exit, false);
  if (canBypassDoorToExit) {
    errors.push('The locked door is not a necessary barrier: the exit can be reached without unlocking the door.');
  }

  // 4. Once Door is unlocked, can Robot reach Exit?
  const canReachExitThroughDoor = isReachable(grid, door, exit, true);
  if (!canReachExitThroughDoor) {
    errors.push('The exit cannot be reached from the Door even after unlocking.');
  }

  const isValid = errors.length === 0;
  return {
    isValid,
    errors,
    message: isValid ? 'Maze Ready' : errors[0],
    entities: { start, key, door, exit }
  };
}

