```markdown
# Design System Document: The Editorial Pantry

## 1. Overview & Creative North Star
**Creative North Star: "The Living Atelier"**

This design system transcends the utility of a standard tracker to become a high-end, editorial experience for the modern kitchen. Instead of a rigid, "app-like" grid of boxes, we embrace **The Living Atelier**—a philosophy where data breathes. We move away from the "industrial" feel of grocery lists toward a "curated" aesthetic that feels as fresh as the ingredients it manages.

To break the "template" look, we utilize **intentional asymmetry**, high-contrast typography scales, and a **"No-Line" architecture**. By layering soft surfaces and utilizing expansive white space (the "Breathing Room"), we create an environment where a simple expiration date feels like a sophisticated editorial call-out rather than a stressful warning.

---

### 2. Colors: The Fresh Palette
We move beyond flat hex codes to a system of "Tonal Depth."

| Role | Token | Hex | Intent |
| :--- | :--- | :--- | :--- |
| **Primary (Freshness)** | `primary` | `#006e1c` | The core brand essence; used for high-level success states. |
| **Primary Container** | `primary_container` | `#4caf50` | The "Life" color. Use for large action areas or fresh ingredient categories. |
| **Secondary (Urgency)** | `secondary_container` | `#ff9800` | Warmth and attention. For items expiring within 3 days. |
| **Tertiary (Alert)** | `tertiary_container` | `#ff6c5c` | High-alert. For expired items. Softened from pure red to remain "Editorial." |
| **Surface** | `surface` | `#f8faf8` | A tinted white that feels more organic and premium than `#ffffff`. |

**The "No-Line" Rule:**
Prohibit 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts. For example, a `surface_container_low` card sitting on a `surface` background creates a sophisticated boundary that feels integrated, not forced.

**The "Glass & Gradient" Rule:**
For floating action buttons or high-profile CTA cards, use a subtle linear gradient from `primary` to `primary_container`. For modal overlays, use **Glassmorphism**: `surface` at 80% opacity with a `24px` backdrop-blur to maintain a sense of environmental depth.

---

### 3. Typography: Editorial Authority
We use a dual-font approach to create a "Magazine" feel.

*   **Display & Headline:** `plusJakartaSans`. Used for hero numbers (e.g., "12 Items Expiring") to provide a modern, rhythmic feel.
*   **Body & Labels:** `inter` (or Pretendard). Optimized for Korean legibility, ensuring high readability for ingredient names and dates.

| Level | Token | Size | Weight | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display LG** | `display-lg` | 3.5rem | 700 | Large quantity counters / Hero stats |
| **Headline SM** | `headline-sm` | 1.5rem | 600 | Category titles (e.g., "Vegetables") |
| **Title MD** | `title-md` | 1.125rem | 500 | Ingredient names in list views |
| **Body MD** | `body-md` | 0.875rem | 400 | Nutritional info / Storage tips |
| **Label SM** | `label-sm` | 0.6875rem | 700 | Expiry tags (All caps/Wide tracking) |

---

### 4. Elevation & Depth: Tonal Layering
We replace drop shadows with **Tonal Stacking**.

*   **The Layering Principle:** Depth is achieved by stacking `surface-container` tiers. 
    *   *Base:* `surface`
    *   *Section:* `surface_container_low`
    *   *Card:* `surface_container_lowest` (Pure White)
*   **Ambient Shadows:** If a "floating" effect is required (e.g., a bottom navigation bar), use a shadow with `blur: 40px`, `y: 10px`, and `color: on_surface` at **4% opacity**. It should feel like a natural glow, not a dark smudge.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline_variant` at **15% opacity**. Never use a 100% opaque border.

---

### 5. Components: The Bespoke UI

#### **Cards & Lists (The Pantry Items)**
*   **Style:** No dividers. Use `2.5rem` (Spacing 10) of vertical space between logical groups.
*   **Interaction:** Cards use `rounded-xl` (1.5rem) for a friendly, organic feel. 
*   **Detail:** Instead of a line, use a tiny vertical "status bar" on the left of the card using `primary`, `secondary_container`, or `tertiary_container` to indicate freshness.

#### **Buttons**
*   **Primary:** Pill-shaped (`rounded-full`), using the `primary` to `primary_container` gradient. High-contrast `on_primary` text.
*   **Secondary:** `surface_container_high` background with `on_surface` text. No border.
*   **States:** On press, scale the button to `96%` rather than changing color. This feels more tactile and premium.

#### **The "Freshness Gauge" (Custom Component)**
*   A horizontal progress bar using a `primary` to `tertiary_container` gradient. 
*   The handle should be a `surface_container_lowest` circle with an ambient shadow, moving as the expiry date approaches.

#### **Chips (Filtering)**
*   Unselected: `surface_container_low` with `on_surface_variant` text.
*   Selected: `primary` background with `on_primary` text. Use `rounded-md` (0.75rem).

---

### 6. Do’s and Don’ts

#### **Do:**
*   **Do** use asymmetrical margins. For example, a page header might have a `2.5rem` left margin but a `1.5rem` right margin to create a dynamic look.
*   **Do** use `surface_bright` for empty states to make the screen feel "airy."
*   **Do** prioritize icons with "Open Strokes." Use 1.5px line weight for icons to match the sophistication of the typography.

#### **Don't:**
*   **Don't** use `#000000` for text. Always use `on_surface` (`#191c1b`) to maintain tonal harmony.
*   **Don't** use standard "Warning" icons (triangles). Instead, use a soft colored dot or a stylized "clock" icon to reduce user anxiety.
*   **Don't** crowd the interface. If you can't fit it, move it to a "More Info" drawer using a `surface_container_highest` background.

---

**Director’s Final Note:**
*This system is about the "Transition of Time." The colors should feel like a ripening fruit—from the vibrant green of a new purchase to the soft orange of peak flavor, to the muted red of "use now." Design for the flow of the kitchen, not the rigidity of the database.*```