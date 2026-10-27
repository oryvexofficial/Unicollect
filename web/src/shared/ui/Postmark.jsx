// <Postmark/>: a solid cancellation mark for the hero. A purple disc, a
// slowly turning dashed ring and five wavy cancel lines, all flat ink.
// Replaces the WebGL InkField cloud.
export default function Postmark({ className = '' }) {
  return (
    <svg className={'postmark ' + className} viewBox="0 0 600 600" aria-hidden="true">
      <circle className="pm-disc" cx="300" cy="300" r="190" />
      <g className="pm-ring"><circle cx="300" cy="300" r="236" /></g>
      <g className="pm-waves">
        {[0, 1, 2, 3, 4].map(i => (
          <path key={i} d={`M-40 ${200 + i * 50} q40 -22 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0`} />
        ))}
      </g>
    </svg>
  );
}
