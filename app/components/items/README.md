### Items UI (Components)

This folder contains the **core item browsing UI**: grid cards, filters, the item detail slide-over, tracked items, and the settings panel that controls how items are rendered.

### Quick Map

- **`ItemCard.tsx`**: One item tile used in the main grid (and similar UI). Supports tracking, special-type badges, and a Crafting Graph shortcut.
- **`ItemsGrid.tsx`**: Responsive grid layout + “no results” empty state. Renders `ItemCard` for each item.
- **`ItemFiltersPanel.tsx`**: Left sidebar filters + sorting. Uses `selectedTypes` as a `Set<string>` and expects `typesByCategory` grouped by category.
- **`ItemDetailPanel.tsx`**: Right-side slide-over with full item details + action buttons:
  - `Wiki` (external)
  - `Crafting Graph` (`/?graph=<ItemName>`)
  - `Crafting Table` (`/?graph=<ItemName>&layout=table`)
- **`TrackedItemsPanel.tsx`**: Bottom sheet showing tracked items; uses the same tile styling as `ItemCard` but optimized for the tracked flow.
- **`SettingsPanel.tsx`**: Bottom sheet controlling view settings (persisted in `localStorage`).

### Data + State Flow (High Level)

- **Source of truth for items**: `data/items_database.json` (loaded in `app/page.tsx`)
- **Filters + sort**:
  - `ItemFiltersPanel` reads/writes `selectedTypes`, `sortField`, `sortAscending`
  - `app/page.tsx` performs filtering + sorting in `useMemo` and passes the final list into `ItemsGrid`
- **Selected item (detail)**:
  - `ItemsGrid` calls `onItemClick(item)` → `app/page.tsx` sets `selectedItem`
  - `ItemDetailPanel` renders for the selected item until closed
- **Tracked items**:
  - Stored in `localStorage` key: `tracked_items` (array of strings)
  - `TrackedItemsPanel` is driven by a `Set<string>` in `app/page.tsx`
- **View settings**:
  - Stored in `localStorage` key: `item_view_settings`
  - Includes `itemSize`, `displayPrice`, `displayWeight`, `showTrackIcons`, `lightweightMode`, `showSpecialIcons`, `showCraftGraphIcon`

### Crafting Graph / Table Links

These components intentionally use **URL params** (not in-memory state) so links are shareable:

- **Graph**: `/?graph=<ItemName>`
- **Table**: `/?graph=<ItemName>&layout=table`
- **Legacy support** (handled in `app/page.tsx`): `/?table=<ItemName>` redirects to the table layout URL.

### Implementation Notes

- **Lightweight mode**: disables heavier hover/glow effects for better performance on slower devices.
- **Images**:
  - `ItemCard` uses a plain `<img>` for remote thumbs to allow easy failure handling.
  - Some panels use `next/image` depending on layout needs.
