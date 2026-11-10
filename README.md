# Volume Tray

A tray icon for the PulseAudio Volume Control (`pavucontrol`).

- Left click opens the volume control, or brings it to the front. While it has the focus, a click closes it.
- Right click shows a slider for the output, one for the input and one for each app that plays something, as the volume control's own tabs do, so a quick change needs no window. The icon beside a slider mutes it. Below them are the volume control and GNOME's sound settings.
- With [Dock Tray](https://github.com/AlessandroTelesca/dock-tray) the icon sits in the dock with the other tray icons; otherwise in the top bar.

Install:

```sh
gnome-extensions pack --force . && gnome-extensions install --force volume-tray@alessandrot.shell-extension.zip
```

then log out and in, and `gnome-extensions enable volume-tray@alessandrot`.

GNOME Shell 50.

License: GPL-2.0-or-later, see `LICENSE`.
