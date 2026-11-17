import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { STATUS_LABEL, type Availability } from "../lib/types";

export function Loading({ text = "טוען…" }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  );
}

export function ErrorNotice({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      {text}{" "}
      {onRetry && (
        <button type="button" className="btn sm" onClick={onRetry}>ניסיון נוסף</button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function StatusBadge({ status }: { status: Availability }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** כריכה, או תחליף מעוצב כשאין תמונה */
export function Cover({ title, author, url }: { title: string; author?: string | null; url?: string | null }) {
  if (url) {
    return (
      <div className="cover">
        <img src={url} alt={`כריכת הספר ${title}`} loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`cover placeholder c${hash(title) % 6}`} aria-hidden="true">
      <span className="pt">{title}</span>
      {author && <span className="pa">{author}</span>}
    </div>
  );
}

export function Dialog({
  title, open, onClose, children, footer,
}: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="סגירה">×</button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/** כפתור עם שלב אישור, לפעולות שקשה לבטל */
export function ConfirmButton({
  label, confirmLabel, onConfirm, busy, className = "btn sm",
}: { label: string; confirmLabel: string; onConfirm: () => void; busy?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? `${className} accent` : className}
      disabled={busy}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** מונע מסך ריק במקרה של שגיאת תצוגה בלתי צפויה */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="notice error" role="alert">
        <h3>אירעה שגיאה בהצגת העמוד</h3>
        <p>הנתונים עצמם לא נפגעו. אפשר לטעון את העמוד מחדש.</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>טעינה מחדש</button>
      </div>
    );
  }
}
