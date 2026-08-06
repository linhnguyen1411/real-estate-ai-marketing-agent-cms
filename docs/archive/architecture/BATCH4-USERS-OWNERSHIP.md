# BATCH 4 — Users ownership contract

## Goal

Users & Permissions must not receive full `customers` / `properties` arrays from App.

## Required global inputs (from App / auth)

| Input | Why |
|-------|-----|
| `currentUser` (AuthUser) | Role gates (owner vs company), company_id defaults |
| `onNotify` | Toast shell |
| `onCurrentUserUpdated?` | When editing self via Users edit modal |

## Owned by UsersPage

| Concern | Source |
|---------|--------|
| User list | `getUsers()` on mount |
| Create / update / status | `createUser` / `updateUser` |
| Edit modal | Local `editingUser` / `editUserForm` |
| Selected member for assignment | Local `selectedPermissionMemberId` |
| Assignment catalog customers | `listCustomers({ page:1, limit:100, sort:'created_at_desc' })` |
| Assignment catalog properties | `listProperties({ page:1, limit:100, sort:'created_at_desc' })` |
| Toggle / bulk / select-all assignment | `updateCustomer` / `updateProperty` / `bulkMemberPermissions` |

## Must not

- Wait for CRM or Properties tab to preload App state
- Accept `customers` / `properties` props from App
- Put selected user / edit modal back in App

## App after extract

- Drop Users JSX + edit-user modal
- Drop user form / permission selection state
- Drop assignment handlers
- May keep a thin `managedUsers` map only for property creator labels until Properties feature owns it (optional load with properties module)

## Behavior parity

- Company admin still only creates members scoped to company
- Owner still manages roles / agent tier
- Select-all still bulk-assigns properties + customers
