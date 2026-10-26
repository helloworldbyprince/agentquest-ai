import React from 'react';

/**
 * Cute, lovable robot character rendered in vector SVG.
 * Expressive eyes, subtle blush, glowing antenna, and key badge when collected.
 */
export function Robot({ facing = 'south', animation = null, hasKey = false }) {
  // Gaze offsets based on facing direction
  let eyeOffsetX = 0;
  let eyeOffsetY = 0;
  if (facing === 'north') eyeOffsetY = -2;
  if (facing === 'south') eyeOffsetY = 1;
  if (facing === 'east') eyeOffsetX = 3;
  if (facing === 'west') eyeOffsetX = -3;

  return (
    <div className={`robot-character-wrapper ${animation || ''}`}>
      <svg
        viewBox="0 0 64 64"
        className="robot-svg"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Agent Robot"
      >
        <defs>
          {/* Soft body gradient */}
          <linearGradient id="bodyGrad" x1="16" y1="16" x2="48" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E9EDFF" />
          </linearGradient>

          {/* Visor gradient */}
          <linearGradient id="visorGrad" x1="18" y1="26" x2="46" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#243047" />
            <stop offset="1" stopColor="#1E2738" />
          </linearGradient>

          {/* Antenna glow */}
          <radialGradient id="antennaGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7C8CF8" />
            <stop offset="100%" stopColor="#6366F1" />
          </radialGradient>

          {/* Shadow filter */}
          <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.12" floodColor="#1E293B" />
          </filter>
        </defs>

        {/* Ambient base shadow */}
        <ellipse cx="32" cy="59" rx="14" ry="3.5" fill="#CBD5E1" opacity="0.6" />

        {/* Antenna rod */}
        <line x1="32" y1="15" x2="32" y2="21" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
        {/* Antenna bulb with pulsing glow */}
        <circle cx="32" cy="13" r="4" fill="url(#antennaGlow)" className="antenna-bulb" />
        <circle cx="32" cy="13" r="2" fill="#FFFFFF" opacity="0.8" />

        {/* Robot head/body chassis */}
        <rect
          x="14"
          y="20"
          width="36"
          height="34"
          rx="12"
          fill="url(#bodyGrad)"
          stroke="#C7D2FE"
          strokeWidth="1.75"
          filter="url(#softShadow)"
        />

        {/* Cute ear nubs */}
        <rect x="10" y="31" width="4" height="8" rx="2" fill="#A5B4FC" />
        <rect x="50" y="31" width="4" height="8" rx="2" fill="#A5B4FC" />

        {/* Visor display screen */}
        <rect x="18" y="27" width="28" height="17" rx="6" fill="url(#visorGrad)" />

        {/* Expressive robot eyes */}
        <g transform={`translate(${eyeOffsetX}, ${eyeOffsetY})`}>
          {/* Left eye */}
          <circle cx="26" cy="35" r="3.6" fill="#60A5FA" />
          <circle cx="27.2" cy="33.8" r="1.3" fill="#FFFFFF" />

          {/* Right eye */}
          <circle cx="38" cy="35" r="3.6" fill="#60A5FA" />
          <circle cx="39.2" cy="33.8" r="1.3" fill="#FFFFFF" />
        </g>

        {/* Subtle cute blush dots on cheeks */}
        <circle cx="21" cy="48" r="2.2" fill="#FCA5A5" opacity="0.6" />
        <circle cx="43" cy="48" r="2.2" fill="#FCA5A5" opacity="0.6" />

        {/* Cute belly heart/power core */}
        <circle cx="32" cy="48" r="2" fill="#818CF8" />

        {/* Tiny feet */}
        <rect x="22" y="53" width="6" height="4" rx="2" fill="#94A3B8" />
        <rect x="36" y="53" width="6" height="4" rx="2" fill="#94A3B8" />

        {/* Key bag/carried key badge if collected */}
        {hasKey && (
          <g className="key-badge" transform="translate(42, 16)">
            <circle cx="6" cy="6" r="6" fill="#FEF08A" stroke="#EAB308" strokeWidth="1" />
            <path
              d="M4 6a2 2 0 1 1 3.5 1.3L5 9.5h2v1H5v.5H4L4 6z"
              fill="#CA8A04"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

