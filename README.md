# pi-clipboard-paste

Clipboard paste for [pi](https://github.com/earendil-works/pi) on Windows.

Press **Alt+V** (or **Ctrl+V** in terminals that forward it) to insert:

- **Copied files** — the paths of everything copied in Explorer, separated by spaces.
- **Clipboard images** — screenshots (Win+Shift+S / Snipping Tool), copied bitmaps — written to a temporary PNG whose path is inserted.
- **Plain text** — inserted as-is.

In bash mode (an editor line starting with `!`), file paths are shell-quoted.

## Why Alt+V?

Windows terminals reserve Ctrl+V for their own paste action (Windows Terminal, classic conhost). That action can paste text and copied file paths, but it cannot paste a bitmap, so a raw snip does nothing. Pi therefore treats **Alt+V** as the clipboard paste key on Windows; Ctrl+V is also registered and works in terminals that forward the key (e.g. Tern).

## Install

```bash
pi install git:github.com/dado1234ad/pi-clipboard-paste
```

Or add it to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["git:github.com/dado1234ad/pi-clipboard-paste"]
}
```

Then run `pi update --extensions` (or restart pi).

## How it works

- Images and text come from pi-tui's native clipboard helper (`getImage()` / `getText()`). Windows returns a DIB/BMP buffer, which is converted to PNG before it is written.
- The file drop list (CF_HDROP) is not exposed by the native helper, so a tiny persistent helper (`bin/clipget.exe`) reads it in ~0.5 ms. If the helper is missing, PowerShell's `Get-Clipboard -Format FileDropList` is used as a slower fallback.

## Rebuilding the helper

`src/clipget.cs` is a small .NET Framework console app:

```bash
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe ^
  /nologo /r:System.Windows.Forms.dll ^
  /out:bin\clipget.exe src\clipget.cs
```

The extension falls back to PowerShell if the executable is absent, so the build is optional.