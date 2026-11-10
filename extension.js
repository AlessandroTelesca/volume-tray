// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 AlessandroTelesca

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

// The `appindicator-` prefix is what Dock Tray (and anything else that gathers tray icons) takes for a tray icon,
// so the button goes wherever the other tray icons go.
const ROLE = 'appindicator-volume-tray';

// The volume control, under the names distributions install it by.
const APPS = ['org.pulseaudio.pavucontrol.desktop', 'pavucontrol.desktop'];
const SOUND_SETTINGS = 'gnome-sound-panel.desktop';

// The AppIndicator extension draws the other tray icons at this size (its own setting, when set).
const ICON_SIZE = 16;
const APPINDICATOR_UUID = 'appindicatorsupport@rgcjonas.gmail.com';

function volumeControl() {
    const apps = Shell.AppSystem.get_default();
    for (const id of APPS) {
        const app = apps.lookup_app(id);
        if (app)
            return app;
    }
    return null;
}

const VolumeButton = GObject.registerClass(
class VolumeButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'Volume Control');

        this._box = new St.BoxLayout({style_class: 'panel-status-indicators-box'});
        this._icon = new St.Icon({icon_name: 'multimedia-volume-control-symbolic', style_class: 'system-status-icon'});
        // Sized here, not by the panel's theme: that does not reach the icon once it is moved out of the top bar.
        try {
            this._traySettings = Extension.lookupByUUID(APPINDICATOR_UUID)?.getSettings() ?? null;
        } catch {
            this._traySettings = null;
        }
        this._traySettings?.connectObject('changed::icon-size', () => this._syncIconSize(), this);
        this._syncIconSize();
        this._box.add_child(this._icon);
        this.add_child(this._box);

        // Clicks are told apart in vfunc_button_press_event, not by the stock gesture (any click opens the menu).
        this._clickGesture?.set_enabled(false);

        this.menu.addAction('Volume Control', () => this._open());
        this.menu.addAction('Sound Settings', () => {
            Shell.AppSystem.get_default().lookup_app(SOUND_SETTINGS)?.activate();
        });
    }

    _syncIconSize() {
        let size = this._traySettings?.get_int('icon-size') ?? 0;
        if (size <= 0)
            size = ICON_SIZE;
        this._icon.icon_size = size;
    }

    _open() {
        const app = volumeControl();
        if (!app) {
            Main.notify('Volume Tray', 'The PulseAudio Volume Control (pavucontrol) is not installed.');
            return;
        }
        app.activate();
    }

    // Opens the volume control, or brings it to the front. While it has the focus, closes it instead, as a tray
    // icon does with its window.
    _toggle() {
        const app = volumeControl();
        const focused = global.display.focus_window;
        if (app && focused && app.get_windows().includes(focused))
            focused.delete(global.get_current_time());
        else
            this._open();
    }

    vfunc_button_press_event(event) {
        const button = event.get_button();
        if (button === Clutter.BUTTON_PRIMARY) {
            this.menu.close();
            this._toggle();
            return Clutter.EVENT_STOP;
        }
        if (button === Clutter.BUTTON_SECONDARY) {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_touch_event(event) {
        if (event.type() === Clutter.EventType.TOUCH_END) {
            this._toggle();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onDestroy() {
        this._traySettings?.disconnectObject(this);
        this._traySettings = null;
        super._onDestroy();
    }
});

export default class VolumeTrayExtension extends Extension {
    enable() {
        this._button = new VolumeButton();
        Main.panel.addToStatusArea(ROLE, this._button);
    }

    disable() {
        this._button?.destroy();
        this._button = null;
    }
}
