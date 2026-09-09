import { ArrowRight } from 'lucide-react';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function ProductPage({ children, className = '', containerClassName = '' }) {
  return (
    <div className={cx('nx-page-scroll custom-scrollbar', className)}>
      <div className={cx('nx-page-container', containerClassName)}>{children}</div>
    </div>
  );
}

export function PageHero({ eyebrow, icon: Icon, title, description, actions, aside, className = '' }) {
  return (
    <header className={cx('nx-page-hero', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="nx-eyebrow">
            {Icon ? <Icon size={15} aria-hidden /> : null}
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <h1 className="nx-page-title">{title}</h1>
        {description ? <p className="nx-page-lead">{description}</p> : null}
        {actions ? <div className="nx-page-actions">{actions}</div> : null}
      </div>
      {aside ? <div className="nx-page-hero__aside">{aside}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, description, action, className = '' }) {
  return (
    <div className={cx('nx-section-heading', className)}>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SurfaceCard({ as: Tag = 'div', interactive = false, className = '', children, ...props }) {
  return (
    <Tag
      className={cx('nx-panel', interactive && 'nx-panel--interactive', className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction, className = '' }) {
  return (
    <div className={cx('nx-empty-state', className)}>
      {Icon ? (
        <div className="nx-empty-state__icon">
          <Icon size={26} aria-hidden />
        </div>
      ) : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

export function PrimaryAction({ children, trailing = true, className = '', ...props }) {
  return (
    <button type="button" className={cx('nx-btn nx-btn--primary', className)} {...props}>
      {children}
      {trailing ? <ArrowRight size={17} aria-hidden /> : null}
    </button>
  );
}

export function SecondaryAction({ children, className = '', ...props }) {
  return (
    <button type="button" className={cx('nx-btn nx-btn--secondary', className)} {...props}>
      {children}
    </button>
  );
}
