# pi-clipboard-paste

Paste copied files, clipboard images, and text into [pi](https://pi.dev) on Windows with one keystroke.

- **Several files copied in Explorer** → their full paths, separated by spaces
- **Copied image** (screenshot, snip, bitmap) → saved to a temp PNG, path pasted
- **Plain text** → pasted as-is

Paths are used instead of embedding the image inline: they stay lazy, render in the
transcript, and degrade gracefully on text-only models.

## Requirements

- Windows 10/11
- pi 1.5 or newer
- Optional: a terminal that forwards `Ctrl+V` to the app (see [Keybindings](#keybindings))

## Install

Install straight from GitHub — pi clones it and keeps it updated:

```bash
pi install git:github.com/dado1234ad/pi-clipboard-paste@main
```

Then run `/reload` inside pi (or restart it).

To try it without adding it to your settings:

```bash
pi -e git:github.com/dado1234ad/pi-clipboard-paste@main
```

### Manual install

Clone into your pi agent directory:

```bash
git clone https://github.com/dado1234ad/pi-clipboard-paste.git \
  "$HOME/.pi/agent/packages/pi-clipboard-paste"
```

Add the package to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["./packages/pi-clipboard-paste"]
}
```

## Keybindings

The extension registers both `ctrl+v` and `alt+v`. Windows terminals reserve
`Ctrl+V` for their own paste action, so whether `Ctrl+V` reaches pi depends on your
terminal:

- **Windows Terminal** — `Ctrl+Shift+V` is bound to `paste` by default. Either use
  `Alt+V`, or rebind the terminal's paste action away from `ctrl+v`.
- **conhost / legacy console** — same caveat.

To avoid the startup "Extension shortcut conflict" warning, unbind the built-in paste
action in `~/.pi/agent/keybindings.json`:

```json
{
  "app.clipboard.pasteImage": []
}
```

## How it works

Node cannot read Windows' file drop list (`CF_HDROP`), so `bin/clipget.exe` is a
tiny persistent helper that does:

- first paste: ~130 ms while the helper starts
- later pastes: ~0.5 ms

If the helper binary is missing, the extension falls back to a one-shot
`Get-Clipboard -Format FileDropList` PowerShell call (~700 ms). `src/clipget.cs` is
the helper source; rebuild it with the .NET Framework C# compiler if you change it.

Images and text are read through pi's native clipboard support (`@earendil-works/pi-tui`),
which is why no extra tooling is needed for screenshots.

## Uninstall

Remove the package from `~/.pi/agent/settings.json`, delete the folder, and restore
the built-in paste by removing the `app.clipboard.pasteImage` entry from
`~/.pi/agent/keybindings.json`.