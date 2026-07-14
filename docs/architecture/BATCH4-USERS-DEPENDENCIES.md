# BATCH 4 — Users & Permissions Dependencies

Prepared after Batch 3 CRM extraction (CustomersPage owns CRM UI data).

## Current Users panel home

Still inlined in `src/App.tsx` (`activeTab === 'users'`, ~lines 3443–3708).

## Dependencies on App state

| Dependency | Usage in Users UI | How satisfied after Batch 3 |
|------------|-------------------|-----------------------------|
| `managedUsers` / `setManagedUsers` | User list, create/edit, status toggle | Still App (loaded via secondary bootstrap on users role) |
| `currentUser` | Role gates (owner vs company) | Still App auth |
| `customers` | Permission assignment checklist | App still loads via `loadCrmModule` when CRM opens / `onCustomersChanged`; Users may see empty if CRM never opened |
| `properties` | Permission assignment checklist | App `loadPropertiesModule` when properties/projects open |
| `selectedPermissionMemberId` | Member picker | App local state |
| `newUserForm` / `editingUser` / `editUserForm` | Create/edit modals | App local state |
| Handlers `handleCreateUser`, `openEditUserModal`, `handleToggleUserStatus`, `handleBulkMemberAssignment`, `handleToggleMemberAssignment`, `handleSelectAllMemberPermissions` | Mutations | Still App → `createUser` / `updateUser` / `bulkMemberPermissions` |
| `canManageCmsUsers` / `canEditTargetUser` / `canToggleUserStatus` | Permission helpers | App |

## Required for Batch 4 extraction

1. Move Users page to `src/features/users/` (or `features/admin-users/`).
2. Users page should **own**:
   - `getUsers` / create / update / status
   - permission assignment UI
3. Stop depending on App CRM arrays by either:
   - **A)** UsersPage fetches `listCustomers({ page:1, limit:100 })` + `listProperties({ page:1, limit:100 })` (or dedicated assignment catalogs), **or**
   - **B)** Shared `useAssignableResources()` hook used by Users only
4. Do **not** require opening CRM first for assignment lists.
5. Keep role rules identical (owner vs company admin creating members).
6. Edit-user modal currently in App — move with Users feature.
7. After move, App may drop `customers` preload for Users; CRM remains independent via `CustomersPage`.

## Out of scope reminders

- Do not change API contracts for member permissions.
- Do not pull official Listings admin into Users.
- Properties assignment stays resource-id based as today.
