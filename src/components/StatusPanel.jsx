import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Key,
  Clock,
  Compass,
  Activity,
  Bot,
  Square,
  Sparkles,
  Sliders
} from 'lucide-react';
import { MISSION_STATUS } from '../game/engine.js';
import { AGENT_SPEEDS } from '../hooks/useAgentRunner.js';

export function StatusPanel({
  status,
  robotPos,
  hasKey,
  doorUnlocked,
  stats,
  validation,
  gameMode = 'manual',
  agentSpeed = AGENT_SPEEDS.fast.ms,
  onSpeedChange,
  isAgentBusy = false,
  activeProvider = 'groq',
  activeModel = 'openai/gpt-oss-20b',
  onStart,
  onPause,
  onResume,
  onReset,
  onStartAgent,
  onPauseAgent,
  onResumeAgent,
  onStopAgent
}) {
  const isReady = status === MISSION_STATUS.READY;
  const isExploring = status === MISSION_STATUS.EXPLORING;
  const isReplanning = status === MISSION_STATUS.REPLANNING;
  const isWaitingAI = status === MISSION_STATUS.WAITING_AI;
  const isRunning = status === MISSION_STATUS.RUNNING || isExploring || isReplanning || isWaitingAI;
  const isPaused = status === MISSION_STATUS.PAUSED;
  const isLimitReached = status === MISSION_STATUS.LIMIT_REACHED;
  const isCompleted = status === MISSION_STATUS.COMPLETED;
  const isFailed = status === MISSION_STATUS.FAILED;

  let displayStatus = status.toUpperCase();
  if (isExploring) displayStatus = 'EXPLORING';
  else if (isReplanning) displayStatus = 'REPLANNING';
  else if (isWaitingAI) displayStatus = 'WAITING FOR AI';
  else if (isLimitReached) displayStatus = 'LIMIT REACHED';
  else if (status === MISSION_STATUS.RUNNING) displayStatus = 'RUNNING';

  const mins = Math.floor(stats.elapsedSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (stats.elapsedSeconds % 60).toString().padStart(2, '0');
  const formattedTime = `${mins}:${secs}`;

  return (
    <div className="status-card">
      <div className="status-header">
        <div>
          <div className="status-mode-indicator">
            <span className="status-label-sub">Mode: </span>
            <span className="status-mode-tag">
              {gameMode === 'agent' ? '🤖 Autonomous AI Agent' : '🎮 Manual Player'}
            </span>
            {gameMode === 'agent' && (
              <span
                className={`active-model-pill ${activeProvider === 'ollama' ? 'provider-ollama' : activeProvider === 'groq' ? 'provider-groq' : 'provider-gemini'}`}
                title={`Active AI Provider: ${activeProvider.toUpperCase()} (${activeModel})`}
              >
                {activeProvider === 'ollama' ? '💻 Local: ' : activeProvider === 'groq' ? '⚡ Groq: ' : '✨ Gemini: '}
                {activeModel.includes('/') ? activeModel.split('/')[1] : activeModel}
              </span>
            )}
          </div>
          <h2 className="status-title">Mission Overview</h2>
        </div>
        <div className={`status-pill status-${status}`}>
          <span className="status-dot"></span>
          <span className="status-text">{displayStatus}</span>
        </div>
      </div>

      {/* Goal Pathway */}
      <div className="mission-goal-container">
        <span className="goal-label">Objective:</span>
        <div className="goal-flow">
          <span className={`goal-step ${hasKey ? 'completed' : 'active'}`}>
            {hasKey ? '✓ Key' : '1. Find Key'}
          </span>
          <span className="goal-arrow">→</span>
          <span
            className={`goal-step ${
              doorUnlocked ? 'completed' : hasKey ? 'active' : 'pending'
            }`}
          >
            {doorUnlocked ? '✓ Door' : '2. Unlock Door'}
          </span>
          <span className="goal-arrow">→</span>
          <span
            className={`goal-step ${
              isCompleted ? 'completed' : doorUnlocked ? 'active' : 'pending'
            }`}
          >
            {isCompleted ? '✓ Escaped' : '3. Reach Exit'}
          </span>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="status-stats-grid">
        {/* Position */}
        <div className="stat-box">
          <div className="stat-label">
            <Compass size={14} className="text-indigo-500" />
            <span>Position</span>
          </div>
          <div className="stat-value">
            ({robotPos.row}, {robotPos.col})
          </div>
        </div>

        {/* Inventory */}
        <div className="stat-box">
          <div className="stat-label">
            <Key size={14} className={hasKey ? 'text-amber-500' : 'text-slate-400'} />
            <span>Inventory</span>
          </div>
          <div className={`stat-value ${hasKey ? 'text-amber-600 font-semibold' : ''}`}>
            {hasKey ? 'Key in hand' : 'Empty'}
          </div>
        </div>

        {/* Tool Actions */}
        <div className="stat-box">
          <div className="stat-label">
            <Activity size={14} className="text-indigo-500" />
            <span>Tool Calls</span>
          </div>
          <div className="stat-value">
            {stats.toolCalls}
            <span className="stat-sub-counts">
              (<span className="text-emerald-600">{stats.successfulActions}</span> /{' '}
              <span className="text-rose-500">{stats.failedActions}</span>)
            </span>
          </div>
        </div>

        {/* Timer */}
        <div className="stat-box">
          <div className="stat-label">
            <Clock size={14} className="text-slate-500" />
            <span>Time</span>
          </div>
          <div className="stat-value font-mono">{formattedTime}</div>
        </div>
      </div>

      {/* Speed Selector (AI Agent Mode Only) */}
      {gameMode === 'agent' && (
        <div className="agent-speed-bar">
          <div className="speed-title-wrap">
            <Sliders size={13} className="text-indigo-500" />
            <span className="speed-label">Playback Delay:</span>
          </div>
          <div className="speed-btn-group" role="group" aria-label="Playback Speed">
            {Object.values(AGENT_SPEEDS).map((s) => (
              <button
                key={s.id}
                type="button"
                className={`speed-btn ${agentSpeed === s.ms ? 'active' : ''}`}
                onClick={() => onSpeedChange && onSpeedChange(s.ms)}
                title={`${s.label} between robot tool steps`}
              >
                {s.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mission Controls Bar */}
      <div className="mission-actions-bar">
        {gameMode === 'agent' ? (
          /* AI AGENT CONTROLS */
          <>
            {isReady && (
              <button
                className="btn btn-primary btn-full-width"
                onClick={onStartAgent}
                disabled={!validation.isValid || isAgentBusy}
                title={validation.isValid ? 'Launch Gemini autonomous agent loop' : 'Fix maze errors first'}
              >
                <Bot size={16} />
                <span>Start AI Agent</span>
              </button>
            )}

            {isRunning && (
              <div className="agent-active-buttons">
                <button
                  className="btn btn-warning btn-flex"
                  onClick={onPauseAgent}
                  title="Pause agent after current action"
                >
                  <Pause size={16} />
                  <span>Pause Agent</span>
                </button>
                <button
                  className="btn btn-danger btn-flex"
                  onClick={onStopAgent}
                  title="Stop agent mission"
                >
                  <Square size={14} />
                  <span>Stop Agent</span>
                </button>
              </div>
            )}

            {(isPaused || isLimitReached) && (
              <div className="agent-active-buttons">
                <button
                  className="btn btn-primary btn-flex"
                  onClick={onResumeAgent}
                  title="Resume agent mission"
                >
                  <Play size={16} />
                  <span>Resume Agent</span>
                </button>
                <button
                  className="btn btn-danger btn-flex"
                  onClick={onStopAgent}
                  title="Stop agent mission"
                >
                  <Square size={14} />
                  <span>Stop Agent</span>
                </button>
              </div>
            )}

            {(isCompleted || isFailed) && (
              <button className="btn btn-primary btn-full-width" onClick={onReset}>
                <RotateCcw size={16} />
                <span>{isCompleted ? 'Mission Complete! Reset' : 'Mission Failed. Reset'}</span>
              </button>
            )}
          </>
        ) : (
          /* MANUAL MODE CONTROLS */
          <>
            {isReady && (
              <button
                className="btn btn-primary btn-full-width"
                onClick={onStart}
                disabled={!validation.isValid}
                title={validation.isValid ? 'Begin manual mission' : 'Solve maze errors before starting'}
              >
                <Play size={16} />
                <span>Start Mission</span>
              </button>
            )}

            {isRunning && (
              <button className="btn btn-warning btn-full-width" onClick={onPause}>
                <Pause size={16} />
                <span>Pause Mission</span>
              </button>
            )}

            {isPaused && (
              <button className="btn btn-primary btn-full-width" onClick={onResume}>
                <Play size={16} />
                <span>Resume Mission</span>
              </button>
            )}

            {(isCompleted || isFailed) && (
              <button className="btn btn-primary btn-full-width" onClick={onReset}>
                <RotateCcw size={16} />
                <span>Play Again</span>
              </button>
            )}

            {(isRunning || isPaused) && (
              <button className="btn btn-outline" onClick={onReset} title="Reset to start">
                <RotateCcw size={16} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
