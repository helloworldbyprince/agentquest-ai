import React from 'react';
import { Trophy, CheckCircle2, RotateCcw, Clock, Activity, Bot } from 'lucide-react';

export function VictoryModal({ stats, onPlayAgain }) {
  const mins = Math.floor(stats.elapsedSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (stats.elapsedSeconds % 60).toString().padStart(2, '0');
  const formattedTime = `${mins}:${secs}`;

  return (
    <div className="modal-backdrop">
      <div className="victory-modal animate-scale-up" role="dialog" aria-modal="true">
        <div className="victory-icon-circle">
          <Trophy size={36} className="text-amber-500" />
        </div>

        <h2 className="victory-title">Mission Complete!</h2>
        <p className="victory-desc">
          Your robot successfully collected the key, unlocked the security gate, and escaped through the portal.
        </p>

        <div className="victory-stats-box">
          <div className="victory-stat-item">
            <Activity size={18} className="text-indigo-500" />
            <div className="victory-stat-content">
              <span className="victory-stat-value">{stats.toolCalls}</span>
              <span className="victory-stat-label">Total Tool Calls</span>
            </div>
          </div>

          <div className="victory-stat-item">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <div className="victory-stat-content">
              <span className="victory-stat-value">{stats.successfulActions}</span>
              <span className="victory-stat-label">Successful Moves</span>
            </div>
          </div>

          <div className="victory-stat-item">
            <Clock size={18} className="text-slate-500" />
            <div className="victory-stat-content">
              <span className="victory-stat-value font-mono">{formattedTime}</span>
              <span className="victory-stat-label">Total Time</span>
            </div>
          </div>
        </div>

        <div className="victory-actions">
          <button className="btn btn-primary btn-lg btn-full-width" onClick={onPlayAgain}>
            <RotateCcw size={18} />
            <span>Play Again</span>
          </button>
        </div>
      </div>
    </div>
  );
}

