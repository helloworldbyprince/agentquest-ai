import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Key,
  Shield,
  Clock,
  Compass,
  Activity,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { MISSION_STATUS } from '../game/engine.js';

export function StatusPanel({
  status,
  robotPos,
  hasKey,
  doorUnlocked,
  stats,
  validation,
  onStart,
  onPause,
  onResume,
  onReset
}) {
  const isReady = status === MISSION_STATUS.READY;
  const isRunning = status === MISSION_STATUS.RUNNING;
  const isPaused = status === MISSION_STATUS.PAUSED;
  const isCompleted = status === MISSION_STATUS.COMPLETED;

  const mins = Math.floor(stats.elapsedSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (stats.elapsedSeconds % 60).toString().padStart(2, '0');
  const formattedTime = `${mins}:${secs}`;

  return (
    <div className="status-card">
      <div className="status-header">
        <div>
          <span className="status-label-sub">Agent State</span>
          <h2 className="status-title">Mission Overview</h2>
        </div>
        <div className={`status-pill status-${status}`}>
          <span className="status-dot"></span>
          <span className="status-text">{status.toUpperCase()}</span>
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
          <span className={`goal-step ${isCompleted ? 'completed' : doorUnlocked ? 'active' : 'pending'}`}>
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

      {/* Mission Controls Bar */}
      <div className="mission-actions-bar">
        {isReady && (
          <button
            className="btn btn-primary btn-full-width"
            onClick={onStart}
            disabled={!validation.isValid}
            title={validation.isValid ? 'Begin mission' : 'Solve maze errors before starting'}
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

        {isCompleted && (
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
      </div>
    </div>
  );
}

