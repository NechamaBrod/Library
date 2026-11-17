import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/hooks";

const cls = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

export default function Layout({ children }: { children: ReactNode }) {
  const { session, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <a href="#main" className="sr-only">דילוג לתוכן</a>
      <header className="site-header">
        <div className="inner">
          <Link to="/" className="brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <rect x="4" y="6" width="6" height="21" rx="1.5" fill="#46624e" />
              <rect x="12" y="3" width="6" height="24" rx="1.5" fill="#b5553a" />
              <rect x="20" y="9" width="6" height="18" rx="1.5" fill="#7c9a82" transform="rotate(8 23 18)" />
              <rect x="2" y="27" width="28" height="2.5" rx="1" fill="#2e2a25" />
            </svg>
            הספרייה שלי
          </Link>
          <nav className="nav" aria-label="ניווט ראשי">
            <NavLink to="/" end className={cls}>קטלוג</NavLink>
            <NavLink to="/recommend" className={cls}>עזרה בבחירת ספר</NavLink>
            {isAdmin && (
              <>
                <span className="nav-sep" aria-hidden="true" />
                <span className="nav-admin-label">ניהול</span>
                <NavLink to="/admin" end className={cls}>אצל מי הספרים?</NavLink>
                <NavLink to="/admin/books" className={cls}>ספרים</NavLink>
                <NavLink to="/admin/borrowers" className={cls}>קוראות</NavLink>
                <NavLink to="/admin/shelf" className={cls}>הוספה מתמונה</NavLink>
                <NavLink to="/admin/export" className={cls}>ייצוא</NavLink>
              </>
            )}
          </nav>
          <span className="spacer" />
          {session && (
            <nav className="nav" aria-label="חשבון">
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                יציאה
              </button>
            </nav>
          )}
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        {!session && <Link to="/login">כניסת מנהלת</Link>}
      </footer>
    </>
  );
}
