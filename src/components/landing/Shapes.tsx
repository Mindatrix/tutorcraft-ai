/** Decorative shapes for the landing page: wave dividers, hand-drawn doodles, curved slogan. */

export function Wave({ fill, flip = false, className = '' }: { fill: string; flip?: boolean; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 120" preserveAspectRatio="none" className={`block w-full h-[48px] md:h-[96px] ${flip ? 'rotate-180' : ''} ${className}`}>
      <path d="M0,70 C180,120 360,10 600,52 C840,94 1040,8 1240,40 C1340,56 1400,72 1440,64 L1440,120 L0,120Z" fill={fill} />
    </svg>
  );
}

export function DoodleStar({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 80 80" className={className}><path className="tc-doodle" d="M40 6 C43 24 48 30 74 38 C50 44 44 52 40 74 C36 52 30 44 6 40 C30 32 36 26 40 6Z" /></svg>
  );
}

export function DoodleBook({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 80" className={className}>
      <path className="tc-doodle" d="M6 14 C28 8 40 12 50 20 C60 12 72 8 94 14 L94 66 C72 60 60 64 50 72 C40 64 28 60 6 66Z" />
      <path className="tc-doodle" d="M50 20 L50 72 M16 28 C26 26 34 28 42 32 M16 40 C26 38 34 40 42 44 M58 32 C66 28 74 26 84 28" />
    </svg>
  );
}

export function DoodleSword({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 80 120" className={className}>
      <path className="tc-doodle" d="M40 6 L47 70 L33 70Z M24 76 L56 76 M40 76 L40 104 M33 108 C36 112 44 112 47 108" />
    </svg>
  );
}

export function DoodleSwirl({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 60" className={className}><path className="tc-doodle" d="M6 40 C20 6 40 6 40 30 C40 50 22 48 28 34 C36 16 66 14 74 34 C80 48 96 48 114 22" /></svg>
  );
}

export function CurvedSlogan({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden={false} role="img" aria-label="Học mà chơi, chơi mà học" viewBox="0 0 900 190" className={className}>
      <path id="tc-arc" d="M30,150 C240,10 640,10 870,130" fill="none" />
      <text fontFamily="var(--font-display), sans-serif" fontWeight={800} fontSize={64} textAnchor="middle">
        <textPath href="#tc-arc" startOffset="50%">
          <tspan fill="#fb923c">Học mà chơi,</tspan> <tspan fill="#1b1448">chơi mà </tspan><tspan fill="#ec4899">học.</tspan>
        </textPath>
      </text>
    </svg>
  );
}
