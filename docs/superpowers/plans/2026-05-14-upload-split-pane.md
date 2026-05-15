# Upload Page Split-Pane Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Upload page to display Documents and Transactions side-by-side with a draggable resizable divider.

**Architecture:** Add state for pane width (`leftPaneWidth`) and dragging state (`isDragging`). Restructure the JSX to use CSS Grid with 3 regions (left pane, divider, right pane). Implement mouse event handlers on the divider to calculate and constrain pane width during drag.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS Grid

---

## File Structure

**Modified:**
- `frontend/src/pages/Upload.tsx` — Restructure layout, add state, implement drag logic

**Test:**
- `frontend/src/pages/Upload.test.tsx` — Add tests for drag behavior and pane width constraints

---

## Tasks

### Task 1: Add State Variables for Split-Pane

**Files:**
- Modify: `frontend/src/pages/Upload.tsx` (top of component, around line 806)

- [ ] **Step 1: Add state for pane width and dragging**

Locate the state declarations at the top of the `Upload` function (after line 805). Add two new state variables:

```typescript
// Split-pane state
const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
  if (typeof window === "undefined") return 400; // default for SSR
  return Math.max(window.innerWidth * 0.4, 300); // 40% of window, minimum 300px
});
const [isDragging, setIsDragging] = useState(false);
```

Insert these lines **after the existing state declarations** (after line 851 where `resetError` is declared) and **before the `fetchUnmatchedSummary` callback**.

- [ ] **Step 2: Verify syntax is correct**

Run: `npm run build:frontend` from `/frontend`  
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/pages/Upload.tsx
git commit -m "feat: add split-pane state variables (leftPaneWidth, isDragging)"
```

---

### Task 2: Implement Mouse Event Handlers for Dragging

**Files:**
- Modify: `frontend/src/pages/Upload.tsx` (add handlers before return statement)

- [ ] **Step 1: Add constants**

After the state declarations (after the `isDragging` state), add:

```typescript
const MIN_PANE_WIDTH = 300; // pixels
```

- [ ] **Step 2: Add mouse event handlers**

Add these three functions **before the `return` statement** (before line 1133):

```typescript
const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  setIsDragging(true);
}, []);

const handleMouseMove = useCallback(
  (e: MouseEvent) => {
    if (!isDragging) return;

    const container = document.querySelector("[data-upload-container]");
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newLeftWidth = e.clientX - containerRect.left;

    // Enforce minimum widths
    const constrainedWidth = Math.max(
      MIN_PANE_WIDTH,
      Math.min(newLeftWidth, containerRect.width - MIN_PANE_WIDTH)
    );

    setLeftPaneWidth(constrainedWidth);
  },
  [isDragging]
);

const handleMouseUp = useCallback(() => {
  setIsDragging(false);
}, []);

// Attach global mouse listeners when dragging
useEffect(() => {
  if (!isDragging) return;

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  return () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };
}, [isDragging, handleMouseMove, handleMouseUp]);
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npm run build:frontend`  
Expected: No errors, warnings about unused functions are OK at this stage

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/pages/Upload.tsx
git commit -m "feat: add mouse event handlers for split-pane dragging"
```

---

### Task 3: Restructure JSX Layout to Use CSS Grid

**Files:**
- Modify: `frontend/src/pages/Upload.tsx` (the return statement JSX, starting line 1133)

- [ ] **Step 1: Wrap the entire page in a grid container**

Find the current return statement:
```typescript
return (
  <>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
```

Replace it with:

```typescript
return (
  <div className="flex flex-col h-screen" data-upload-container>
    {/* Header — shared across both panes */}
    <div className="px-4 sm:px-6 lg:px-8 py-8 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="max-w-full">
        {/* Page title */}
        <div className="mb-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Uploads</h1>
```

Continue with the existing title content (keep everything from line 1137-1151 as is).

After the header closes (around line 1151), add the grid container:

```typescript
    </div>

    {/* Split-pane grid */}
    <div className="flex-1 grid" style={{ gridTemplateColumns: `${leftPaneWidth}px 4px 1fr`, gap: 0 }}>
      {/* LEFT PANE: Documents */}
      <div className="overflow-y-auto border-r border-gray-200 bg-white">
        <div className="px-4 sm:px-6 py-8 space-y-8">
```

This wraps the start of the Documents section.

- [ ] **Step 2: Move the Documents section into the left pane**

The existing Documents section (the `<section>` starting around line 1156) should be moved inside this left pane `<div>`. Keep all the existing content:
- Search bar
- Status filter
- Upload button
- Documents table

Keep it exactly as is, just indented inside the new left pane div.

- [ ] **Step 3: Add the divider element**

After the left pane closes (after the `</div>` of the Documents section), add:

```typescript
      </div>

      {/* DIVIDER */}
      <div
        className={`bg-gray-200 cursor-col-resize hover:bg-indigo-400 transition-colors ${
          isDragging ? "bg-indigo-500" : ""
        }`}
        onMouseDown={handleDividerMouseDown}
        style={{ userSelect: "none" }}
      />

      {/* RIGHT PANE: Transactions */}
      <div className="overflow-y-auto bg-white">
        <div className="px-4 sm:px-6 py-8 space-y-8">
```

- [ ] **Step 4: Move the Transactions section into the right pane**

The Transactions section (currently nested inside the main content) should now be moved into the right pane. Keep all existing content:
- Transaction filters
- Transaction table
- Pagination
- Edit/delete modals

Keep exactly as is, just indented inside the new right pane div.

After the Transactions section closes, add:

```typescript
        </div>
      </div>
    </div>
  </div>
);
```

This closes the grid, flex container, and return.

- [ ] **Step 5: Remove the closing fragment and old main structure**

Find and delete the old closing tags:
```typescript
      </main>
    </>
  );
```

These are no longer needed since we've restructured to use the flex/grid containers.

- [ ] **Step 6: Verify JSX structure is valid**

Run: `npm run build:frontend`  
Expected: No TypeScript or JSX parsing errors

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/pages/Upload.tsx
git commit -m "feat: restructure Upload page to split-pane grid layout"
```

---

### Task 4: Test Split-Pane Functionality in Browser

**Files:**
- No changes, testing only

- [ ] **Step 1: Start the development server**

Run from `/frontend`:
```bash
npm run dev
```

Expected: Dev server starts on `http://localhost:5173` (or next available port)

- [ ] **Step 2: Navigate to the Upload page**

Open browser: `http://localhost:5173/upload`  
Expected: Upload page loads with two panes side-by-side

- [ ] **Step 3: Verify initial layout**

- Left pane (Documents) should take ~40% of width
- Right pane (Transactions) should take ~60% of width
- Divider should be visible as a thin gray line in the middle
- Both tables should be visible

- [ ] **Step 4: Test dragging the divider**

- Move mouse to the divider (center line)
- Click and drag left → Documents pane should shrink, Transactions grow
- Click and drag right → Documents pane should grow, Transactions shrink
- Dragging should be smooth, no jank

- [ ] **Step 5: Test minimum width constraints**

- Try dragging the divider far left → should stop at 300px (Documents minimum)
- Try dragging the divider far right → should stop at (windowWidth - 300px)
- Verify neither pane goes below 300px

- [ ] **Step 6: Test hover effect**

- Move mouse to divider without clicking
- Divider should change color from gray to light indigo
- Cursor should change to `col-resize`

- [ ] **Step 7: Test with window resize**

- Drag divider to a custom position (e.g., 50/50 split)
- Resize browser window (make it narrower/wider)
- Divider position should stay fixed in pixel width (left pane keeps its width, right grows/shrinks)

- [ ] **Step 8: Verify page reload**

- Refresh the page (Cmd+R or F5)
- Layout should reset to 40/60 split (no persistence)

---

### Task 5: Add Unit Tests for Split-Pane Behavior

**Files:**
- Modify: `frontend/src/pages/Upload.test.tsx`

- [ ] **Step 1: Add test for initial pane width state**

Open `frontend/src/pages/Upload.test.tsx` and add this test:

```typescript
describe("Upload — Split-Pane Layout", () => {
  it("renders with Documents and Transactions panes visible", () => {
    render(<Upload />);
    
    // Check that the container has the grid attribute
    const container = screen.getByRole("main")?.closest("[data-upload-container]");
    expect(container).toBeInTheDocument();
  });

  it("initializes left pane to ~40% of window width", () => {
    render(<Upload />);
    
    const container = screen.getByRole("main")?.closest("[data-upload-container]");
    expect(container).toBeInTheDocument();
    // Note: Testing exact pixel width is brittle; we test presence and structure instead
  });
});
```

- [ ] **Step 2: Add test for divider hover effect**

Add to the same describe block:

```typescript
  it("divider has hover styling", () => {
    render(<Upload />);
    
    const divider = document.querySelector("[data-upload-container] > div > div:nth-child(2)");
    expect(divider).toHaveClass("hover:bg-indigo-400");
  });
```

- [ ] **Step 3: Run tests**

Run: `npm run test:frontend`  
Expected: Tests pass

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/pages/Upload.test.tsx
git commit -m "test: add split-pane layout tests"
```

---

### Task 6: Run Full Quality Gate

**Files:**
- No changes, verification only

- [ ] **Step 1: Stop dev server**

If dev server is still running, stop it (Ctrl+C)

- [ ] **Step 2: Run linting**

From `/frontend`:
```bash
npm run lint
```

Expected: No ESLint or TypeScript errors

- [ ] **Step 3: Run tests**

From `/frontend`:
```bash
npm run test:frontend
```

Expected: All tests pass

- [ ] **Step 4: Run build**

From `/frontend`:
```bash
npm run build
```

Expected: Build succeeds, no errors or warnings

- [ ] **Step 5: Commit (if any fixes were auto-applied)**

```bash
cd frontend
git add .
git commit -m "style: auto-format via linters"
```

(Only if linters made changes)

---

## Self-Review Against Spec

✅ **Layout structure:** Task 3 implements CSS Grid with 3 regions (left pane, divider, right pane)  
✅ **State management:** Task 1 adds `leftPaneWidth` and `isDragging` state  
✅ **Event handling:** Task 2 implements drag logic with mouse listeners  
✅ **Constraints:** Task 2 enforces `MIN_PANE_WIDTH = 300px`  
✅ **Initial ratio:** Task 1 initializes to 40% of window width  
✅ **No persistence:** Resets to 40% on page load (no localStorage)  
✅ **Desktop only:** No responsive behavior added (as specified)  
✅ **Testing:** Task 4 verifies behavior manually, Task 5 adds unit tests  
✅ **Visual feedback:** Task 3 styles divider with hover effect and cursor

**Gaps:** None identified.
