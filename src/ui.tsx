import { X, ArrowUpRight, Film, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
export function Button({
  children,
  onClick,
  primary = false,
  small = false,
  disabled = false,
  type = "button",
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  small?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`button ${primary ? "primary" : ""} ${small ? "small" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  icon: Icon = Film,
  title,
  description,
  action,
}: {
  icon?: any;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={25} strokeWidth={1.3} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="row">{children}</div>
    </header>
  );
}
export function Badge({
  children,
  status = "",
}: {
  children: ReactNode;
  status?: string;
}) {
  return (
    <span className={`badge ${status}`}>
      {["done", "ready", "connected", "built"].includes(status) && <i />}
      {children}
    </span>
  );
}
export function Busy({ text = "Working…" }: { text?: string }) {
  return (
    <span className="row muted">
      <LoaderCircle className="spin" size={16} />
      {text}
    </span>
  );
}
export function StyleArt({
  style,
  large = false,
}: {
  style: string;
  large?: boolean;
}) {
  return (
    <div
      className={`style-art ${style} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <div className="sun" />
      <div className="hill h1" />
      <div className="hill h2" />
      <div className="subject">
        <div className="head" />
        <div className="body" />
        <div className="leg one" />
        <div className="leg two" />
      </div>
      <div className="art-card">
        <span />
        <span />
        <span />
      </div>
      <div className="art-spark">✳</div>
    </div>
  );
}
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
