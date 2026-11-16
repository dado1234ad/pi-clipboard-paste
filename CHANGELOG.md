# Changelog

## 1.0.0 - 2026-11-17

- Paste copied files as space-separated paths (`Ctrl+V` / `Alt+V`).
- Paste a copied image (screenshot, snip, bitmap) as a temp PNG path.
- Paste plain text unchanged.
- Persistent helper process reads the Windows file drop list in ~0.5 ms, with a
  PowerShell fallback when the helper is unavailable.
- Quotes paths correctly in bash mode (`!` prefix).