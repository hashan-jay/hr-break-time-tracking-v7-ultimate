export default function SectionTitle({
  eyebrow,
  title,
  description,
  children,
  as = 'h2',
  compact = false,
  tone = '',
  className = '',
}) {
  const Heading = as === 'h1' ? 'h1' : 'h2';
  const classes = [
    'section-title-box',
    compact ? 'section-title-box--compact' : '',
    tone ? `dash-tone--${tone}` : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <header className={classes}>
      <div>
        {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
        <Heading>{title}</Heading>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}
