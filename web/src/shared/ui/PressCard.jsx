// <PressCard/>: a printed card with a hard offset shadow. It lifts toward the
// pointer on hover and presses flat into the page on click, like a rubber
// stamp. Pure CSS (no gradients / spotlights). Replaces SpotlightCard + Tilt.
export default function PressCard({ as: Tag = 'div', className = '', children, ...rest }) {
  return <Tag className={'press-card ' + className} {...rest}>{children}</Tag>;
}
