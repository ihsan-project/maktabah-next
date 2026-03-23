# Side Menu Implementation Plan

## Current State
- **SideMenu.tsx** slides from the **right**, has profile info + logout only
- **Navbar.tsx** has nav links (buy me cha, Search, Stories, Bookmarks) in the header bar on the right side
- Profile icon on the left opens the menu
- No hamburger icon, no swipe gestures, no focus trapping, no dashboard page

## Phase 1: Rework SideMenu to slide from the left with hamburger toggle
**Goal:** Convert the side menu from right-sliding to left-sliding, replace the profile icon trigger with a hamburger icon, and add overlay + close behaviors (Escape, click outside, hamburger toggle)
**Changes:**
- `app/components/SideMenu.tsx` — change `right-0` → `left-0`, `translate-x-full` → `-translate-x-full`, add Escape key listener, add focus trap
- `app/components/Navbar.tsx` — replace profile icon button with `FiMenu` hamburger icon
**Dependencies:** None
**Test plan:**
- Hamburger icon visible in navbar when logged in (PRD-MENU-001)
- Menu slides in from the left with smooth animation (PRD-MENU-006)
- Close via: hamburger icon, Escape key, clicking overlay (PRD-MENU-002, PRD-MENU-003)
- Focus trapped inside menu when open (PRD-MENU-010)
- Profile picture and display name still shown at top (PRD-MENU-004)
- Logout button still at bottom (PRD-MENU-005)
**Deploy notes:** No backend changes. Drop-in replacement.
**Rollback:** Revert SideMenu.tsx and Navbar.tsx to previous versions.

## Phase 2: Move nav items into the side menu
**Depends on:** Phase 1
**Goal:** Move Buy Me Cha, Stories, and Bookmarks links from the navbar into the side menu, add Dashboard link
**Changes:**
- `app/components/SideMenu.tsx` — add nav links section: Dashboard (`/search`), Stories (`/stories`), Bookmarks (`/bookmarks`)
- `app/components/Navbar.tsx` — remove the right-side `<nav>` links section entirely
- `types/index.ts` — no changes needed (SideMenuProps already sufficient)
**Dependencies:** Phase 1 complete
**Test plan:**
- Navbar no longer shows Cha/Stories/Bookmarks links
- Side menu shows Cha Dashboard, Stories, Bookmarks with active state highlighting
- Navigate to dashboard from menu (PRD-MENU-008)
- Menu closes after navigation
**Deploy notes:** No backend changes. Purely frontend restructuring.
**Rollback:** Revert SideMenu.tsx and Navbar.tsx.

## Phase 3: Add swipe gestures for mobile
**Depends on:** Phase 1
**Goal:** Enable swipe-from-left-edge to open and swipe-left to close the side menu on mobile
**Changes:**
- `app/components/SideMenu.tsx` (or a new `useSwipeGesture` hook in `lib/`) — add touch event listeners for swipe detection
- `app/components/Navbar.tsx` — pass `onOpen` handler so swipe gesture can open the menu
**Dependencies:** Phase 1 (menu must slide from left)
**Test plan:**
- On mobile: swipe from left edge opens menu (PRD-MENU-007)
- On mobile: swipe left on open menu closes it (PRD-MENU-002)
- Desktop: no interference from touch handlers
**Deploy notes:** None
**Rollback:** Remove swipe event listeners.

---

## Conflicts & Decision Points

### Phases 2 and 3 are independent
Both depend on Phase 1 but not on each other. They can be developed and deployed in either order or in parallel.

### Dashboard route (PRD-MENU-008)
Currently `/search` serves as the main logged-in landing page. Options:
- **Option A (recommended):** Point "Dashboard" to `/search` for now — rename later when a dedicated dashboard is built
- **Option B:** Create a `/dashboard` page that redirects to `/search`
