import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: "super_admin" | "admin" | "user";
  created_at: string;
}

type UserRole = AdminUser["role"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<UserRole, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  user: "bg-gray-100 text-gray-600",
};

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[role]}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const letters = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
      {letters || "?"}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChangeRoleModal({
  target,
  onClose,
  onSave,
  loading,
}: {
  target: AdminUser;
  onClose: () => void;
  onSave: (userId: string, role: UserRole) => void;
  loading: boolean;
}) {
  const [role, setRole] = useState<UserRole>(target.role);

  return (
    <Modal title={`Change role — ${target.name}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">{target.email}</p>
      <label className="block text-sm font-medium text-gray-700 mb-1">New role</label>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as UserRole)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-4 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
        <option value="super_admin">Super Admin</option>
      </select>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button
          onClick={() => onSave(target.id, role)}
          disabled={loading || role === target.role}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({
  target,
  onClose,
  onSave,
  loading,
}: {
  target: AdminUser;
  onClose: () => void;
  onSave: (userId: string, password: string) => void;
  loading: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <Modal title={`Set password — ${target.name}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">{target.email}</p>
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              mismatch
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
          />
          {mismatch && <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button
          onClick={() => onSave(target.id, password)}
          disabled={loading || !password || mismatch}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Set password"}
        </button>
      </div>
    </Modal>
  );
}

function CreateUserModal({
  onClose,
  onSave,
  loading,
}: {
  onClose: () => void;
  onSave: (data: { name: string; email: string; role: UserRole; password: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = name.trim() && email.trim() && password && !mismatch;

  return (
    <Modal title="Add new user" onClose={onClose}>
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Initial password"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
              mismatch
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
          />
          {mismatch && <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button
          onClick={() => onSave({ name, email, role, password })}
          disabled={loading || !valid}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create user"}
        </button>
      </div>
    </Modal>
  );
}

function DeleteConfirmModal({
  target,
  onClose,
  onConfirm,
  loading,
}: {
  target: AdminUser;
  onClose: () => void;
  onConfirm: (userId: string) => void;
  loading: boolean;
}) {
  return (
    <Modal title="Delete user" onClose={onClose}>
      <p className="text-sm text-gray-600 mb-1">
        Are you sure you want to delete <span className="font-semibold text-gray-900">{target.name}</span>?
      </p>
      <p className="text-sm text-gray-500 mb-6">{target.email} — this action cannot be undone.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button
          onClick={() => onConfirm(target.id)}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "super_admin";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [roleModal, setRoleModal] = useState<AdminUser | null>(null);
  const [pwModal, setPwModal] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setPageLoading(true);
    setPageError("");
    try {
      const res = await api.get<AdminUser[]>("/admin/users");
      setUsers(res.data);
    } catch {
      setPageError("Failed to load users. Make sure you have admin access.");
    } finally {
      setPageLoading(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setActionError("");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleCreateUser = async (data: { name: string; email: string; role: UserRole; password: string }) => {
    setActionLoading(true);
    try {
      const res = await api.post<AdminUser>("/admin/users", data);
      setUsers((prev) => [res.data, ...prev]);
      showSuccess(`User ${data.email} created successfully.`);
      setCreateModal(false);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setActionError(detail ?? "Failed to create user.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setActionLoading(true);
    try {
      const res = await api.patch<AdminUser>(`/admin/users/${userId}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? res.data : u)));
      showSuccess("Role updated successfully.");
      setRoleModal(null);
    } catch {
      setActionError("Failed to update role.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePasswordChange = async (userId: string, password: string) => {
    setActionLoading(true);
    try {
      await api.patch(`/admin/users/${userId}/password`, { password });
      showSuccess("Password set successfully.");
      setPwModal(null);
    } catch {
      setActionError("Failed to set password.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setActionLoading(true);
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showSuccess("User deleted.");
      setDeleteTarget(null);
    } catch {
      setActionError("Failed to delete user.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              {users.length > 0 ? `${users.length} registered user${users.length !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => { setActionError(""); setCreateModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Add User
            </button>
          )}
        </div>

        {/* Flash messages */}
        {successMsg && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {successMsg}
          </div>
        )}
        {actionError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {pageLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading users…</div>
          ) : pageError ? (
            <div className="flex items-center justify-center py-16 text-red-500 text-sm">{pageError}</div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Joined</th>
                    {isSuperAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.picture ? (
                            <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                          ) : (
                            <Initials name={u.name} />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{u.name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                        {formatDate(u.created_at)}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setActionError(""); setRoleModal(u); }}
                              disabled={u.id === currentUser?.id}
                              title={u.id === currentUser?.id ? "Cannot change your own role" : "Change role"}
                              className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Role
                            </button>
                            <button
                              onClick={() => { setActionError(""); setPwModal(u); }}
                              className="px-2.5 py-1 text-xs font-medium text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              Password
                            </button>
                            <button
                              onClick={() => { setActionError(""); setDeleteTarget(u); }}
                              disabled={u.id === currentUser?.id}
                              title={u.id === currentUser?.id ? "Cannot delete your own account" : "Delete user"}
                              className="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {createModal && (
        <CreateUserModal
          onClose={() => setCreateModal(false)}
          onSave={handleCreateUser}
          loading={actionLoading}
        />
      )}
      {roleModal && (
        <ChangeRoleModal
          target={roleModal}
          onClose={() => setRoleModal(null)}
          onSave={handleRoleChange}
          loading={actionLoading}
        />
      )}
      {pwModal && (
        <ChangePasswordModal
          target={pwModal}
          onClose={() => setPwModal(null)}
          onSave={handlePasswordChange}
          loading={actionLoading}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={actionLoading}
        />
      )}
    </>
  );
}
