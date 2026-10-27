// The Unicollect mark: six tapered petals around a core.
// mode: "" | "intro" (petals pop in) | "live" (thinking wave) | "spin"
const PETAL = 'M12 1.5c1.9 0 2.6 2.1 1.9 4.1l-.9 2.5c-.35.95-1.65.95-2 0l-.9-2.5C9.4 3.6 10.1 1.5 12 1.5z';

export default function PetalMark({ mode = '', className = '', style, title }) {
  return (
    <svg className={`pg-mark ${mode} ${className}`} viewBox="0 0 24 24" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} style={style}>
      {title ? <title>{title}</title> : null}
      {[0, 1, 2, 3, 4, 5].map(k => (
        <g key={k} transform={`rotate(${k * 60} 12 12)`}>
          <path className="pt" style={{ '--k': k }} d={PETAL} />
        </g>
      ))}
      <circle className="core" cx="12" cy="12" r="2.1" />
    </svg>
  );
}
