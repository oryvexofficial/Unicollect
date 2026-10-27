import { useInView } from '../hooks.js';
/** fades/blurs content up when it scrolls into view; visible without JS */
export default function Reveal({ as: Tag = 'div', className = '', delay = 0, children, style, ...rest }) {
  const [ref, inView] = useInView();
  return <Tag ref={ref} className={`reveal ${inView ? 'in' : ''} ${className}`} style={{ '--rd': delay + 'ms', ...(style || {}) }} {...rest}>{children}</Tag>;
}
