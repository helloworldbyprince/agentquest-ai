import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  createInitialState,
  dispatchToolCall,
  applyEditorAction,
  createLogEntry,
  MISSION_STATUS
} from './game/engine.js';
import { DEFAULT_PRESET_ID, MAZE_PRESETS } from './game/mazes.js';
import { useAgentRunner } from './hooks/useAgentRunner.js';
import { Header } from './components/Header.jsx';
import { MazeGrid } from './components/MazeGrid.jsx';
import { EditToolbar } from './components/EditToolbar.jsx';
import { ManualControls } from './components/ManualControls.jsx';
import { StatusPanel } from './components/StatusPanel.jsx';
import { ActivityLog } from './components/ActivityLog.jsx';
import { VictoryModal } from './components/VictoryModal.jsx';
import { Footer } from './components/Footer.jsx';
import { Compass, Square, Key, Lock, Unlock, Flag, Bot } from 'lucide-react';

export function App() {
  const [gameState, setGameState] = useState(() => createInitialState(DEFAULT_PRESET_ID));
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET_ID);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedEditorTool, setSelectedEditorTool] = useState('wall');
  const [gameMode, setGameMode] = useState('agent'); // 'manual' | 'agent'

  // Autonomous Agent Runner Hook
  const {
    speed,
    setSpeed,
    isAgentBusy,
    activeProvider,
    activeModel,
    startAgent,
    pauseAgent,
    resumeAgent,
    stopAgent
  } = useAgentRunner({
    gameState,
    setGameState,
    selectedPresetId
  });

  // Timer interval for elapsed time when running
  useEffect(() => {
    let interval = null;
    if (gameState.status === MISSION_STATUS.RUNNING) {
      interval = setInterval(() => {
        setGameState((prev) => ({
          ...prev,
          stats: {
            ...prev.stats,
            elapsedSeconds: prev.stats.elapsedSeconds + 1
          }
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState.status]);

  // Tool Call Handler (Manual UI and Keyboard trigger this same handler)
  const handleToolCall = useCallback((toolName, ...args) => {
    setGameState((prev) => dispatchToolCall(prev, toolName, ...args));
  }, []);

  // Tile Click in Edit Mode
  const handleTileClick = useCallback(
    (row, col) => {
      if (!isEditMode) return;
      if (gameState.status === MISSION_STATUS.RUNNING) return;
      setGameState((prev) => applyEditorAction(prev, row, col, selectedEditorTool));
    },
    [isEditMode, gameState.status, selectedEditorTool]
  );

  // Preset Selection
  const handleSelectPreset = useCallback((presetId) => {
    setSelectedPresetId(presetId);
    setGameState(createInitialState(presetId));
    setIsEditMode(false);
  }, []);

  // Restore Preset
  const handleRestorePreset = useCallback(() => {
    setGameState(createInitialState(selectedPresetId));
  }, [selectedPresetId]);

  // Mission Start
  const handleStartMission = useCallback(() => {
    if (!gameState.validation.isValid) return;
    setIsEditMode(false);
    setGameState((prev) => ({
      ...createInitialState(prev.presetId, prev.grid),
      status: MISSION_STATUS.RUNNING
    }));
  }, [gameState.validation.isValid]);

  // Mission Pause
  const handlePauseMission = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      status: MISSION_STATUS.PAUSED
    }));
  }, []);

  // Mission Resume
  const handleResumeMission = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      status: MISSION_STATUS.RUNNING
    }));
  }, []);

  // Reset Mission
  const handleResetMission = useCallback(() => {
    stopAgent();
    setGameState((prev) => createInitialState(prev.presetId, prev.grid));
  }, [stopAgent]);

  // Add system / API log entry
  const handleAddLog = useCallback((type, text, details = {}) => {
    setGameState((prev) => ({
      ...prev,
      logs: [
        ...prev.logs,
        createLogEntry(type, text, {
          ...details,
          elapsedSeconds: prev.stats.elapsedSeconds
        })
      ]
    }));
  }, []);

  const isRunning = gameState.status === MISSION_STATUS.RUNNING;
  const isCompleted = gameState.status === MISSION_STATUS.COMPLETED;

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        gameMode={gameMode}
        onModeChange={setGameMode}
        onReset={handleResetMission}
        isRunning={isRunning}
        onAddLog={handleAddLog}
      />

      {/* Main Game Dashboard */}
      <main className="dashboard-layout">
        {/* Left Side: Maze, Editor, Legend, Manual Controls */}
        <section className="maze-section" aria-label="Game Board and Controls">
          {/* Student Editor Bar & Preset Selector */}
          <EditToolbar
            isEditMode={isEditMode}
            setIsEditMode={setIsEditMode}
            selectedTool={selectedEditorTool}
            setSelectedTool={setSelectedEditorTool}
            validation={gameState.validation}
            selectedPresetId={selectedPresetId}
            onSelectPreset={handleSelectPreset}
            onRestorePreset={handleRestorePreset}
            missionStatus={gameState.status}
          />

          {/* 9x9 Interactive Maze Grid */}
          <MazeGrid
            grid={gameState.grid}
            robot={gameState.robot}
            hasKey={gameState.hasKey}
            doorUnlocked={gameState.doorUnlocked}
            isEditMode={isEditMode}
            onTileClick={handleTileClick}
          />

          {/* Compact Legend for Projector Visibility */}
          <div className="maze-legend" aria-label="Map Legend">
            <div className="legend-item">
              <span className="legend-swatch swatch-start">
                <Compass size={13} className="text-indigo-600" />
              </span>
              <span>Start</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch swatch-wall">
                <Square size={13} className="text-slate-600" />
              </span>
              <span>Wall</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch swatch-key">
                <Key size={13} className="text-amber-600" />
              </span>
              <span>Key</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch swatch-door">
                {gameState.doorUnlocked ? (
                  <Unlock size={13} className="text-emerald-600" />
                ) : (
                  <Lock size={13} className="text-rose-500" />
                )}
              </span>
              <span>{gameState.doorUnlocked ? 'Door (Unlocked)' : 'Locked Door'}</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch swatch-exit">
                <Flag size={13} className="text-emerald-600" />
              </span>
              <span>Exit Portal</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch swatch-robot">
                <Bot size={13} className="text-indigo-600" />
              </span>
              <span>Agent Robot</span>
            </div>
          </div>

          {/* Manual Controls */}
          <ManualControls
            onToolCall={handleToolCall}
            missionStatus={gameState.status}
            hasKey={gameState.hasKey}
            doorUnlocked={gameState.doorUnlocked}
            gameMode={gameMode}
            disabled={isEditMode}
          />
        </section>

        {/* Right Side: Status Panel & Live Activity Log */}
        <aside className="sidebar-section" aria-label="Agent Activity & Status">
          {/* Status Panel */}
          <StatusPanel
            status={gameState.status}
            robotPos={{ row: gameState.robot.row, col: gameState.robot.col }}
            hasKey={gameState.hasKey}
            doorUnlocked={gameState.doorUnlocked}
            stats={gameState.stats}
            validation={gameState.validation}
            gameMode={gameMode}
            agentSpeed={speed}
            onSpeedChange={setSpeed}
            isAgentBusy={isAgentBusy}
            activeProvider={activeProvider}
            activeModel={activeModel}
            onStart={handleStartMission}
            onPause={handlePauseMission}
            onResume={handleResumeMission}
            onReset={handleResetMission}
            onStartAgent={startAgent}
            onPauseAgent={pauseAgent}
            onResumeAgent={resumeAgent}
            onStopAgent={stopAgent}
          />

          {/* Live Activity Feed */}
          <ActivityLog logs={gameState.logs} />
        </aside>
      </main>

      {/* Educational Footer */}
      <Footer />

      {/* Victory Celebration Modal */}
      {isCompleted && (
        <VictoryModal
          stats={gameState.stats}
          onPlayAgain={handleResetMission}
        />
      )}
    </div>
  );
}
export default App;

