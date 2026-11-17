import { Navigate, Route, Routes } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import { AuthProvider, ToastProvider, useAuth } from "./lib/hooks";
import Layout from "./components/Layout";
import { ErrorBoundary, Loading } from "./components/ui";
import SetupNeeded from "./pages/SetupNeeded";
import CatalogPage from "./pages/CatalogPage";
import BookPage from "./pages/BookPage";
import RecommendPage from "./pages/RecommendPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/admin/DashboardPage";
import BooksPage from "./pages/admin/BooksPage";
import BookEditPage from "./pages/admin/BookEditPage";
import BorrowersPage from "./pages/admin/BorrowersPage";
import BorrowerPage from "./pages/admin/BorrowerPage";
import ShelfImportPage from "./pages/admin/ShelfImportPage";
import ExportPage from "./pages/admin/ExportPage";

function AdminOnly({ children }: { children: JSX.Element }) {
  const { session, isAdmin, loading, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="notice error" role="alert">
        <h3>אין הרשאת מנהלת</h3>
        <p>החשבון מחובר, אך אינו רשום כמנהלת הספרייה. הוספת מנהלת נעשית ישירות במסד הנתונים (ראו README).</p>
        <button type="button" className="btn" onClick={() => void signOut()}>יציאה</button>
      </div>
    );
  }
  return children;
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />;
  return (
    <AuthProvider>
      <ToastProvider>
        <Layout>
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/book/:id" element={<BookPage />} />
            <Route path="/recommend" element={<RecommendPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<AdminOnly><DashboardPage /></AdminOnly>} />
            <Route path="/admin/books" element={<AdminOnly><BooksPage /></AdminOnly>} />
            <Route path="/admin/books/:id" element={<AdminOnly><BookEditPage /></AdminOnly>} />
            <Route path="/admin/borrowers" element={<AdminOnly><BorrowersPage /></AdminOnly>} />
            <Route path="/admin/borrowers/:id" element={<AdminOnly><BorrowerPage /></AdminOnly>} />
            <Route path="/admin/shelf" element={<AdminOnly><ShelfImportPage /></AdminOnly>} />
            <Route path="/admin/export" element={<AdminOnly><ExportPage /></AdminOnly>} />
            <Route path="*" element={<div className="empty">העמוד לא נמצא. <a href="/">חזרה לקטלוג</a></div>} />
          </Routes>
          </ErrorBoundary>
        </Layout>
      </ToastProvider>
    </AuthProvider>
  );
}
