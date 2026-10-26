import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  CheckCircle2,
  AlertCircle,
  Eye,
  Key,
  Unlock,
  Flag,
  ChevronDown,
  ChevronRight,
  Code
} from 'lucide-react';
import { LOG_TYPES } from '../game/engine.js';

function LogItem({ log }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Icon and badge styling by log type
  let Icon = Terminal;
  let badgeClass = 'badge-info';
  let badgeText = log.type.replace('_', ' ');

  if (log.type === LOG_TYPES.TOOL_CALL) {
    Icon = Code;
    badgeClass = 'badge-tool-call';
    badgeText = log.tool ? `${log.tool}()` : 'TOOL CALL';
  } else if (log.type === LOG_TYPES.ACTION_SUCCESS) {
    Icon = CheckCircle2;
    badgeClass = 'badge-success';
  } else if (log.type === LOG_TYPES.ACTION_FAILED) {
    Icon = AlertCircle;
    badgeClass = 'badge-failure';
  } else if (log.type === LOG_TYPES.OBSERVATION) {
    Icon = Eye;
    badgeClass = 'badge-observation';
  } else if (log.type === LOG_TYPES.OBJECT_COLLECTED) {
    Icon = Key;
    badgeClass = 'badge-key';
    badgeText = 'COLLECTED';
  } else if (log.type === LOG_TYPES.DOOR_UNLOCKED) {
    Icon = Unlock;
    badgeClass = 'badge-door';
    badgeText = 'UNLOCKED';
  } else if (log.type === LOG_TYPES.MISSION_COMPLETED) {
    Icon = Flag;
    badgeClass = 'badge-win';
    badgeText = 'COMPLETED';
  } else if (log.type === LOG_TYPES.MISSION_START) {
    Icon = Play;
    badgeClass = 'badge-start';
  }

  const hasPayload = log.payload && Object.keys(log.payload).length > 0;

  return (
    <div className={`log-entry log-entry-${log.status || 'info'}`}>
      <div className="log-entry-meta">
        <span className="log-id">#{String(log.id).padStart(2, '0')}</span>
        <span className={`log-badge ${badgeClass}`}>{badgeText}</span>
        <span className="log-time font-mono">{log.timestamp}</span>
      </div>

      <div className="log-content-row">
        <div className="log-icon-wrap">
          <Icon size={14} />
        </div>
        <p className="log-text">{log.text}</p>
      </div>

      {hasPayload && (
        <div className="log-payload-section">
          <button
            className="log-payload-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{isExpanded ? 'Hide observation data' : 'View tool observation'}</span>
          </button>

          {isExpanded && (
            <pre className="log-payload-json font-mono">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityLog({ logs }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new log entry
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="activity-card">
      <div className="activity-header">
        <div className="activity-title-wrap">
          <Terminal size={17} className="text-indigo-600" />
          <h2 className="activity-title">Live Activity Log</h2>
        </div>
        <span className="activity-count-badge font-mono">{logs.length} events</span>
      </div>
      <p className="activity-subtitle">
        Inspect real-time tool calls, engine responses, and observations.
      </p>

      <div className="activity-scroll-area" ref={scrollRef}>
        {logs.map((log) => (
          <LogItem key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}

