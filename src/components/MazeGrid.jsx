import React from 'react';
import { Tile } from './Tile.jsx';

export function MazeGrid({
  grid,
  robot,
  hasKey,
  doorUnlocked,
  isEditMode,
  onTileClick
}) {
  return (
    <div className="maze-container">
      <div
        className="maze-grid"
        role="grid"
        aria-label="9 by 9 Maze Grid"
      >
        {grid.map((rowArr, r) =>
          rowArr.map((tileType, c) => {
            const hasRobot = robot.row === r && robot.col === c;
            return (
              <Tile
                key={`${r}-${c}`}
                row={r}
                col={c}
                type={tileType}
                hasRobot={hasRobot}
                robotState={robot}
                hasKeyCollected={hasKey}
                doorUnlocked={doorUnlocked}
                isEditMode={isEditMode}
                onClick={onTileClick}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

