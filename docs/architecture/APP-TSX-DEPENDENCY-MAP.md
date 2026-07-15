# APP.TSX DEPENDENCY MAP

Source: `src/App.tsx` @ `2981803` (~5136–5463 LOC depending on measure).

## Metrics

| Metric | Count |
|--------|------:|
| useState | ~55 |
| useEffect | 10 |
| useMemo | 5 |
| React.lazy | 8 |
| activeTab IDs | ~33 |

## Section table

| Section | Line range (approx) | State | Handlers / API | Target module |
|---------|--------------------:|-------|----------------|---------------|
| Preamble / constants / lazy | 1–260 | — | path maps | `app/navigation`, `app/lazyAdminPanels` |
| Nav shell state | 263–279 | activeTab, menus | URL sync | `app/navigation` |
| Auth | 280–284, 409–437, 701–736, 1738–1802 | currentUser, login* | login/logout/me | `features/auth` |
| Entity stores | 287–301 | customers…guests | loaders | per-feature hooks |
| Loading / toast | 303–317, 1807–1820 | toast, loading | showToast | `app/layouts/Toast` |
| Dashboard + nav counts | 364–393, 472–652, 2198–2579 | dashboardData, navigationCounts | getBootstrapData, getNavigationCounts | `features/dashboard` |
| Module loader | 546–668 | loadedModulesRef | listCustomers/Properties… | `features/admin-shell` |
| CRM handlers + UI | 748–784, 2584–2706 | customers | createCustomer… | `features/crm` |
| Properties | 1026–1337, 2748–2906 | properties, forms | CRUD | `features/properties` |
| Users | 786–1024, 3956–4220 | managedUsers | createUser… | `features/users` |
| Inbox / chatbot / website-chat / history | 1221–1505, 3268–3882 | inbox, chat* | send* | `features/inbox`, `chatbot`, `website-chat` |
| Automations | 1340–1362, 3887–3951 | automations | toggle | `features/automations` |
| Settings | 1536–1619, 4329–4665 | settings | saveSettings, telegram/test | `features/settings` |
| Header | 1822–1892 | user, settings | refresh, logout | `app/layouts/AdminHeader` |
| Sidebar | 1904–2114 | nav + badges | setActiveTab | `app/layouts/AdminSidebar` |
| Lazy panels | 2708–2743, 3251–3263 | — | InvestorLeads, SEO… | keep lazy; move under features |
| Modals | 4680–5459 | forms | save handlers | feature modals |
| Agent branch | 2119–2122 | — | AgentPlatformPage | `features/agent` |

## Performance contracts to preserve

- F5 bootstrap = dashboard + navigation-counts + settings only.
- `loadModuleForTab` on menu open.
- Lazy panels list unchanged.
- localStorage `real_estate_ai_active_tab`.
- Navigation count badges (not list lengths).
