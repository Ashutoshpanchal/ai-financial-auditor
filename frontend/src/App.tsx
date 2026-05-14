import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import AuditReport from "./pages/AuditReport";
import Admin from "./pages/Admin";
import Categories from "./pages/Categories";
import WidgetStudio from "./pages/WidgetStudio";
import WidgetStudioEditor from "./pages/WidgetStudioEditor";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/audit/:id" element={<AuditReport />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/widget-studio" element={<WidgetStudio />} />
            <Route path="/widget-studio/:widgetId" element={<WidgetStudioEditor />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
