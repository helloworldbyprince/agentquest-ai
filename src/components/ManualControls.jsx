import React, { useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Eye,
  Key,
  Unlock
} from 'lucide-react';
import { MISSION_STATUS } from '../game/engine.js';

export function ManualControls({
  onToolCall,
  missionStatus,
  hasKey,
  doorUnlocked,
  disabled = false
}) {
  const isCompleted = missionStatus === MISSION_STATUS.COMPLETED;
  const isPaused = missionStatus === MISSION_STATUS.PAUSED;
  const isControlsDisabled = disabled || isCompleted || isPaused;

  // Keyboard shortcut handler
  useEffect(() => {
    function handleKeyDown(e) {
      if (isControlsDisabled) return;

      // Ignore if user is typing into an input/select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          onToolCall('move', 'north');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          onToolCall('move', 'south');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          onToolCall('move', 'west');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          onToolCall('move', 'east');
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          onToolCall('look');
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          onToolCall('collect');
          break;
        case 'u':
        case 'U':
          e.preventDefault();
          onToolCall('unlock');
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToolCall, isControlsDisabled]);

  return (
    <div className="manual-controls-card">
      <div className="controls-card-header">
        <h3 className="controls-title">Manual Tool Controls</h3>
        <span className="controls-keyboard-hint">Arrow Keys or WASD supported</span>
      </div>

      <div className="controls-layout">
        {/* Directional Pad */}
        <div className="dpad-wrapper" aria-label="Directional Movement Tools">
          <div className="dpad-row">
            <button
              className="btn btn-dpad"
              onClick={() => onToolCall('move', 'north')}
              disabled={isControlsDisabled}
              title="move('north') — [↑ / W]"
              aria-label="Move North"
            >
              <ArrowUp size={20} />
            </button>
          </div>
          <div className="dpad-row dpad-middle-row">
            <button
              className="btn btn-dpad"
              onClick={() => onToolCall('move', 'west')}
              disabled={isControlsDisabled}
              title="move('west') — [← / A]"
              aria-label="Move West"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="dpad-center-hub" title="Robot movement core">
              <span className="hub-dot"></span>
            </div>
            <button
              className="btn btn-dpad"
              onClick={() => onToolCall('move', 'east')}
              disabled={isControlsDisabled}
              title="move('east') — [→ / D]"
              aria-label="Move East"
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <div className="dpad-row">
            <button
              className="btn btn-dpad"
              onClick={() => onToolCall('move', 'south')}
              disabled={isControlsDisabled}
              title="move('south') — [↓ / S]"
              aria-label="Move South"
            >
              <ArrowDown size={20} />
            </button>
          </div>
        </div>

        {/* Action Tool Buttons */}
        <div className="action-tools-column">
          {/* Look Tool */}
          <button
            className="btn btn-action-tool btn-look"
            onClick={() => onToolCall('look')}
            disabled={isControlsDisabled}
            title="Inspect 4 adjacent tiles [L]"
          >
            <div className="tool-icon-circle">
              <Eye size={18} className="text-indigo-600" />
            </div>
            <div className="tool-btn-text">
              <span className="tool-btn-name">look()</span>
              <span className="tool-btn-desc">Inspect immediate surroundings</span>
            </div>
          </button>

          {/* Collect Tool */}
          <button
            className={`btn btn-action-tool btn-collect ${hasKey ? 'is-satisfied' : ''}`}
            onClick={() => onToolCall('collect')}
            disabled={isControlsDisabled || hasKey}
            title="Collect key when standing on key tile [C]"
          >
            <div className="tool-icon-circle">
              <Key size={18} className={hasKey ? 'text-gray-400' : 'text-amber-600'} />
            </div>
            <div className="tool-btn-text">
              <span className="tool-btn-name">collect()</span>
              <span className="tool-btn-desc">
                {hasKey ? 'Key collected in inventory' : 'Pick up key from current tile'}
              </span>
            </div>
          </button>

          {/* Unlock Tool */}
          <button
            className={`btn btn-action-tool btn-unlock ${doorUnlocked ? 'is-satisfied' : ''}`}
            onClick={() => onToolCall('unlock')}
            disabled={isControlsDisabled || doorUnlocked}
            title="Unlock adjacent door while holding key [U]"
          >
            <div className="tool-icon-circle">
              <Unlock size={18} className={doorUnlocked ? 'text-gray-400' : 'text-rose-500'} />
            </div>
            <div className="tool-btn-text">
              <span className="tool-btn-name">unlock()</span>
              <span className="tool-btn-desc">
                {doorUnlocked ? 'Door is open' : 'Unlock adjacent door with key'}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

