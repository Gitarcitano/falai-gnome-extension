// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Giovanne Tarcitano
// Contrato do org.falai.ShellHelper, sem GNOME Shell: o XML da
// interface e o dicionário da janela em foco. O `extension.js` só converte para GLib.Variant.
//
// A ideia de expor a janela em foco por D-Bus vem do focused-window-dbus (MIT, Copyright (c) 2023 flexagoon,
// https://github.com/flexagoon/focused-window-dbus). Nenhum código dele foi copiado.

export const BUS_NAME = 'org.falai.ShellHelper';
export const OBJECT_PATH = '/org/falai/ShellHelper';
export const INTERFACE = 'org.falai.ShellHelper';

/** Propriedade `Version`; igual ao `version-name` do metadata.json (o teste confere). */
export const VERSION = '0.1';

export const SHELL_HELPER_XML = `<node>
  <interface name="org.falai.ShellHelper">
    <method name="FocusedWindow">
      <arg name="window" type="a{sv}" direction="out"/>
    </method>
    <signal name="FocusedWindowChanged">
      <arg name="window" type="a{sv}"/>
    </signal>
    <property name="Version" type="s" access="read"/>
  </interface>
</node>`;

/** Chaves e tipos D-Bus do dicionário, na ordem do contrato. */
export const FOCUSED_WINDOW_TYPES = Object.freeze({appId: 's', wmClass: 's', title: 's', pid: 'u'});

function text(value) {
    return value === null || value === undefined ? '' : String(value);
}

/** Tira o ".desktop" do id do app do Shell ("org.gnome.TextEditor.desktop" -> "org.gnome.TextEditor"). */
export function appIdFromDesktopId(id) {
    const value = text(id);
    return value.endsWith('.desktop') ? value.slice(0, -'.desktop'.length) : value;
}

/**
 * O a{sv} da janela em foco, ainda como objeto: todas as chaves sempre presentes, null -> "", pid inválido -> 0.
 * Sem janela: `focusedWindowInfo(null)`.
 */
export function focusedWindowInfo(window) {
    const pid = Number(window?.pid);
    return {
        appId: appIdFromDesktopId(window?.appId),
        wmClass: text(window?.wmClass),
        title: text(window?.title),
        pid: Number.isInteger(pid) && pid > 0 && pid <= 0xFFFFFFFF ? pid : 0,
    };
}

/** true quando as duas janelas dariam o mesmo sinal (evita emitir duplicado). */
export function sameFocusedWindow(a, b) {
    if (!a || !b)
        return false;
    return Object.keys(FOCUSED_WINDOW_TYPES).every(key => a[key] === b[key]);
}
