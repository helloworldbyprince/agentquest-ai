import { MAZE_PRESETS, DEFAULT_PRESET_ID, cloneGrid } from './mazes.js';
import { validateMaze, TILE_TYPES } from './validation.js';
import { look, move, collect, unlock } from './tools.js';

export const MISSION_STATUS = {
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const LOG_TYPES = {
  MISSION_START: 'MISSION_START',
  AGENT_STARTED: 'AGENT_STARTED',
  PROVIDER_SELECTED: 'PROVIDER_SELECTED',
  PROVIDER_SWITCHED: 'PROVIDER_SWITCHED',
  RATE_LIMITED: 'RATE_LIMITED',
  MISSION_CONTINUED: 'MISSION_CONTINUED',
  GEMINI_RESPONSE: 'GEMINI_RESPONSE',
  AI_RESPONSE: 'AI_RESPONSE',
  TOOL_CALL: 'TOOL_CALL',
  TOOL_RESULT: 'TOOL_RESULT',
  OBSERVATION: 'OBSERVATION',
  ACTION_SUCCESS: 'ACTION_SUCCESS',
  ACTION_FAILED: 'ACTION_FAILED',
  OBJECT_COLLECTED: 'OBJECT_COLLECTED',
  DOOR_UNLOCKED: 'DOOR_UNLOCKED',
  AGENT_ADAPTED: 'AGENT_ADAPTED',
  ENVIRONMENT_CHANGED: 'ENVIRONMENT_CHANGED',
  MISSION_COMPLETED: 'MISSION_COMPLETED',
  MISSION_FAILED: 'MISSION_FAILED'
};

export const EDITOR_TOOLS = {
  START: { id: 'start', label: 'Place Start', tile: TILE_TYPES.START },
  WALL: { id: 'wall', label: 'Place Wall', tile: TILE_TYPES.WALL },
  ERASE: { id: 'erase', label: 'Erase Wall', tile: TILE_TYPES.EMPTY },
  KEY: { id: 'key', label: 'Place Key', tile: TILE_TYPES.KEY },
  DOOR: { id: 'door', label: 'Place Door', tile: TILE_TYPES.DOOR },
  EXIT: { id: 'exit', label: 'Place Exit', tile: TILE_TYPES.EXIT }
};

let logCounter = 1;

export function createLogEntry(type, text, details = {}) {
  const { tool = null, status = 'info', payload = null, elapsedSeconds = 0 } = details;
  const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const secs = (elapsedSeconds % 60).toString().padStart(2, '0');

  return {
    id: logCounter++,
    timestamp: `${mins}:${secs}`,
    type,
    tool,
    text,
    status, // 'success' | 'failure' | 'info'
    payload
  };
}

/**
 * Creates initial game state
 */
export function createInitialState(presetId = DEFAULT_PRESET_ID, customGrid = null) {
  logCounter = 1;
  const preset = MAZE_PRESETS[presetId] || MAZE_PRESETS[DEFAULT_PRESET_ID];
  const grid = customGrid ? cloneGrid(customGrid) : cloneGrid(preset.grid);
  const validation = validateMaze(grid);

  const start = validation.entities?.start || { row: 7, col: 1 };
  const key = validation.entities?.key || { row: 1, col: 1 };
  const door = validation.entities?.door || { row: 4, col: 4 };
  const exit = validation.entities?.exit || { row: 7, col: 7 };

  return {
    presetId,
    grid,
    validation,
    entities: { start, key, door, exit },
    robot: {
      row: start.row,
      col: start.col,
      facing: 'north',
      animation: null // 'shake' | 'bounce' | 'win' | null
    },
    hasKey: false,
    doorUnlocked: false,
    status: MISSION_STATUS.READY,
    selectedEditorTool: EDITOR_TOOLS.WALL.id,
    stats: {
      toolCalls: 0,
      successfulActions: 0,
      failedActions: 0,
      elapsedSeconds: 0
    },
    logs: [
      createLogEntry(
        LOG_TYPES.MISSION_START,
        'AgentQuest initialized. Goal: Find the Key → Unlock the Door → Reach the Exit.',
        { status: 'info' }
      )
    ]
  };
}

/**
 * Dispatches a tool call through the engine
 */
export function dispatchToolCall(state, toolName, ...args) {
  if (state.status === MISSION_STATUS.COMPLETED) {
    return {
      ...state,
      logs: [
        ...state.logs,
        createLogEntry(
          LOG_TYPES.ACTION_FAILED,
          'Mission is already completed! Reset or start a new mission.',
          { tool: toolName, status: 'failure', elapsedSeconds: state.stats.elapsedSeconds }
        )
      ]
    };
  }

  if (state.status === MISSION_STATUS.PAUSED) {
    return {
      ...state,
      logs: [
        ...state.logs,
        createLogEntry(
          LOG_TYPES.ACTION_FAILED,
          'Mission is currently paused. Resume before calling tools.',
          { tool: toolName, status: 'failure', elapsedSeconds: state.stats.elapsedSeconds }
        )
      ]
    };
  }

  // If status is READY and a tool is called, automatically transition to RUNNING
  let currentStatus = state.status;
  const initialLogs = [...state.logs];
  if (currentStatus === MISSION_STATUS.READY) {
    currentStatus = MISSION_STATUS.RUNNING;
    initialLogs.push(
      createLogEntry(
        LOG_TYPES.MISSION_START,
        'Mission started. Robot is active.',
        { status: 'info', elapsedSeconds: 0 }
      )
    );
  }

  // 1. Log the tool invocation
  let callText = `${toolName}()`;
  if (toolName === 'move') {
    const dir = typeof args[0] === 'object' && args[0]?.direction ? args[0].direction : args[0];
    callText = `move("${dir || ''}")`;
  } else if (args.length > 0) {
    callText = `${toolName}(${JSON.stringify(args[0])})`;
  }

  const callLog = createLogEntry(LOG_TYPES.TOOL_CALL, callText, {
    tool: toolName,
    status: 'info',
    elapsedSeconds: state.stats.elapsedSeconds
  });

  // 2. Execute the tool function
  let result;
  switch (toolName) {
    case 'look':
      result = look(state);
      break;
    case 'move': {
      const dir = typeof args[0] === 'object' && args[0]?.direction ? args[0].direction : args[0];
      result = move(state, dir);
      break;
    }
    case 'collect':
      result = collect(state);
      break;
    case 'unlock':
      result = unlock(state);
      break;
    default:
      result = {
        tool: toolName,
        success: false,
        message: `Unknown tool: ${toolName}`,
        observation: {}
      };
  }

  // 3. Construct resulting logs
  const newLogs = [callLog];
  const elapsed = state.stats.elapsedSeconds;

  const resultLog = createLogEntry(
    result.success ? LOG_TYPES.ACTION_SUCCESS : LOG_TYPES.ACTION_FAILED,
    result.message,
    {
      tool: toolName,
      status: result.success ? 'success' : 'failure',
      payload: result,
      elapsedSeconds: elapsed
    }
  );
  newLogs.push(resultLog);

  // Additional contextual events
  let updatedHasKey = state.hasKey;
  let updatedDoorUnlocked = state.doorUnlocked;
  let updatedRobot = { ...state.robot };
  let nextStatus = currentStatus;

  if (toolName === 'move') {
    if (result.success) {
      updatedRobot = {
        ...updatedRobot,
        row: result.observation.position.row,
        col: result.observation.position.col,
        facing: result.observation.facing,
        animation: 'bounce'
      };

      if (result.observation.reachedExit) {
        nextStatus = MISSION_STATUS.COMPLETED;
        newLogs.push(
          createLogEntry(
            LOG_TYPES.MISSION_COMPLETED,
            `Mission Complete! The robot safely escaped through the Exit portal in ${state.stats.toolCalls + 1} tool calls.`,
            { status: 'success', elapsedSeconds: elapsed }
          )
        );
        updatedRobot.animation = 'win';
      }
    } else {
      updatedRobot = {
        ...updatedRobot,
        facing: result.observation.facing || updatedRobot.facing,
        animation: 'shake'
      };
    }
  } else if (toolName === 'collect' && result.success) {
    updatedHasKey = true;
    newLogs.push(
      createLogEntry(
        LOG_TYPES.OBJECT_COLLECTED,
        'Key collected and stored in robot inventory.',
        { tool: 'collect', status: 'success', elapsedSeconds: elapsed }
      )
    );
  } else if (toolName === 'unlock' && result.success) {
    updatedDoorUnlocked = true;
    newLogs.push(
      createLogEntry(
        LOG_TYPES.DOOR_UNLOCKED,
        'Locked door opened! The corridor to the exit is now accessible.',
        { tool: 'unlock', status: 'success', elapsedSeconds: elapsed }
      )
    );
  } else if (toolName === 'look') {
    newLogs.push(
      createLogEntry(
        LOG_TYPES.OBSERVATION,
        `Current tile: ${result.observation.currentTile}. Position: (${result.observation.position.row}, ${result.observation.position.col}).`,
        { tool: 'look', status: 'info', payload: result.observation, elapsedSeconds: elapsed }
      )
    );
  }

  return {
    ...state,
    status: nextStatus,
    robot: updatedRobot,
    hasKey: updatedHasKey,
    doorUnlocked: updatedDoorUnlocked,
    lastToolResult: result,
    stats: {
      ...state.stats,
      toolCalls: state.stats.toolCalls + 1,
      successfulActions: state.stats.successfulActions + (result.success ? 1 : 0),
      failedActions: state.stats.failedActions + (result.success ? 0 : 1)
    },
    logs: [...initialLogs, ...newLogs]
  };
}

/**
 * Editor tile manipulation with single-entity uniqueness rules
 */
export function applyEditorAction(state, targetRow, targetCol, toolId) {
  if (state.status === MISSION_STATUS.RUNNING) {
    return state; // Editing disabled while running
  }

  const currentGrid = cloneGrid(state.grid);
  const currentTile = currentGrid[targetRow][targetCol];

  // If tool is ERASE, remove wall or reset tile to empty
  if (toolId === EDITOR_TOOLS.ERASE.id) {
    if (currentTile === TILE_TYPES.WALL) {
      currentGrid[targetRow][targetCol] = TILE_TYPES.EMPTY;
    }
  } else if (toolId === EDITOR_TOOLS.WALL.id) {
    // Cannot place wall over unique entities
    if (
      currentTile !== TILE_TYPES.START &&
      currentTile !== TILE_TYPES.KEY &&
      currentTile !== TILE_TYPES.DOOR &&
      currentTile !== TILE_TYPES.EXIT
    ) {
      currentGrid[targetRow][targetCol] = TILE_TYPES.WALL;
    }
  } else if (toolId === EDITOR_TOOLS.START.id) {
    // Remove old start
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentGrid[r][c] === TILE_TYPES.START) {
          currentGrid[r][c] = TILE_TYPES.EMPTY;
        }
      }
    }
    currentGrid[targetRow][targetCol] = TILE_TYPES.START;
  } else if (toolId === EDITOR_TOOLS.KEY.id) {
    // Remove old key
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentGrid[r][c] === TILE_TYPES.KEY) {
          currentGrid[r][c] = TILE_TYPES.EMPTY;
        }
      }
    }
    currentGrid[targetRow][targetCol] = TILE_TYPES.KEY;
  } else if (toolId === EDITOR_TOOLS.DOOR.id) {
    // Remove old door
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentGrid[r][c] === TILE_TYPES.DOOR) {
          currentGrid[r][c] = TILE_TYPES.EMPTY;
        }
      }
    }
    currentGrid[targetRow][targetCol] = TILE_TYPES.DOOR;
  } else if (toolId === EDITOR_TOOLS.EXIT.id) {
    // Remove old exit
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentGrid[r][c] === TILE_TYPES.EXIT) {
          currentGrid[r][c] = TILE_TYPES.EMPTY;
        }
      }
    }
    currentGrid[targetRow][targetCol] = TILE_TYPES.EXIT;
  }

  const validation = validateMaze(currentGrid);
  const start = validation.entities?.start || state.entities.start;
  const key = validation.entities?.key || state.entities.key;
  const door = validation.entities?.door || state.entities.door;
  const exit = validation.entities?.exit || state.entities.exit;

  return {
    ...state,
    grid: currentGrid,
    validation,
    entities: { start, key, door, exit },
    robot: {
      ...state.robot,
      row: start.row,
      col: start.col
    },
    logs: [
      ...state.logs,
      createLogEntry(
        LOG_TYPES.ENVIRONMENT_CHANGED,
        `Maze layout updated at (${targetRow}, ${targetCol}) with ${toolId}. Status: ${validation.message}`,
        { status: validation.isValid ? 'info' : 'failure', elapsedSeconds: state.stats.elapsedSeconds }
      )
    ]
  };
}

