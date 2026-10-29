"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Save, X, ShieldAlert } from "lucide-react";
import Loading, { Spinner } from "@/components/ui/Loading";
import { toast } from "@/lib/toast";
import { CreateUserModal } from "@/components/users/CreateUserModal";
import { Select } from "@/components/ui/Select";

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  insurance_access: string[];
  is_active?: boolean;
};

export default function UsersClient() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create new user form state
  const [showCreate, setShowCreate] = useState(false);

  // Edit state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState("");
  const [editingInsuranceAccess, setEditingInsuranceAccess] = useState<
    string[]
  >(["personal", "commercial"]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/superadmin/users");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setUsers(j.users || []);
    } catch (err: any) {
      setError(err.message);
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentIsActive?: boolean) => {
    const isCurrentlyActive = currentIsActive !== false;
    const actionName = isCurrentlyActive ? "deactivate" : "reactivate";

    if (
      !confirm(
        `Are you sure you want to ${actionName} this user? ${
          isCurrentlyActive
            ? "The user will lose access, but historical lead assignments and audit logs will remain intact."
            : "The user will regain access to their account."
        }`
      )
    )
      return;

    try {
      setError(null);
      let res;
      if (isCurrentlyActive) {
        res = await fetch(`/api/superadmin/users?id=${id}`, {
          method: "DELETE",
        });
      } else {
        res = await fetch("/api/superadmin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, is_active: true }),
        });
      }
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast(`User ${isCurrentlyActive ? "deactivated" : "reactivated"} successfully!`, "success");
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
      toast(err.message, "error");
    }
  };

  const handleUpdateRole = async (id: string, currentRole: string) => {
    // Protection to prevent accidentally removing own or another user's superadmin role
    if (editingRole === "csr" && currentRole === "superadmin") {
      if (
        !confirm(
          "Warning: You are demoting a Super Admin. Are you sure you want to proceed?",
        )
      ) {
        return;
      }
    }

    if (editingRole === "csr" && editingInsuranceAccess.length === 0) {
      toast(
        "Please select at least one insurance access option (Personal or Commercial).",
        "error",
      );
      return;
    }

    try {
      setError(null);
      const res = await fetch("/api/superadmin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          role: editingRole,
          insurance_access:
            editingRole === "csr" ? editingInsuranceAccess : undefined,
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);

      setEditingUserId(null);
      toast("Role updated successfully!", "success");
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
      toast(err.message, "error");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end w-full">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-bold shadow-sm text-sm border
                        ${showCreate ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-600" : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"}`}
        >
          {showCreate ? <X size={18} /> : <Plus size={18} />}
          {showCreate ? "Cancel" : "Create New User"}
        </button>
      </div>

      <CreateUserModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          fetchUsers();
        }}
      />

      <div className="bg-white sm:rounded-2xl shadow-sm sm:border border-gray-200 overflow-hidden -mx-3 sm:mx-0">
        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading ? (
            <div className="p-6 flex justify-center">
              <Loading message="Synchronizing users..." />
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm font-bold">
              No users found in the system.
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="p-4 space-y-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm ring-2 ring-indigo-50/50 flex-shrink-0">
                      {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <div className="text-gray-800 font-bold text-sm leading-tight">
                        {user.full_name || "No Name"}
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5 break-all">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">
                      Role:
                    </span>
                    {editingUserId === user.id ? (
                      <div className="w-full space-y-2">
                        <Select
                          value={editingRole}
                          onChange={(e) => setEditingRole(e.target.value)}
                          className="border-2 border-indigo-400 focus:ring-indigo-500/20"
                        >
                          <option value="csr">CSR</option>
                          <option value="admin">Admin</option>
                          <option value="accounting">Accounting</option>
                          <option value="superadmin">Super Admin</option>
                        </Select>
                        {editingRole === "csr" && (
                          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 p-2 rounded-lg mt-1">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingInsuranceAccess.includes(
                                  "personal",
                                )}
                                onChange={(e) =>
                                  setEditingInsuranceAccess(
                                    e.target.checked
                                      ? [...editingInsuranceAccess, "personal"]
                                      : editingInsuranceAccess.filter(
                                          (a) => a !== "personal",
                                        ),
                                  )
                                }
                                className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300"
                              />
                              Personal
                            </label>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingInsuranceAccess.includes(
                                  "commercial",
                                )}
                                onChange={(e) =>
                                  setEditingInsuranceAccess(
                                    e.target.checked
                                      ? [
                                          ...editingInsuranceAccess,
                                          "commercial",
                                        ]
                                      : editingInsuranceAccess.filter(
                                          (a) => a !== "commercial",
                                        ),
                                  )
                                }
                                className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300"
                              />
                              Commercial
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border
                                                    ${
                                                      user.role === "superadmin"
                                                        ? "bg-purple-50 text-purple-700 border-purple-100"
                                                        : user.role === "admin"
                                                          ? "bg-blue-50 text-blue-700 border-blue-100"
                                                          : user.role ===
                                                              "accounting"
                                                            ? "bg-amber-50 text-amber-700 border-amber-100"
                                                            : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                    }`}
                          >
                            {user.role}
                          </span>
                          {user.role === "superadmin" && (
                            <ShieldAlert
                              size={14}
                              className="text-purple-600 flex-shrink-0"
                            />
                          )}
                        </div>
                        {user.role === "csr" && user.insurance_access && (
                          <div className="flex gap-1 flex-wrap">
                            {user.insurance_access.includes("personal") && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[9px] font-bold uppercase">
                                Personal
                              </span>
                            )}
                            {user.insurance_access.includes("commercial") && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold uppercase">
                                Commercial
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end items-center gap-2 pt-1">
                    {editingUserId === user.id ? (
                      <div className="flex justify-end gap-2 w-full">
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="px-3 py-1.5 flex-1 justify-center text-xs text-white bg-rose-600 hover:bg-rose-700 border border-rose-600 rounded-lg transition font-medium flex items-center gap-1 shadow-sm"
                        >
                          <X size={14} /> Cancel
                        </button>
                        <button
                          onClick={() => handleUpdateRole(user.id, user.role)}
                          className="px-3 py-1.5 flex-1 justify-center text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition font-medium flex items-center gap-1 shadow-sm"
                        >
                          <Save size={16} /> Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1.5 w-full">
                        <button
                          onClick={() => {
                            setEditingUserId(user.id);
                            setEditingRole(user.role);
                            setEditingInsuranceAccess(
                              user.insurance_access || [
                                "personal",
                                "commercial",
                              ],
                            );
                          }}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-100"
                          title="Edit Access Role"
                        >
                          <Edit2 size={15} /> Edit Role
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.is_active)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1 border ${
                            user.is_active !== false
                              ? "text-rose-600 bg-rose-50 hover:bg-rose-100 border-rose-100"
                              : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-100"
                          }`}
                          title={user.is_active !== false ? "Deactivate User" : "Reactivate User"}
                        >
                          {user.is_active !== false ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white uppercase text-xs tracking-wider">
                <th className="p-4 font-bold text-white text-[10px] uppercase tracking-wider">
                  Name
                </th>
                <th className="p-4 font-bold text-white text-[10px] uppercase tracking-wider">
                  Email
                </th>
                <th className="p-4 font-bold text-white text-[10px] uppercase tracking-wider">
                  Role
                </th>
                <th className="p-4 font-bold text-white text-[10px] uppercase tracking-wider">
                  Status
                </th>
                <th className="p-4 font-bold text-white text-[10px] uppercase tracking-wider">
                  Created At
                </th>
                <th className="p-4 font-bold text-white text-[10px] uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <Loading message="Synchronizing users..." />
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="p-4 text-gray-800 font-bold text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs ring-2 ring-indigo-50/50">
                          {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        {user.full_name || "No Name"}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600 text-xs font-medium">
                      {user.email}
                    </td>
                    <td className="p-4">
                      {editingUserId === user.id ? (
                        <div className="space-y-2">
                          <Select
                            value={editingRole}
                            onChange={(e) => setEditingRole(e.target.value)}
                            className="border-2 border-indigo-400 focus:ring-indigo-500/20"
                          >
                            <option value="csr">CSR</option>
                            <option value="admin">Admin</option>
                            <option value="accounting">Accounting</option>
                            <option value="superadmin">Super Admin</option>
                          </Select>
                          {editingRole === "csr" && (
                            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 p-2 rounded-lg max-w-[180px]">
                              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editingInsuranceAccess.includes(
                                    "personal",
                                  )}
                                  onChange={(e) =>
                                    setEditingInsuranceAccess(
                                      e.target.checked
                                        ? [
                                            ...editingInsuranceAccess,
                                            "personal",
                                          ]
                                        : editingInsuranceAccess.filter(
                                            (a) => a !== "personal",
                                          ),
                                    )
                                  }
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300"
                                />
                                Personal
                              </label>
                              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editingInsuranceAccess.includes(
                                    "commercial",
                                  )}
                                  onChange={(e) =>
                                    setEditingInsuranceAccess(
                                      e.target.checked
                                        ? [
                                            ...editingInsuranceAccess,
                                            "commercial",
                                          ]
                                        : editingInsuranceAccess.filter(
                                            (a) => a !== "commercial",
                                          ),
                                    )
                                  }
                                  className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300"
                                />
                                Commercial
                              </label>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border
                                                        ${
                                                          user.role ===
                                                          "superadmin"
                                                            ? "bg-purple-50 text-purple-700 border-purple-100"
                                                            : user.role ===
                                                                "admin"
                                                              ? "bg-blue-50 text-blue-700 border-blue-100"
                                                              : user.role ===
                                                                  "accounting"
                                                                ? "bg-amber-50 text-amber-700 border-amber-100"
                                                                : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                        }`}
                            >
                              {user.role}
                            </span>
                            {user.role === "superadmin" && (
                              <ShieldAlert
                                size={14}
                                className="text-purple-600 flex-shrink-0"
                              />
                            )}
                          </div>
                          {user.role === "csr" && user.insurance_access && (
                            <div className="flex gap-1 flex-wrap">
                              {user.insurance_access.includes("personal") && (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[9px] font-bold uppercase">
                                  Personal
                                </span>
                              )}
                              {user.insurance_access.includes("commercial") && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold uppercase">
                                  Commercial
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        user.is_active !== false 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {user.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400 text-[10px] font-mono">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        {editingUserId === user.id ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="px-3 py-1.5 text-xs text-white bg-rose-600 hover:bg-rose-700 border border-rose-600 rounded-lg transition font-medium flex items-center gap-1 shadow-sm"
                            >
                              <X size={14} /> Cancel
                            </button>
                            <button
                              onClick={() =>
                                handleUpdateRole(user.id, user.role)
                              }
                              className="px-3 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition font-medium flex items-center gap-1 shadow-sm"
                            >
                              <Save size={16} /> Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingUserId(user.id);
                                setEditingRole(user.role);
                                setEditingInsuranceAccess(
                                  user.insurance_access || [
                                    "personal",
                                    "commercial",
                                  ],
                                );
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-100"
                              title="Edit Role"
                            >
                              <Edit2 size={15} /> Edit Role
                            </button>
                            <button
                              onClick={() => handleToggleStatus(user.id, user.is_active)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1 border ${
                                user.is_active !== false
                                  ? "text-rose-600 bg-rose-50 hover:bg-rose-100 border-rose-100"
                                  : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-100"
                              }`}
                              title={user.is_active !== false ? "Deactivate User" : "Reactivate User"}
                            >
                              {user.is_active !== false ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-gray-400 text-sm font-bold"
                  >
                    No users found in the system.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
