import type { ScenarioId } from '../../engine';

/** Pure-SVG backdrops, one per game style. Decorative only (aria-hidden). */
const STARS = [[40, 40], [120, 90], [210, 30], [330, 70], [470, 36], [560, 96], [650, 44], [730, 84], [760, 24], [90, 150], [420, 120], [690, 140]];

function Stars({ opacity = 0.8 }: { opacity?: number }) {
  return (
    <g fill="#fff" opacity={opacity}>
      {STARS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.3} className="tc-twinkle" style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
      ))}
    </g>
  );
}

function Homework() {
  return (
    <>
      <defs>
        <linearGradient id="sc-hw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b6b" />
          <stop offset="0.6" stopColor="#3b4fd6" />
          <stop offset="1" stopColor="#f5a76b" />
        </linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#sc-hw)" />
      <Stars opacity={0.7} />
      <circle cx="610" cy="110" r="46" fill="#fff6d6" opacity="0.95" />
      <circle cx="628" cy="100" r="40" fill="#3b4fd6" opacity="0.35" />
      <g className="tc-float" fill="#fde68a">
        <rect x="120" y="130" width="64" height="44" rx="6" transform="rotate(-12 150 150)" />
        <rect x="300" y="80" width="56" height="38" rx="6" fill="#fca5a5" transform="rotate(9 328 100)" />
        <rect x="470" y="150" width="60" height="40" rx="6" fill="#a7f3d0" transform="rotate(-6 500 170)" />
      </g>
      <path d="M0 330 Q200 290 400 320 T800 300 V400 H0Z" fill="#1b1448" />
      <path d="M0 360 Q220 330 420 352 T800 340 V400 H0Z" fill="#0f0c2e" />
      <rect x="90" y="300" width="110" height="10" rx="4" fill="#fbbf24" />
      <rect x="110" y="270" width="70" height="30" rx="4" fill="#38bdf8" />
    </>
  );
}

function InClass() {
  return (
    <>
      <defs>
        <linearGradient id="sc-ic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a0a2e" />
          <stop offset="0.7" stopColor="#be123c" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="sc-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#sc-ic)" />
      <g className="tc-sweep" style={{ transformOrigin: '200px 0' }}><polygon points="200,0 120,400 300,400" fill="url(#sc-beam)" /></g>
      <g className="tc-sweep-r" style={{ transformOrigin: '600px 0' }}><polygon points="600,0 520,400 700,400" fill="url(#sc-beam)" /></g>
      <circle cx="400" cy="120" r="58" fill="none" stroke="#fde68a" strokeWidth="6" opacity="0.9" />
      <path d="M400 120 L400 84 M400 120 L428 134" stroke="#fde68a" strokeWidth="6" strokeLinecap="round" />
      <g fill="#12060f">
        {Array.from({ length: 16 }).map((_, i) => <circle key={i} cx={30 + i * 49} cy={372 + (i % 3) * 6} r={22 + (i % 2) * 4} />)}
        <rect y="388" width="800" height="12" />
      </g>
    </>
  );
}

function CoopRaid() {
  return (
    <>
      <defs>
        <linearGradient id="sc-cr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0420" />
          <stop offset="0.65" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#c026d3" />
        </linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#sc-cr)" />
      <Stars />
      <circle cx="560" cy="120" r="70" fill="#f5e9ff" opacity="0.95" />
      <circle cx="585" cy="108" r="60" fill="#6d28d9" opacity="0.28" />
      <g className="tc-bob" style={{ transformOrigin: '560px 120px' }}>
        <path d="M470 130 C500 70 540 90 560 120 C580 90 625 70 660 128 C630 112 600 126 585 148 L560 134 L535 148 C520 124 495 116 470 130Z" fill="#0b0420" />
      </g>
      <path d="M0 330 L90 240 L170 310 L260 210 L350 300 L430 250 L520 320 L640 230 L730 300 L800 260 V400 H0Z" fill="#2a0a52" />
      <g fill="#12052b">
        <rect x="60" y="270" width="26" height="70" /><polygon points="56,270 73,240 90,270" />
        <rect x="100" y="285" width="22" height="55" /><polygon points="96,285 111,262 126,285" />
        <rect x="140" y="260" width="30" height="80" /><polygon points="136,260 155,228 174,260" />
      </g>
      <path d="M0 360 Q200 335 400 355 T800 345 V400 H0Z" fill="#12052b" />
    </>
  );
}

function BoatRace() {
  return (
    <>
      <defs>
        <linearGradient id="sc-br" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="0.52" stopColor="#22d3ee" />
          <stop offset="0.53" stopColor="#0e7490" />
          <stop offset="1" stopColor="#064e3b" />
        </linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#sc-br)" />
      <circle cx="170" cy="120" r="54" fill="#fef08a" />
      <circle cx="170" cy="120" r="80" fill="#fef08a" opacity="0.25" />
      <g fill="#fff" opacity="0.85" className="tc-drift">
        <ellipse cx="470" cy="70" rx="60" ry="16" /><ellipse cx="510" cy="58" rx="38" ry="14" />
        <ellipse cx="680" cy="110" rx="50" ry="13" />
      </g>
      <g className="tc-bob" style={{ transformOrigin: '520px 230px' }}>
        <path d="M440 232 H610 L580 262 H474Z" fill="#f97316" />
        <path d="M526 224 V150 L580 224Z" fill="#fff" />
        <path d="M520 224 V162 L478 224Z" fill="#fde68a" />
      </g>
      <g className="tc-wave" fill="#0891b2" opacity="0.7"><path d="M-200 262 q50 -22 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 V400 H-200Z" /></g>
      <g className="tc-wave-r" fill="#155e75" opacity="0.8"><path d="M-200 300 q50 -22 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 V400 H-200Z" /></g>
      <g fill="#ef4444"><circle cx="90" cy="300" r="9" /><circle cx="300" cy="320" r="9" /><circle cx="720" cy="310" r="9" /></g>
    </>
  );
}

export default function Scenery({ id, className = '' }: { id: ScenarioId; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" className={`pointer-events-none ${className}`}>
      {id === 'homework' && <Homework />}
      {id === 'in_class' && <InClass />}
      {id === 'coop_raid' && <CoopRaid />}
      {id === 'boat_race' && <BoatRace />}
    </svg>
  );
}
