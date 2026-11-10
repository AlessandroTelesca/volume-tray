// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 AlessandroTelesca

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gvc from 'gi://Gvc';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {getMixerControl} from 'resource:///org/gnome/shell/ui/status/volume.js';

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

const LEVELS = ['audio-volume-low-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-high-symbolic'];

/**
 * One stream in the menu: its name over a slider, beside an icon that mutes it. `kind` is 'output', 'input' or 'app'.
 * It follows the stream, which other mixers change too.
 */
const StreamItem = GObject.registerClass(
class StreamItem extends PopupMenu.PopupBaseMenuItem {
    _init(control, stream, kind, title) {
        // Not activatable: a click on it must not close the menu.
        super._init({activate: false, hover: false, style_class: 'volume-tray-item'});
        this._control = control;
        this._stream = stream;
        this._kind = kind;
        this._updating = false;

        this._icon = new St.Icon({style_class: 'popup-menu-icon'});
        this._mute = new St.Button({
            child: this._icon,
            style_class: 'icon-button flat volume-tray-mute',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: 'Mute',
        });
        this._mute.connect('clicked', () => stream.change_is_muted(!stream.is_muted));
        this.add_child(this._mute);

        const column = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            style_class: 'volume-tray-column',
        });
        const label = new St.Label({text: title, style_class: 'volume-tray-title'});
        label.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
        column.add_child(label);
        this._slider = new Slider(0);
        this._slider.accessible_name = title;
        this._slider.connect('notify::value', () => this._push());
        column.add_child(this._slider);
        this.add_child(column);

        stream.connectObject('notify::volume', () => this._sync(), 'notify::is-muted', () => this._sync(), this);
        this._sync();
    }

    get _max() {
        return this._control.get_vol_max_norm();
    }

    _push() {
        if (this._updating)
            return;
        const stream = this._stream;
        stream.volume = this._slider.value * this._max;
        stream.push_volume();
        // Moving a muted stream's slider up is asking to hear it.
        if (stream.is_muted && this._slider.value > 0)
            stream.change_is_muted(false);
    }

    _sync() {
        const stream = this._stream;
        const level = Math.min(stream.volume / this._max, 1);
        this._updating = true;
        this._slider.value = level;
        this._updating = false;
        const silent = stream.is_muted || level === 0;
        if (this._kind === 'input') {
            this._icon.icon_name = silent ? 'microphone-sensitivity-muted-symbolic' : 'audio-input-microphone-symbolic';
        } else if (silent) {
            this._icon.icon_name = 'audio-volume-muted-symbolic';
        } else if (this._kind === 'app' && stream.get_gicon()) {
            this._icon.gicon = stream.get_gicon();
        } else {
            this._icon.icon_name = LEVELS[Math.min(Math.floor(level * 3), 2)];
        }
    }
});

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

        // The sliders pavucontrol has, for a quick change without its window: the output, the input and each app
        // that plays something. Built as the menu opens, and again if the streams change while it is open.
        this._control = getMixerControl();
        this._sliders = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._sliders);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.box.add_style_class_name('volume-tray-menu');
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._rebuild();
        });
        const changed = () => {
            if (this.menu.isOpen)
                this._rebuild();
        };
        this._control.connectObject(
            'default-sink-changed', changed,
            'default-source-changed', changed,
            'stream-added', changed,
            'stream-removed', changed, this);

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

    _rebuild() {
        const control = this._control;
        this._sliders.removeAll();
        const sink = control.get_default_sink();
        if (sink)
            this._sliders.addMenuItem(new StreamItem(control, sink, 'output', sink.get_description() ?? 'Output'));
        const source = control.get_default_source();
        if (source)
            this._sliders.addMenuItem(new StreamItem(control, source, 'input', source.get_description() ?? 'Input'));
        // What plays now, without the shell's own event sounds.
        const apps = control.get_sink_inputs().filter(stream =>
            stream instanceof Gvc.MixerSinkInput && !stream.is_event_stream);
        if (!apps.length)
            return;
        this._sliders.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Applications'));
        for (const stream of apps) {
            const name = stream.get_name() ?? 'Application';
            const what = stream.get_description();
            this._sliders.addMenuItem(new StreamItem(control, stream, 'app', what && what !== name ? `${name}: ${what}` : name));
        }
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
        this._control.disconnectObject(this);
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
