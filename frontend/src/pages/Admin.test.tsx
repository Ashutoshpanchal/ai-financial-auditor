/**
 * Tests for frontend/src/pages/Admin.tsx
 *
 * Covers:
 *  - Initial data loading (GET /admin/users)
 *  - User table rendering (name, email, role badge, join date)
 *  - "Add User" button visible to super_admin only
 *  - Role/Password/Delete action buttons visible to super_admin only
 *  - Role and Delete buttons disabled for the current user's own row
 *  - ChangeRoleModal: opens, shows target user, calls PATCH /admin/users/:id/role
 *  - ChangePasswordModal: opens, password mismatch validation
 *  - DeleteConfirmModal: opens, calls DELETE /admin/users/:id
 *  - CreateUserModal: opens, form validation, calls POST /admin/users
 *  - Error and success flash messages
 *  - No Navbar rendered (it was removed in this commit — Layout provides it)
 *
 * Mocking strategy:
 *  - api module    : vi.mock() with per-test overrides
 *  - useAuth hook  : vi.mock() so we can control the current user role
 *  - react-router-dom : NOT needed (Admin.tsx no longer uses Link/NavLink)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import Admin from "./Admin";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CURRENT_SUPER_ADMIN = {
  id: "current-user",
  email: "admin@example.com",
  name: "Admin User",
  role: "super_admin" as const,
};

const CURRENT_REGULAR_ADMIN = {
  id: "current-user",
  email: "admin@example.com",
  name: "Admin User",
  role: "admin" as const,
};

const USERS = [
  {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice Smith",
    role: "user" as const,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "user-2",
    email: "bob@example.com",
    name: "Bob Jones",
    role: "admin" as const,
    created_at: "2024-02-01T00:00:00Z",
  },
  {
    id: "current-user",
    email: "admin@example.com",
    name: "Admin User",
    role: "super_admin" as const,
    created_at: "2023-12-01T00:00:00Z",
  },
];

/**
 * Set up the useAuth mock.
 */
function mockAuth(
  userOverride: typeof CURRENT_SUPER_ADMIN | typeof CURRENT_REGULAR_ADMIN = CURRENT_SUPER_ADMIN
) {
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: userOverride,
    loading: false,
    logout: vi.fn(),
  });
}

/**
 * Set up the api.get mock to return the users list.
 */
function mockGetUsers(users = USERS) {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: users });
}

function renderAdmin() {
  return render(<Admin />);
}

// ── Tests: Page heading ────────────────────────────────────────────────────────

describe("Admin — page heading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockGetUsers();
  });

  it("renders the User Management heading", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("User Management")).toBeInTheDocument();
    });
  });

  it("calls GET /admin/users on mount", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/admin/users");
    });
  });

  it("shows user count in the subtitle", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("3 registered users")).toBeInTheDocument();
    });
  });
});

// ── Tests: User table ─────────────────────────────────────────────────────────

describe("Admin — user table rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockGetUsers();
  });

  it("renders each user's name", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  it("renders each user's email", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });
  });

  it("renders User role badge for a regular user", async () => {
    renderAdmin();
    await waitFor(() => {
      // "User" appears both as a column header and as a role badge —
      // confirm at least one instance is a role badge (span with rounded-full class)
      const userBadges = screen
        .getAllByText("User")
        .filter((el) => el.tagName === "SPAN" && el.className.includes("rounded-full"));
      expect(userBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders Admin role badge for an admin user", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });
  });

  it("renders Super Admin role badge for a super_admin", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("Super Admin")).toBeInTheDocument();
    });
  });

  it("renders table column headers", async () => {
    renderAdmin();
    await waitFor(() => {
      // "User", "Role", "Joined" all appear in <th> elements.
      // "User" also appears as a role badge; "Role" also appears as an action button.
      // Query <th> elements directly to avoid ambiguity.
      const headers = Array.from(document.querySelectorAll("th")).map(
        (th) => th.textContent?.trim()
      );
      expect(headers).toContain("User");
      expect(headers).toContain("Role");
      expect(headers).toContain("Joined");
    });
  });

  it("shows empty-state message when no users are returned", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("No users found.")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    // Never resolves — stays in loading state
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );
    renderAdmin();
    expect(screen.getByText("Loading users…")).toBeInTheDocument();
  });
});

// ── Tests: super_admin visibility ─────────────────────────────────────────────

describe("Admin — super_admin-only controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("shows Add User button for super_admin", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add User/i })).toBeInTheDocument();
    });
  });

  it("shows Role action buttons in table rows for super_admin", async () => {
    renderAdmin();
    await waitFor(() => {
      const roleButtons = screen.getAllByRole("button", { name: /^Role$/i });
      expect(roleButtons.length).toBeGreaterThan(0);
    });
  });

  it("shows Password action buttons in table rows for super_admin", async () => {
    renderAdmin();
    await waitFor(() => {
      const pwButtons = screen.getAllByRole("button", { name: /^Password$/i });
      expect(pwButtons.length).toBeGreaterThan(0);
    });
  });

  it("shows Delete action buttons in table rows for super_admin", async () => {
    renderAdmin();
    await waitFor(() => {
      const delButtons = screen.getAllByRole("button", { name: /^Delete$/i });
      expect(delButtons.length).toBeGreaterThan(0);
    });
  });
});

describe("Admin — non-super_admin visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_REGULAR_ADMIN);
    mockGetUsers();
  });

  it("does NOT show Add User button for a regular admin", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Add User/i })).toBeNull();
    });
  });

  it("does NOT show Role/Password/Delete buttons for a regular admin", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Role$/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Password$/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Delete$/i })).toBeNull();
    });
  });
});

// ── Tests: Own-row buttons disabled ───────────────────────────────────────────

describe("Admin — own-row action buttons disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("disables the Role button for the current user's own row", async () => {
    renderAdmin();
    await waitFor(() => {
      const roleButtons = screen.getAllByRole("button", { name: /^Role$/i });
      // The last button corresponds to "Admin User" (current user)
      const ownRoleButton = roleButtons[roleButtons.length - 1];
      expect(ownRoleButton).toBeDisabled();
    });
  });

  it("disables the Delete button for the current user's own row", async () => {
    renderAdmin();
    await waitFor(() => {
      const deleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
      const ownDeleteButton = deleteButtons[deleteButtons.length - 1];
      expect(ownDeleteButton).toBeDisabled();
    });
  });
});

// ── Tests: ChangeRoleModal ─────────────────────────────────────────────────────

describe("Admin — ChangeRoleModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("opens ChangeRoleModal when Role button is clicked", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Role$/i }).length).toBeGreaterThan(0);
    });

    // Click Role for the first user (Alice Smith)
    const roleButtons = screen.getAllByRole("button", { name: /^Role$/i });
    fireEvent.click(roleButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Change role — Alice Smith/i)).toBeInTheDocument();
    });
  });

  it("calls PATCH /admin/users/:id/role when Save is clicked", async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...USERS[0], role: "admin" },
    });

    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Role$/i }).length).toBeGreaterThan(0);
    });

    const roleButtons = screen.getAllByRole("button", { name: /^Role$/i });
    fireEvent.click(roleButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Change role — Alice Smith/i)).toBeInTheDocument();
    });

    // Change the select to "admin"
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "admin" } });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/admin/users/user-1/role",
        { role: "admin" }
      );
    });
  });

  it("closes the modal when Cancel is clicked", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Role$/i }).length).toBeGreaterThan(0);
    });

    const roleButtons = screen.getAllByRole("button", { name: /^Role$/i });
    fireEvent.click(roleButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Change role — Alice Smith/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Change role — Alice Smith/i)).toBeNull();
    });
  });
});

// ── Tests: ChangePasswordModal ────────────────────────────────────────────────

describe("Admin — ChangePasswordModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("opens ChangePasswordModal when Password button is clicked", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Password$/i }).length).toBeGreaterThan(0);
    });

    const pwButtons = screen.getAllByRole("button", { name: /^Password$/i });
    fireEvent.click(pwButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Set password — Alice Smith/i)).toBeInTheDocument();
    });
  });

  it("shows mismatch error when confirm password does not match", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Password$/i }).length).toBeGreaterThan(0);
    });

    const pwButtons = screen.getAllByRole("button", { name: /^Password$/i });
    fireEvent.click(pwButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Set password — Alice Smith/i)).toBeInTheDocument();
    });

    const [newPwInput, confirmInput] = screen.getAllByPlaceholderText(
      /password/i
    );
    fireEvent.change(newPwInput, { target: { value: "secret123" } });
    fireEvent.change(confirmInput, { target: { value: "different" } });

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("calls PATCH /admin/users/:id/password when passwords match and Set password is clicked", async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({});

    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Password$/i }).length).toBeGreaterThan(0);
    });

    const pwButtons = screen.getAllByRole("button", { name: /^Password$/i });
    fireEvent.click(pwButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Set password — Alice Smith/i)).toBeInTheDocument();
    });

    const [newPwInput, confirmInput] = screen.getAllByPlaceholderText(
      /password/i
    );
    fireEvent.change(newPwInput, { target: { value: "secret123" } });
    fireEvent.change(confirmInput, { target: { value: "secret123" } });

    fireEvent.click(screen.getByRole("button", { name: /Set password/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/admin/users/user-1/password",
        { password: "secret123" }
      );
    });
  });
});

// ── Tests: DeleteConfirmModal ──────────────────────────────────────────────────

describe("Admin — DeleteConfirmModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("opens DeleteConfirmModal when Delete button is clicked", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Delete$/i }).length).toBeGreaterThan(0);
    });

    const deleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete user")).toBeInTheDocument();
    });
  });

  it("calls DELETE /admin/users/:id when deletion is confirmed", async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Delete$/i }).length).toBeGreaterThan(0);
    });

    // Click first row's Delete to open the modal
    const deleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete user")).toBeInTheDocument();
    });

    // The modal renders its own "Delete" button — after the modal opens there are
    // additional Delete buttons. Find the one inside the modal (it is the last one).
    const allDeleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
    const modalDeleteButton = allDeleteButtons[allDeleteButtons.length - 1];
    fireEvent.click(modalDeleteButton);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/admin/users/user-1");
    });
  });

  it("removes the deleted user from the list on success", async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete user")).toBeInTheDocument();
    });

    // Confirm via the modal's Delete button (last in DOM after modal mounts)
    const allDeleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
    fireEvent.click(allDeleteButtons[allDeleteButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText("Alice Smith")).toBeNull();
    });
  });
});

// ── Tests: CreateUserModal ────────────────────────────────────────────────────

describe("Admin — CreateUserModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("opens CreateUserModal when Add User is clicked", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add User/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText("Add new user")).toBeInTheDocument();
    });
  });

  it("Create user button is disabled while form is empty", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add User/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText("Add new user")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Create user/i })
    ).toBeDisabled();
  });

  it("calls POST /admin/users with correct payload when form is submitted", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: "new-user",
        name: "New Person",
        email: "new@example.com",
        role: "user",
        created_at: "2024-05-01T00:00:00Z",
      },
    });

    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add User/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText("Add new user")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Jane Smith"), {
      target: { value: "New Person" },
    });
    fireEvent.change(screen.getByPlaceholderText("jane@example.com"), {
      target: { value: "new@example.com" },
    });
    const [pwInput, confirmInput] = screen.getAllByPlaceholderText(/password/i);
    fireEvent.change(pwInput, { target: { value: "pass1234" } });
    fireEvent.change(confirmInput, { target: { value: "pass1234" } });

    fireEvent.click(screen.getByRole("button", { name: /Create user/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/admin/users", {
        name: "New Person",
        email: "new@example.com",
        role: "user",
        password: "pass1234",
      });
    });
  });
});

// ── Tests: Flash messages ─────────────────────────────────────────────────────

describe("Admin — flash messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("shows success message after role change", async () => {
    (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...USERS[0], role: "admin" },
    });

    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Role$/i }).length).toBeGreaterThan(0);
    });

    const roleButtons = screen.getAllByRole("button", { name: /^Role$/i });
    fireEvent.click(roleButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Change role — Alice Smith/i)).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(screen.getByText("Role updated successfully.")).toBeInTheDocument();
    });
  });

  it("shows error banner when API call fails", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Forbidden")
    );

    renderAdmin();
    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to load users. Make sure you have admin access."
        )
      ).toBeInTheDocument();
    });
  });
});

// ── Tests: No Navbar ──────────────────────────────────────────────────────────

describe("Admin — no duplicate Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(CURRENT_SUPER_ADMIN);
    mockGetUsers();
  });

  it("does NOT render a nav element inside Admin (Navbar moved to Layout)", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("User Management")).toBeInTheDocument();
    });
    expect(document.querySelector("nav")).toBeNull();
  });

  it("does NOT render the FinanceAI brand inside the Admin component", async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText("User Management")).toBeInTheDocument();
    });
    expect(screen.queryByText("FinanceAI")).toBeNull();
  });
});
