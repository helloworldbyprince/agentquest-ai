import React from 'react';
import {
  Compass,
  Square,
  Eraser,
  Key,
  Lock,
  Flag,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Pencil
} from 'lucide-react';
import { EDITOR_TOOLS, MISSION_STATUS } from '../game/engine.js';
import { MAZE_PRESETS } from '../game/mazes.js';

export function EditToolbar({
  isEditMode,
  setIsEditMode,
  selectedTool,
  setSelectedTool,
  validation,
  selectedPresetId,
  onSelectPreset,
  onRestorePreset,
  missionStatus
}) {
  const isRunning = missionStatus === MISSION_STATUS.RUNNING;

  const tools = [
    { ...EDITOR_TOOLS.START, icon: Compass, color: 'text-indigo-500' },
    { ...EDITOR_TOOLS.WALL, icon: Square, color: 'text-slate-600' },
    { ...EDITOR_TOOLS.ERASE, icon: Eraser, color: 'text-rose-500' },
    { ...EDITOR_TOOLS.KEY, icon: Key, color: 'text-amber-500' },
    { ...EDITOR_TOOLS.DOOR, icon: Lock, color: 'text-rose-400' },
    { ...EDITOR_TOOLS.EXIT, icon: Flag, color: 'text-emerald-500' }
  ];

  return (
    <div className="editor-section">
      <div className="editor-header-bar">
        <div className="editor-left-controls">
          {/* Preset Selector */}
          <div className="preset-select-group">
            <label htmlFor="maze-preset-select" className="preset-label">
              Preset:
            </label>
            <select
              id="maze-preset-select"
              className="preset-select"
              value={selectedPresetId}
              onChange={(e) => onSelectPreset(e.target.value)}
              disabled={isRunning}
            >
              {Object.values(MAZE_PRESETS).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.difficulty})
                </option>
              ))}
            </select>
          </div>

          {/* Toggle Edit Mode button */}
          <button
            className={`btn btn-sm ${isEditMode ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setIsEditMode(!isEditMode)}
            disabled={isRunning}
            title={isRunning ? 'Editing disabled while mission runs' : 'Toggle student maze editing'}
          >
            <Pencil size={14} />
            <span>{isEditMode ? 'Close Editor' : 'Edit Maze'}</span>
          </button>

          {/* Restore Preset button */}
          <button
            className="btn btn-sm btn-ghost"
            onClick={onRestorePreset}
            disabled={isRunning}
            title="Restore selected original preset"
          >
            <RotateCcw size={14} />
            <span>Restore Preset</span>
          </button>
        </div>

        {/* Validation Status Pill */}
        <div
          className={`validation-badge ${
            validation.isValid ? 'validation-valid' : 'validation-invalid'
          }`}
          title={validation.errors.join(' | ')}
        >
          {validation.isValid ? (
            <>
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>Maze Ready</span>
            </>
          ) : (
            <>
              <AlertTriangle size={15} className="text-amber-600" />
              <span className="validation-text-truncate">{validation.message}</span>
            </>
          )}
        </div>
      </div>

      {/* Editor Tool Palette (Expanded when isEditMode is true) */}
      {isEditMode && (
        <div className="editor-palette animate-fade-in">
          <span className="palette-label">Click tile to place:</span>
          <div className="palette-buttons">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const isSelected = selectedTool === tool.id;
              return (
                <button
                  key={tool.id}
                  className={`btn-palette-tool ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedTool(tool.id)}
                  type="button"
                >
                  <Icon size={16} className={tool.color} />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

