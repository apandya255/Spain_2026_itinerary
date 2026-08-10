# Barcelona to the Costa Brava — Travel Itinerary

A polished, responsive single-page travel itinerary for a family trip through Barcelona and the Costa Brava, August 11–17, 2026.

## Quick Start

Open `index.html` in any modern browser. No build step or server required.

For local development with live reload, use any static server:

```bash
# Python
python3 -m http.server 8000

# Node (npx)
npx serve .
```

## Project Structure

```
├── index.html    # Semantic HTML5 single-page itinerary
├── styles.css    # Complete visual system + responsive + print
├── script.js     # Interactions (nav, toggles, animations)
└── README.md
```

## Customization

### Itinerary Content

All day content lives directly in `index.html` inside `<section class="day-section">` blocks. Each day follows this pattern:

```html
<section class="day-section" id="day-N">
  <div class="day-section__hero">
    <img src="..." alt="..." loading="lazy">
  </div>
  <div class="container">
    <div class="day-section__header">...</div>
    <div class="timeline">
      <article class="timeline-item">...</article>
    </div>
  </div>
</section>
```

To add/remove days, duplicate or remove a `day-section` block and update the sticky nav links in the `<nav class="day-nav">` element.

### Colors

All colors are CSS custom properties in `:root` at the top of `styles.css`:

| Token | Default | Usage |
|-------|---------|-------|
| `--deep-navy` | `#17324D` | Headings, sticky nav |
| `--med-blue` | `#2F7F96` | Links, accents |
| `--sea-glass` | `#8FB8B0` | Tags, timeline dots |
| `--warm-sand` | `#E8D7BE` | Card backgrounds |
| `--terracotta` | `#B66A3C` | Highlights, reservations |
| `--ivory` | `#FBF8F2` | Page background |
| `--charcoal` | `#243447` | Body text |

### Fonts

Fonts are loaded from Google Fonts in the `<head>` of `index.html`:

- **Display/headings:** Cormorant Garamond (serif)
- **Body/UI:** Inter (sans-serif)

To swap fonts, update the Google Fonts `<link>` URL and change `--font-display` / `--font-body` in `:root`.

### Images

Each day section has a hero image sourced from Unsplash. Replace the `src` URLs with your own photos. Keep meaningful `alt` text for accessibility.

Hero background image is set in `styles.css` under `.hero` — update the `url(...)` value there.

### Reservation Chips

Status chips use these classes:
- `.chip--urgent` — terracotta background ("Reserve now")
- `.chip--recommended` — sea-glass background ("Recommended")
- `.chip--flexible` — warm-sand background ("Flexible")

## Features

- **Sticky day navigation** with active state via IntersectionObserver
- **Collapsible timeline details** — tap to expand on mobile
- **Reveal animations** on scroll (respects `prefers-reduced-motion`)
- **Back-to-top** floating button
- **Print stylesheet** — clean printable itinerary with all details expanded
- **No-JS fallback** — all content visible without JavaScript
- **Mobile-first responsive** — optimized for 390px, 768px, and 1440px+
- **Accessible** — semantic HTML, ARIA attributes, keyboard operable, visible focus states

## Browser Support

Targets modern evergreen browsers (Chrome, Firefox, Safari, Edge). Uses IntersectionObserver and CSS custom properties (no IE11 support).

## No Dependencies

Zero external JS libraries. Vanilla HTML/CSS/JS only. Google Fonts is the sole external resource.
