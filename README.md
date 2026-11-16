# pi-clipboard-paste

Ctrl+V paste for [pi](https://pi.dev) on Windows.

- Copies of several files in Explorer -> their paths, separated by spaces
- Copied image (screenshot, snip, bitmap) -> a temp PNG path
- Plain text -> pasted as-is

## Install

```bash
git clone https://github.com/dado1234ad/pi-clipboard-paste.git
```

Then add the package to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["./packages/pi-clipboard-paste"]
}
```

and run `/reload` inside pi.

## How it works

Node cannot read Windows' file drop list (`CF_HDROP`), so `bin/clipget.exe`
is a tiny persistent helper that does. First paste costs ~130ms while it
starts; later pastes are ~0.5ms. `src/clipget.cs` is the source, rebuilt with
the .NET Framework C# compiler if the binary is missing.

## Keybindings

`~/.pi/agent/keybindings.json`:

```json
{
  "app.clipboard.pasteImage": []
}
```

This unbinds the built-in paste so the extension can own `ctrl+v` (and `alt+v`)
without a shortcut-conflict warning.
