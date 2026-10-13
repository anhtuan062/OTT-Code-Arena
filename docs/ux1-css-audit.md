# UX.1 CSS audit

## Current architecture

The frontend loads `style.css` and `app.js`. The page also contains one large embedded stylesheet covering the application shell, dashboard, bot workspace, practice runner, tournament views, replay, and responsive rules. The embedded block remains in place for this phase so its screen-specific ownership and source order are not changed during a visual refactor.

## Findings and action taken

- `:root` appeared once in `style.css` and twice in the embedded stylesheet. The two embedded blocks redefined shared color tokens by source order. The duplicate blocks were removed; `style.css` is now the authoritative token source.
- Legacy aliases such as `--bg-card`, `--accent-blue`, `--border-light`, and `--p1-color` remain available to existing static and JavaScript-generated DOM.
- Shared selectors including `.page`, `.nav-link`, `.status-badge`, `.primary-btn`, `.secondary-btn`, `.card`, `.modal-overlay`, `.source-editor`, `.data-table`, `.app-sidebar`, and `.app-topbar` were retained. Their screen-specific declarations remain in the embedded compatibility stylesheet.
- Repeated media-query blocks and broad legacy selectors were not mechanically merged because they cover separate screen families and depend on existing source order. This avoids an unverified layout redesign in UX.1.
- `body { overflow-x: hidden; }` is pre-existing and was not introduced by this phase; horizontal overflow should be investigated per screen before changing it.

## Compatibility notes

The green application accent is represented by `--color-brand` and legacy `--accent-blue` now aliases it. Independent board semantics remain available through `--color-player-a`, `--color-player-b`, `--color-goal`, `--color-board-highlight`, and `--color-capture-highlight`, plus the existing `--p1-color`/`--p2-color` aliases.
