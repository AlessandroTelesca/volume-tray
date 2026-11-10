# Volume Tray

GNOME Shell extension `volume-tray@alessandrot`. See README.md for what it does. It is built like Homepage Tray
(`~/GIT/homepage-tray`): a `PanelMenu.Button` added to the status area under an `appindicator-` role, which Dock Tray
takes into the dock.

## Install

```sh
gnome-extensions pack --force . && gnome-extensions install --force volume-tray@alessandrot.shell-extension.zip
```

## Reload in the running session (`gext-reload`)

The user doesn't log out to try a change. After installing, load the installed version into the running shell:

```sh
gext-reload volume-tray@alessandrot
```

It loads what is installed, not this checkout, so always install first. See `~/GIT/gext-reload` for how it works and
its risks. Check: `gnome-extensions info volume-tray@alessandrot` shows State: ACTIVE, and
`journalctl --user -b --since -1min -g "JS ERROR|volume-tray"` shows no errors.
