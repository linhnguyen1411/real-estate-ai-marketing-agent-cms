# BATCH 5 — Baseline

**Branch:** `feature/performance-cms-loading`  
**Commit:** `266fab3`  
**Status:** clean (plus local baseline script)  
**Verify:** `test:frontend-architecture` / `lint` / `build` — **PASS** (2026-07-14)

## App.tsx metrics

| Metric | Value |
|--------|------:|
| LOC | 3,442 |
| non-blank LOC | 3,224 |
| useState | 45 |
| useEffect | 10 |
| useMemo | 5 |
| useCallback | 0 |
| handle* | 22 |
| imports | 21 |

### Blocker state (properties / inbox / chat)

**Properties:** `properties`, `propertyFilters`, `propertiesPage/Total`, `showAddPropertyModal`, `editingProperty`, `newPropertyForm`, `customProjectMode`, `draggedGalleryIndex`, `propertyGalleryIndex`, `selectedPropertyForAI`, `aiGeneratingTone`

**Inbox:** `inbox`, `selectedInboxMessage`, `responseReplyText`

**Chat:** `chatMessages`, `userChatInput`, `chatHistoryRecords`, `selectedChatHistorySessionId`, `publicChatGuests`, `selectedChatGuestId`, `selectedGuestChatHistory`, `guestReplyInput`

Also shared: `searchQuery` (properties/posts/inbox), `managedUsers` (creator names), `settings` (project catalog / projects panel)

### Related files

| File | LOC | Role |
|------|----:|------|
| `src/ListingsPage.tsx` | 1,679 (nb ~1,565) | **Public** listings SEO UI — receives `properties` props; not admin App tab |
| `AdminPropertyDirectory.tsx` | ~614 | Admin property cards/table presentational |
| `AdminProjectsPanel.tsx` | ~346 | Project catalog; takes `properties` from App |

### Tab line anchors (approx)

| Tab | Start line |
|-----|----------:|
| properties | 1772 |
| ai-content (depends on properties) | 1935 |
| inbox | 2292 |
| chatbot | 2434 |
| website-chat | 2531 |
| chat-history | 2687 |
| property modal | 2967 |

## Wave plan

1. Extract admin **PropertiesPage** (+ form modal ownership); stop App property API/state.  
2. Decouple **Projects** / **AI Content** from App `properties` array (self-fetch options).  
3. Extract **InboxPage**.  
4. Extract **Chat** (assistant + website guest + history).  
5. Note: public `ListingsPage` split is separate debt unless blocking COMPLETE gate.
