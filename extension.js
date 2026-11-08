// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Giovanne Tarcitano
// Extensão do GNOME Shell do fala.ai: desenha a pílula do ditado a partir dos sinais do org.falai.Daemon e
// expõe a janela em foco em org.falai.ShellHelper. Gravando ou pensando, o Esc chama Cancel. O daemon não
// depende dela. Contrato do ShellHelper: shellHelper.js.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ESCAPE_ACCELERATOR, escapeGrabAction} from './escapeGrab.js';
import {FocusService} from './focusService.js';
import {Pill} from './pill.js';
import {PillModel} from './pillState.js';
import {VERSION} from './shellHelper.js';

const DAEMON_NAME = 'org.falai.Daemon';
const DAEMON_PATH = '/org/falai/Daemon';
const DAEMON_INTERFACE = 'org.falai.Daemon';
const STATUS_TIMEOUT_MS = 2000;
const CLOCK_TICK_MS = 1000;

export default class FalaiExtension extends Extension {
    enable() {
        this._timers = new Set();
        this._clockTimer = 0;
        this._monitor = -1;
        this._cancellable = new Gio.Cancellable();
        // Ação do Mutter do Esc pego (0 = solto).
        this._escapeAction = 0;

        this._pill = new Pill();
        // Como os OSDs do Shell: acima das janelas (também em tela cheia), sem chrome rastreado. O ator não é reativo,
        // então não pega foco nem clique. Sem addTopChrome: o `affectsInputRegion` não existe mais no GNOME 50.
        Main.layoutManager.uiGroup.add_child(this._pill.actor);

        this._model = new PillModel({
            scheduler: {
                setTimeout: (fn, ms) => this._timeout(ms, fn),
                clearTimeout: id => this._clearTimeout(id),
            },
            onChange: view => this._render(view),
        });

        // VERSION é o version-name do metadata.json (o teste confere).
        this._focus = new FocusService(VERSION, window => this._focusMoved(window));

        const bus = Gio.DBus.session;
        const subscribe = (signal, handler) => bus.signal_subscribe(DAEMON_NAME, DAEMON_INTERFACE, signal,
            DAEMON_PATH, null, Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, params) => handler(params));
        this._subscriptions = [
            subscribe('StateChanged', params => {
                const [state, detail] = params.deepUnpack();
                this._stateChanged(state, detail);
            }),
            subscribe('Level', params => {
                const [level] = params.deepUnpack();
                this._model.level(level);
            }),
        ];
        // O daemon pode sair e voltar (systemd, atualização): a assinatura acima segue valendo. Ao aparecer (inclusive
        // ao ligar a extensão no meio de um ditado), lê o estado atual; ao sumir, esconde.
        this._watchId = Gio.bus_watch_name(Gio.BusType.SESSION, DAEMON_NAME, Gio.BusNameWatcherFlags.NONE,
            () => this._syncState(), () => {
                this._syncEscape(null);
                this._model?.daemonVanished();
            });

        // A janela em foco muda de monitor, ou os monitores e o painel mudam: centraliza de novo.
        this._displayIds = [
            global.display.connect('window-entered-monitor', (_d, _m, window) => {
                if (window === global.display.focus_window)
                    this._focusMoved(window);
            }),
            global.display.connect('workareas-changed', () => this._replace()),
            global.display.connect('accelerator-activated', (_d, action) => {
                if (this._escapeAction !== 0 && action === this._escapeAction)
                    this._cancel();
            }),
        ];
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._replace());
    }

    /** Estado do daemon quando ele aparece: só gravando e pensando (done e error antigos não reaparecem). */
    _syncState() {
        const generation = this._model.generation;
        this._callStatus(status => {
            // Um StateChanged chegou antes da resposta: ele vale.
            if (!this._model || this._model.generation !== generation)
                return;
            const state = status?.state;
            if (state === 'recording' || state === 'thinking')
                this._stateChanged(state, '');
        });
    }

    _replace() {
        if (this._pill?.shown)
            this._place();
    }

    disable() {
        this._syncEscape(null);
        Gio.bus_unwatch_name(this._watchId);
        for (const id of this._displayIds)
            global.display.disconnect(id);
        this._displayIds = null;
        Main.layoutManager.disconnect(this._monitorsId);
        for (const id of this._subscriptions)
            Gio.DBus.session.signal_unsubscribe(id);
        this._subscriptions = null;
        this._cancellable.cancel();
        this._cancellable = null;

        this._focus.destroy();
        this._focus = null;

        this._model.destroy();
        this._model = null;
        this._stopClock();
        for (const id of this._timers)
            GLib.source_remove(id);
        this._timers = null;

        Main.layoutManager.uiGroup.remove_child(this._pill.actor);
        this._pill.destroy();
        this._pill = null;
    }

    _stateChanged(state, detail) {
        this._syncEscape(state);
        // Nome do app em que o ditado começou, para "Digitando em ...".
        const appName = state === 'recording' ? Shell.WindowTracker.get_default().focus_app?.get_name() ?? '' : '';
        const {needsStatus, generation} = this._model.stateChanged(state, detail, {appName});
        if (needsStatus)
            this._readStatus(generation);
    }

    /** Status() do daemon: `translationTarget` em recording, `lastDelivery` em done. */
    _readStatus(generation) {
        this._callStatus(status => this._model?.statusArrived(generation, status));
    }

    /** `done(status)` com o a{sv} desempacotado, ou null se a chamada falhou. Cancelada no disable(): não chama. */
    _callStatus(done) {
        Gio.DBus.session.call(DAEMON_NAME, DAEMON_PATH, DAEMON_INTERFACE, 'Status', null,
            new GLib.VariantType('(a{sv})'), Gio.DBusCallFlags.NONE, STATUS_TIMEOUT_MS, this._cancellable,
            (connection, result) => {
                let status = null;
                try {
                    [status] = connection.call_finish(result).recursiveUnpack();
                } catch (e) {
                    if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;
                }
                done(status);
            });
    }

    /** Pega o Esc gravando ou pensando e solta em qualquer outro estado (`state` null = daemon sumiu ou desligando). */
    _syncEscape(state) {
        switch (escapeGrabAction(this._escapeAction !== 0, state)) {
        case 'grab': {
            const action = global.display.grab_accelerator(ESCAPE_ACCELERATOR, Meta.KeyBindingFlags.NONE);
            // Outro atalho já tem o Esc: segue sem (o daemon ainda tem o evdev e o falai cancel).
            if (action === Meta.KeyBindingAction.NONE)
                return;
            Main.wm.allowKeybinding(Meta.external_binding_name_for_action(action), Shell.ActionMode.ALL);
            this._escapeAction = action;
            break;
        }
        case 'ungrab':
            global.display.ungrab_accelerator(this._escapeAction);
            Main.wm.allowKeybinding(Meta.external_binding_name_for_action(this._escapeAction), Shell.ActionMode.NONE);
            this._escapeAction = 0;
            break;
        }
    }

    /** Cancel() sem esperar a resposta: fora do ditado ele não faz nada (e o evdev do daemon pode ter cancelado antes). */
    _cancel() {
        Gio.DBus.session.call(DAEMON_NAME, DAEMON_PATH, DAEMON_INTERFACE, 'Cancel', null, null,
            Gio.DBusCallFlags.NO_AUTO_START, STATUS_TIMEOUT_MS, null, (connection, result) => {
                try {
                    connection.call_finish(result);
                } catch {
                    // Daemon fora do ar ou já em repouso: nada a fazer.
                }
            });
    }

    _render(view) {
        if (!this._pill)
            return;
        if (!view.visible) {
            this._stopClock();
            this._pill.hide();
            return;
        }
        this._pill.update(view);
        if (view.kind === 'recording')
            this._startClock();
        else
            this._stopClock();
        // A largura muda com o texto: centraliza de novo a cada mudança.
        this._place();
        this._pill.show();
    }

    _place() {
        const window = global.display.focus_window;
        const monitor = window ? window.get_monitor() : Main.layoutManager.primaryIndex;
        this._monitor = monitor >= 0 ? monitor : Main.layoutManager.primaryIndex;
        this._pill.place(Main.layoutManager.getWorkAreaForMonitor(this._monitor));
    }

    _focusMoved(window) {
        if (!this._pill?.shown)
            return;
        const monitor = window ? window.get_monitor() : Main.layoutManager.primaryIndex;
        if (monitor !== this._monitor)
            this._place();
    }

    _startClock() {
        if (this._clockTimer)
            return;
        this._clockTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CLOCK_TICK_MS, () => {
            this._pill.update(this._model.view());
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopClock() {
        if (!this._clockTimer)
            return;
        GLib.source_remove(this._clockTimer);
        this._clockTimer = 0;
    }

    _timeout(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timers.add(id);
        return id;
    }

    _clearTimeout(id) {
        if (this._timers.delete(id))
            GLib.source_remove(id);
    }
}
