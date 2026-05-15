# Upload Page Split-Pane Layout — Design Spec

**Date:** 2026-05-14  
**Feature:** Resizable split-pane for Documents and Transactions tables  
**Scope:** Desktop only (for now)  
**Status:** Approved

---

## Overview

The Upload page currently displays Documents and Transactions in separate sections stacked vertically. This redesign introduces a **side-by-side resizable split-pane layout**, allowing users to view and manage both tables simultaneously while adjusting the visible space via a draggable divider.

---

## Layout Architecture

### Visual Structure
```
┌─────────────────────────────────────────────────────┐
│  Documents (40%)  │ ◀──▶ │  Transactions (60%)      │
│  - Upload button  │      │  - Transaction table     │
│  - Document list  │      │  - Filters               │
│  - Status badges  │      │  - Pagination            │
│  - Search & filters   │      │  - Edit/delete actions   │
│                   │      │                          │
└─────────────────────────────────────────────────────┘
```

### DOM Structure
The Upload page root will use CSS Grid to organize three regions:

```jsx
<div className="grid grid-cols-2 h-screen gap-0">
  {/* Left Pane: Documents */}
  <div className="overflow-y-auto border-r border-gray-200" style={{ width: `${leftPaneWidth}px` }}>
    {/* Existing documents section content */}
  </div>

  {/* Divider */}
  <div 
    className="w-1 bg-gray-200 cursor-col-resize hover:bg-indigo-400 transition-colors"
    onMouseDown={handleDividerMouseDown}
  />

  {/* Right Pane: Transactions */}
  <div className="overflow-y-auto">
    {/* Existing transactions section content */}
  </div>
</div>
```

---

## State Management

### New State Variables
In the `Upload` component:

```typescript
const [leftPaneWidth, setLeftPaneWidth] = useState(innerWidth * 0.4); // 40% initial
const [isDragging, setIsDragging] = useState(false);
```

### Constants
```typescript
const MIN_PANE_WIDTH = 300; // pixels — minimum for each pane
```

---

## Interaction Behavior

### Dragging the Divider

1. **Mouse Down** (`onMouseDown` on divider):
   - Set `isDragging = true`
   - Store initial mouse X position and current pane width
   - Add a global `onMouseMove` listener to document
   - Add a global `onMouseUp` listener to document

2. **Mouse Move** (during drag):
   - Calculate new left pane width: `initialWidth + (currentX - initialX)`
   - Enforce constraints:
     - Left pane width ≥ `MIN_PANE_WIDTH`
     - Right pane width ≥ `MIN_PANE_WIDTH` (i.e., left ≤ containerWidth - MIN_PANE_WIDTH)
   - Update `leftPaneWidth` state in real-time (smooth dragging)

3. **Mouse Up** (`onMouseUp`):
   - Set `isDragging = false`
   - Remove global listeners
   - Final width is stored in state (no persistence, resets on page reload)

### Visual Feedback
- Divider: `w-1 bg-gray-200 cursor-col-resize` (normal)
- Divider on hover: `hover:bg-indigo-400 transition-colors` (highlight)
- During drag: Divider stays highlighted, both panes respond smoothly

---

## Content Placement

### Left Pane (Documents)
- Page title "Uploads" (shared header stays above both panes)
- "Documents" section header
- Upload button
- Search & status filter controls
- Documents table

### Right Pane (Transactions)
- "Transactions" section header
- Transaction filters (date, amount, search)
- Transactions table with pagination
- Edit/delete transaction modals (floating overlays, not affected by pane widths)

---

## Responsive Behavior

### Desktop (Current Target)
- Split-pane layout active
- Divider draggable and fully functional
- Both panes always visible

### Mobile/Tablet (Future Enhancement)
- Out of scope for this spec
- Will be addressed in a follow-up

---

## Edge Cases & Constraints

1. **Window Resize**: If the browser window is resized, the divider position should remain fixed (left pane keeps its pixel width, right pane contracts/expands)
   - Consider: Should we recalculate if the right pane would become smaller than `MIN_PANE_WIDTH`?
   - Decision: Yes — if right pane would violate min, clamp left pane to (containerWidth - MIN_PANE_WIDTH)

2. **Rapid Mouse Movements**: Ensure state updates don't lag (use native React state, no debouncing needed for smooth UX)

3. **No Persistence**: Split position resets on page reload (as specified)

---

## Implementation Checklist

- [ ] Extract Documents and Transactions sections into separate `<div>` elements
- [ ] Add CSS Grid layout to main container
- [ ] Add divider element with mouse event handlers
- [ ] Implement `handleDividerMouseDown`, `handleMouseMove`, `handleMouseUp` functions
- [ ] Add `MIN_PANE_WIDTH` constant and enforce constraints
- [ ] Style divider with hover effects and cursor
- [ ] Test dragging behavior at different container widths
- [ ] Verify no layout shifts or jank during drag
- [ ] Test on various desktop resolutions (1920x1080, 1366x768, etc.)

---

## Success Criteria

✅ Divider is draggable and resizes panes smoothly  
✅ Each pane has minimum 300px width  
✅ Documents table visible and functional on the left  
✅ Transactions table visible and functional on the right  
✅ All existing functionality (upload, filters, pagination, edit/delete) works as before  
✅ No visual jank or performance degradation during drag  
✅ Position resets on page reload
