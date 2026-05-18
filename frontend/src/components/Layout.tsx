import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ThemeToggle } from "./common/ThemeToggle";
import { useAuth } from "../hooks/useAuth";

function NavItem({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-gray-100 text-gray-900 font-semibold dark:bg-gray-800 dark:text-white"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 dark:bg-gray-900 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <span className="text-lg font-bold text-gray-900 tracking-tight dark:text-white">
              FinanceAI
            </span>
            <div className="hidden sm:flex items-center gap-1">
              <NavItem to="/dashboard">Dashboard</NavItem>
              <NavItem to="/upload">Upload</NavItem>
              <NavItem to="/categories">Categories</NavItem>
              <NavItem to="/insights">Insights</NavItem>
              <NavItem to="/widget-studio" end>
                Widget Studio
              </NavItem>
              {isAdmin && <NavItem to="/admin">Admin</NavItem>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user?.picture && (
              <img src={user.picture} alt={user.name ?? ""} className="w-8 h-8 rounded-full" />
            )}
            <span className="text-sm text-gray-600 hidden sm:block dark:text-gray-300">
              {user?.name}
            </span>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
