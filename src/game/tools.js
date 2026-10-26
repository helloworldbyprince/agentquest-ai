import { TILE_TYPES, GRID_SIZE, isAdjacent } from './validation.js';

export const DIRECTIONS = {
  north: { row: -1, col: 0, label: 'North' },
  south: { row: 1, col: 0, label: 'South' },
  east: { row: 0, col: 1, label: 'East' },
  west: { row: 0, col: -1, label: 'West' }
};

/**
 * Normalizes a tile at (row, col) given current game state
 */
export function getTileAt(state, row, col) {
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
    return { type: 'boundary', traversable: false, isBoundary: true };
  }

  const baseType = state.grid[row][col];

  // If key has been collected and robot is looking at that tile, it acts as an empty floor
  if (baseType === TILE_TYPES.KEY && state.hasKey) {
    return { type: TILE_TYPES.EMPTY, traversable: true, wasKey: true };
  }

  // If door is unlocked, it is traversable
  if (baseType === TILE_TYPES.DOOR) {
    return {
      type: TILE_TYPES.DOOR,
      traversable: state.doorUnlocked,
      doorUnlocked: state.doorUnlocked
    };
  }

  const traversable = baseType !== TILE_TYPES.WALL;
  return { type: baseType, traversable };
}

/**
 * TOOL 1: look()
 * Inspects immediate surroundings (current tile and 4 orthogonal neighbors only).
 */
export function look(state) {
  const { robot } = state;
  const currentTile = getTileAt(state, robot.row, robot.col);

  const surroundings = {};
  const visibleEntities = [];

  for (const [dir, delta] of Object.entries(DIRECTIONS)) {
    const nr = robot.row + delta.row;
    const nc = robot.col + delta.col;
    const tileInfo = getTileAt(state, nr, nc);

    surroundings[dir] = {
      type: tileInfo.type,
      traversable: tileInfo.traversable,
      row: nr,
      col: nc
    };

    if (tileInfo.type === TILE_TYPES.KEY && !state.hasKey) {
      visibleEntities.push(`Key visible to the ${dir}`);
    } else if (tileInfo.type === TILE_TYPES.DOOR) {
      visibleEntities.push(`${state.doorUnlocked ? 'Unlocked' : 'Locked'} Door to the ${dir}`);
    } else if (tileInfo.type === TILE_TYPES.EXIT) {
      visibleEntities.push(`Exit Portal visible to the ${dir}`);
    }
  }

  // Check current tile for entities
  if (state.grid[robot.row][robot.col] === TILE_TYPES.KEY && !state.hasKey) {
    visibleEntities.push('Key under robot (Ready to collect!)');
  } else if (state.grid[robot.row][robot.col] === TILE_TYPES.EXIT) {
    visibleEntities.push('Standing on the Exit portal!');
  }

  const summary = [
    `North: ${surroundings.north.type} (${surroundings.north.traversable ? 'open' : 'blocked'})`,
    `East: ${surroundings.east.type} (${surroundings.east.traversable ? 'open' : 'blocked'})`,
    `South: ${surroundings.south.type} (${surroundings.south.traversable ? 'open' : 'blocked'})`,
    `West: ${surroundings.west.type} (${surroundings.west.traversable ? 'open' : 'blocked'})`
  ].join(' | ');

  return {
    tool: 'look',
    success: true,
    message: visibleEntities.length > 0 
      ? `Observed surroundings. Detected: ${visibleEntities.join(', ')}.`
      : `Observed surroundings: ${summary}`,
    observation: {
      position: { row: robot.row, col: robot.col },
      facing: robot.facing,
      currentTile: currentTile.type,
      surroundings,
      hasKey: state.hasKey,
      doorUnlocked: state.doorUnlocked,
      missionStatus: state.status
    }
  };
}

/**
 * TOOL 2: move(direction)
 * Moves the robot exactly 1 tile in the specified direction.
 */
export function move(state, direction) {
  const dir = String(direction).toLowerCase().trim();
  const delta = DIRECTIONS[dir];

  if (!delta) {
    return {
      tool: 'move',
      success: false,
      message: `Invalid direction "${direction}". Allowed: north, south, east, west.`,
      observation: {
        position: { row: state.robot.row, col: state.robot.col },
        facing: state.robot.facing,
        blockedReason: 'invalid_direction'
      }
    };
  }

  const targetRow = state.robot.row + delta.row;
  const targetCol = state.robot.col + delta.col;

  // Boundary check
  if (targetRow < 0 || targetRow >= GRID_SIZE || targetCol < 0 || targetCol >= GRID_SIZE) {
    return {
      tool: 'move',
      success: false,
      message: `Movement failed: Out of grid bounds at (${targetRow}, ${targetCol}).`,
      observation: {
        position: { row: state.robot.row, col: state.robot.col },
        target: { row: targetRow, col: targetCol },
        facing: dir,
        blockedReason: 'boundary'
      }
    };
  }

  const targetTile = state.grid[targetRow][targetCol];

  // Wall check
  if (targetTile === TILE_TYPES.WALL) {
    return {
      tool: 'move',
      success: false,
      message: `Movement blocked by wall at (${targetRow}, ${targetCol}).`,
      observation: {
        position: { row: state.robot.row, col: state.robot.col },
        target: { row: targetRow, col: targetCol },
        facing: dir,
        blockedReason: 'wall'
      }
    };
  }

  // Locked door check
  if (targetTile === TILE_TYPES.DOOR && !state.doorUnlocked) {
    return {
      tool: 'move',
      success: false,
      message: `Movement blocked: Door at (${targetRow}, ${targetCol}) is locked. Call unlock() with the key first.`,
      observation: {
        position: { row: state.robot.row, col: state.robot.col },
        target: { row: targetRow, col: targetCol },
        facing: dir,
        blockedReason: 'locked_door'
      }
    };
  }

  // Successful move
  const reachedExit = targetTile === TILE_TYPES.EXIT && state.doorUnlocked;

  return {
    tool: 'move',
    success: true,
    message: reachedExit 
      ? `Robot moved ${dir} to (${targetRow}, ${targetCol}) and reached the Exit!`
      : `Robot moved ${dir} to (${targetRow}, ${targetCol}).`,
    observation: {
      from: { row: state.robot.row, col: state.robot.col },
      position: { row: targetRow, col: targetCol },
      facing: dir,
      tileType: targetTile,
      reachedExit,
      blockedReason: null
    }
  };
}

/**
 * TOOL 3: collect()
 * Collects key if robot is currently standing on the key tile.
 */
export function collect(state) {
  const { robot } = state;
  const currentTile = state.grid[robot.row][robot.col];

  if (state.hasKey) {
    return {
      tool: 'collect',
      success: false,
      message: 'Key is already in your inventory.',
      observation: {
        hasKey: true,
        position: { row: robot.row, col: robot.col }
      }
    };
  }

  if (currentTile !== TILE_TYPES.KEY) {
    return {
      tool: 'collect',
      success: false,
      message: `No collectible key at current position (${robot.row}, ${robot.col}).`,
      observation: {
        hasKey: false,
        position: { row: robot.row, col: robot.col }
      }
    };
  }

  return {
    tool: 'collect',
    success: true,
    message: 'Key collected successfully! Added to robot inventory.',
    observation: {
      hasKey: true,
      position: { row: robot.row, col: robot.col }
    }
  };
}

/**
 * TOOL 4: unlock()
 * Unlocks door if robot holds the key and is directly adjacent (orthogonally) to the door.
 * Must NOT stand on the locked door tile or be in a diagonal position.
 */
export function unlock(state) {
  const { robot, entities } = state;

  let doorPos = entities?.door;
  if (!doorPos && state.grid) {
    for (let r = 0; r < state.grid.length; r++) {
      for (let c = 0; c < state.grid[r].length; c++) {
        if (state.grid[r][c] === TILE_TYPES.DOOR) {
          doorPos = { row: r, col: c };
          break;
        }
      }
      if (doorPos) break;
    }
  }

  if (state.doorUnlocked) {
    return {
      tool: 'unlock',
      success: false,
      message: 'Door is already unlocked.',
      observation: {
        doorUnlocked: true,
        doorPosition: doorPos
      }
    };
  }

  // 1. Robot must possess the key
  if (!state.hasKey) {
    return {
      tool: 'unlock',
      success: false,
      message: 'Cannot unlock door: You need to collect the Key first.',
      observation: {
        doorUnlocked: false,
        doorPosition: doorPos,
        hasKey: false
      }
    };
  }

  if (!doorPos) {
    return {
      tool: 'unlock',
      success: false,
      message: 'Cannot unlock: No locked door found in the maze.',
      observation: {
        doorUnlocked: false,
        doorPosition: null
      }
    };
  }

  const robotPos = { row: robot.row, col: robot.col };
  const dr = Math.abs(robotPos.row - doorPos.row);
  const dc = Math.abs(robotPos.col - doorPos.col);

  // 2. Robot must NOT stand on the locked door tile
  if (robotPos.row === doorPos.row && robotPos.col === doorPos.col) {
    return {
      tool: 'unlock',
      success: false,
      message: `Cannot unlock door: Robot cannot stand on the locked door tile at (${doorPos.row}, ${doorPos.col}). You must be directly adjacent (north, south, east, or west).`,
      observation: {
        doorUnlocked: false,
        doorPosition: doorPos,
        adjacentToDoor: false,
        onDoorTile: true
      }
    };
  }

  // 3. Diagonal positions are not valid
  if (dr === 1 && dc === 1) {
    return {
      tool: 'unlock',
      success: false,
      message: `Cannot unlock door: Robot is diagonal to the locked door at (${doorPos.row}, ${doorPos.col}). Diagonal positions are not valid; move directly north, south, east, or west of the door.`,
      observation: {
        doorUnlocked: false,
        doorPosition: doorPos,
        adjacentToDoor: false,
        isDiagonal: true
      }
    };
  }

  // 4. Must be directly adjacent orthogonally (north, south, east, or west)
  const isDirectlyAdjacent = (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  if (!isDirectlyAdjacent) {
    return {
      tool: 'unlock',
      success: false,
      message: `Robot is at (${robotPos.row}, ${robotPos.col}), not adjacent to the locked door at (${doorPos.row}, ${doorPos.col}). Move directly adjacent (north, south, east, or west) first.`,
      observation: {
        doorUnlocked: false,
        doorPosition: doorPos,
        adjacentToDoor: false
      }
    };
  }

  return {
    tool: 'unlock',
    success: true,
    message: `Door at (${doorPos.row}, ${doorPos.col}) successfully unlocked! Pathway is now open.`,
    observation: {
      doorUnlocked: true,
      doorPosition: doorPos
    }
  };
}

