# BATCH 5 — Properties ownership map

| Item | Current owner | Used by | Correct owner | Global? | Action |
|------|---------------|---------|---------------|---------|--------|
| `properties[]` | App | properties tab, projects, AI hub | PropertiesPage / feature fetch | no | move |
| `propertyFilters` | App | properties tab + loadModule | PropertiesPage | no | move |
| `propertiesPage/Total` | App | pagination | PropertiesPage | no | move |
| `showAddPropertyModal` / `editingProperty` / form | App | modal | PropertyFormModal | no | move |
| `propertyGalleryIndex` | App | directory | PropertiesPage / directory | no | move |
| `selectedPropertyForAI` / `aiGeneratingTone` | App | AI content tab | AiContentPage | no | move with AI tab or self-fetch |
| `loadPropertiesModule` | App | tab load / search | PropertiesPage | no | move |
| Handlers: save/upload/sold/featured/soft-delete/restore | App | directory + modal | usePropertyMutations | no | move |
| `AdminPropertyDirectory` props dump | App | properties tab | PropertiesPage wires directory | no | rewire |
| `AdminProjectsPanel.properties` | App | projects tab | panel self-fetch `listProperties` | no | decouple |
| Public `ListingsPage` | main/public routes | public SEO | public feature (debt) | n/a | defer split OR light extract |
| Matching / Users assignment catalogs | already feature-owned | Users/Matching | options hook / existing list limit | no | keep; optional `usePropertyOptions` later |

## Target module

`src/features/properties/pages/PropertiesPage.tsx` owns list/filters/pagination/modal/mutations.  
`PropertyFormModal.tsx` owns create/edit form UI.  
Reuse `AdminPropertyDirectory` as presentational component (import from components/admin or relocate later).
