import React from 'react';
import { Key, Lock, Unlock, Flag, Compass } from 'lucide-react';
import { TILE_TYPES } from '../game/validation.js';
import { Robot } from './Robot.jsx';

export function Tile({
  row,
  col,
  type,
  hasRobot,
  robotState,
  hasKeyCollected,
  doorUnlocked,
  isEditMode,
  onClick
}) {
  let tileClass = `maze-tile tile-${type}`;
  let content = null;

  if (type === TILE_TYPES.WALL) {
    tileClass += ' tile-wall';
  } else if (type === TILE_TYPES.START) {
    tileClass += ' tile-start';
    if (!hasRobot) {
      content = (
        <div className="tile-icon-wrapper start-marker">
          <Compass className="tile-icon text-indigo-500" size={20} />
          <span className="tile-label">START</span>
        </div>
      );
    }
  } else if (type === TILE_TYPES.KEY) {
    tileClass += hasKeyCollected ? ' tile-key-collected' : ' tile-key';
    if (!hasKeyCollected) {
      content = (
        <div className="tile-icon-wrapper key-marker">
          <Key className="tile-icon text-amber-500 animate-pulse" size={22} />
          <span className="tile-label">KEY</span>
        </div>
      );
    } else {
      content = (
        <div className="tile-icon-wrapper key-faint">
          <Key className="tile-icon text-gray-300" size={16} />
        </div>
      );
    }
  } else if (type === TILE_TYPES.DOOR) {
    tileClass += doorUnlocked ? ' tile-door-open' : ' tile-door-locked';
    content = (
      <div className="tile-icon-wrapper door-marker">
        {doorUnlocked ? (
          <>
            <Unlock className="tile-icon text-emerald-600" size={22} />
            <span className="tile-label">OPEN</span>
          </>
        ) : (
          <>
            <Lock className="tile-icon text-rose-500" size={22} />
            <span className="tile-label">DOOR</span>
          </>
        )}
      </div>
    );
  } else if (type === TILE_TYPES.EXIT) {
    tileClass += ' tile-exit';
    content = (
      <div className="tile-icon-wrapper exit-marker">
        <Flag className="tile-icon text-emerald-500" size={22} />
        <span className="tile-label">EXIT</span>
      </div>
    );
  }

  return (
    <div
      className={`${tileClass} ${isEditMode ? 'editable-tile' : ''}`}
      onClick={() => onClick && onClick(row, col)}
      data-row={row}
      data-col={col}
      role="gridcell"
      aria-label={`Tile (${row}, ${col}) - ${type}`}
      tabIndex={isEditMode ? 0 : -1}
    >
      <span className="tile-coord">{row},{col}</span>

      {/* Render base terrain content */}
      {content}

      {/* Render robot entity overlay */}
      {hasRobot && (
        <div className="robot-overlay">
          <Robot
            facing={robotState.facing}
            animation={robotState.animation}
            hasKey={hasKeyCollected}
          />
        </div>
      )}
    </div>
  );
}
