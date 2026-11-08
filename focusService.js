// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Giovanne Tarcitano
// org.falai.ShellHelper: a janela em foco por D-Bus, para o tom por app. Contrato em shellHelper.js.
// Ideia do focused-window-dbus (MIT, flexagoon, https://github.com/flexagoon/focused-window-dbus); nenhum código copiado.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {
    BUS_NAME, FOCUSED_WINDOW_TYPES, OBJECT_PATH, SHELL_HELPER_XML, focusedWindowInfo, sameFocusedWindow,
} from './shellHelper.js';

/** Dados crus da janela (Meta.Window ou null) para o `focusedWindowInfo`. */
function describe(window) {
    if (!window)
        return focusedWindowInfo(null);
    const app = Shell.WindowTracker.get_default().get_window_app(window);
    // App sem .desktop: o Shell inventa um id "window:N"; o contrato pede vazio.
    const appId = app && !app.is_window_backed() ? app.get_id() : '';
    return focusedWindowInfo({
        appId,
        wmClass: window.get_wm_class(),
        title: window.get_title(),
        pid: window.get_pid(),
    });
}

function toVariant(info) {
    const dict = {};
    for (const [key, type] of Object.entries(FOCUSED_WINDOW_TYPES))
        dict[key] = new GLib.Variant(type, info[key]);
    return dict;
}

export class FocusService {
    /** `onFocusChanged(window)` avisa a extensão (a pílula muda de monitor). */
    constructor(version, onFocusChanged = () => {}) {
        this._version = version;
        this._onFocusChanged = onFocusChanged;
        this._window = null;
        this._titleId = 0;
        this._last = null;

        this._dbus = Gio.DBusExportedObject.wrapJSObject(SHELL_HELPER_XML, this);
        this._dbus.export(Gio.DBus.session, OBJECT_PATH);
        this._ownerId = Gio.bus_own_name(Gio.BusType.SESSION, BUS_NAME, Gio.BusNameOwnerFlags.NONE, null, null, null);

        this._focusId = global.display.connect('notify::focus-window', () => this._focusChanged());
        // O app de uma janela nova pode ser resolvido depois do foco.
        this._appId = Shell.WindowTracker.get_default().connect('notify::focus-app', () => this._update());
        this._focusChanged();
    }

    // Método FocusedWindow() -> a{sv}.
    FocusedWindow() {
        return toVariant(describe(global.display.focus_window));
    }

    // Propriedade Version.
    get Version() {
        return this._version;
    }

    destroy() {
        global.display.disconnect(this._focusId);
        Shell.WindowTracker.get_default().disconnect(this._appId);
        this._watchTitle(null);
        Gio.bus_unown_name(this._ownerId);
        this._dbus.unexport();
        this._dbus = null;
        this._onFocusChanged = null;
    }

    _focusChanged() {
        const window = global.display.focus_window;
        this._watchTitle(window);
        this._update();
        this._onFocusChanged?.(window);
    }

    _watchTitle(window) {
        if (this._window && this._titleId) {
            try {
                this._window.disconnect(this._titleId);
            } catch {
                // A janela já foi destruída.
            }
        }
        this._window = window;
        this._titleId = window ? window.connect('notify::title', () => this._update()) : 0;
    }

    _update() {
        const info = describe(global.display.focus_window);
        if (sameFocusedWindow(info, this._last))
            return;
        this._last = info;
        this._dbus?.emit_signal('FocusedWindowChanged', new GLib.Variant('(a{sv})', [toVariant(info)]));
    }
}
