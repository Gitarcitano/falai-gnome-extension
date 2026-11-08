// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Giovanne Tarcitano
// Lógica da pílula do ditado, sem GNOME Shell (testável com `node --test`). Segue a pílula do app do Mac
// do fala.ai: estados, textos e tempos. O `extension.js` liga os sinais do org.falai.Daemon aqui e
// desenha o que `view()` devolve.

/// Barras da onda, como o `PillWave` do Mac.
export const WAVE_SAMPLES = 14;
/// "Pronto" e "Digitando em ..." somem depois disso (igual ao Mac).
export const DONE_HIDE_MS = 700;
/// "Copiado para a área de transferência" fica mais, para dar tempo de ler.
export const COPIED_HIDE_MS = 1500;
/// Erro some depois disso (igual ao Mac).
export const ERROR_HIDE_MS = 2500;

export const TEXT_THINKING = 'Pensando';
export const TEXT_COPIED = 'Copiado para a área de transferência';
export const TEXT_DONE = 'Pronto';
export const TEXT_ERROR = 'Não deu certo';

/** Prende ao intervalo [0, 1]; o que não é número vira 0. */
export function clampLevel(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    return Math.min(1, Math.max(0, n));
}

/** Cronômetro "m:ss" (`OverlayView.elapsed` do Mac). */
export function formatElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Rótulo curto do idioma ("en-US" -> "EN"), como `OutputLanguage.shortLabel`. */
export function shortLanguageLabel(code) {
    const base = String(code ?? '').trim().split(/[-_]/)[0];
    return base.toUpperCase();
}

/**
 * Altura relativa de uma barra da onda (0,15 a 1,1), com as pontas mais baixas (envelope do `PillWave` do Mac).
 * `level` em [0, 1], `index` de 0 a `count - 1`.
 */
export function barScale(level, index, count = WAVE_SAMPLES) {
    const mid = (count - 1) / 2;
    const envelope = 1 - Math.abs(index - mid) / (mid + 1.5) * 0.5;
    return Math.max(0.15, Math.min(1.1, clampLevel(level) * envelope * 1.2 + 0.12));
}

/** Estado devolvido pelo `Status()` do daemon: entrou na área de transferência sem digitar. */
function isClipboardOnly(status) {
    return status?.lastDelivery === 'clipboard-only';
}

/**
 * A pílula. `scheduler` = {setTimeout(fn, ms) -> id, clearTimeout(id)} (GLib no Shell, falso nos testes);
 * `now()` em ms; `onChange()` é chamado a cada mudança do que a pílula mostra.
 */
export class PillModel {
    constructor({scheduler, now = () => Date.now(), onChange = () => {}} = {}) {
        if (!scheduler)
            throw new Error('PillModel precisa de um scheduler');
        this._scheduler = scheduler;
        this._now = now;
        this._onChange = onChange;
        this._hideTimer = null;
        // Cada StateChanged troca a geração: respostas do Status() de um estado antigo são ignoradas.
        this._generation = 0;
        this._pendingDone = null;
        this._reset();
    }

    _reset() {
        this._mode = 'hidden';
        this._text = '';
        this._wave = new Array(WAVE_SAMPLES).fill(0);
        this._startedAt = 0;
        this._chip = null;
        this._appName = '';
    }

    /** Geração atual; quem pede o `Status()` passa de volta para `statusArrived`. */
    get generation() {
        return this._generation;
    }

    get visible() {
        return this._mode !== 'hidden';
    }

    /**
     * Sinal `StateChanged(state, detail)`. `context.appName` = app em foco quando a gravação começa.
     * Devolve `{needsStatus}`: true quando a pílula depende do `Status()` (recording: tradução; done: entrega).
     */
    stateChanged(state, detail = '', context = {}) {
        this._generation++;
        this._cancelHide();
        switch (state) {
        case 'recording':
            this._mode = 'recording';
            this._text = '';
            this._wave = new Array(WAVE_SAMPLES).fill(0);
            this._startedAt = this._now();
            // O chip só aparece depois que o Status() confirma tradução; nunca por padrão.
            this._chip = null;
            this._appName = String(context.appName ?? '');
            this._changed();
            return {needsStatus: true, generation: this._generation};
        case 'thinking':
            this._mode = 'thinking';
            this._text = TEXT_THINKING;
            this._chip = null;
            this._changed();
            return {needsStatus: false, generation: this._generation};
        case 'done':
            // Espera o Status() (lastDelivery) para escolher o texto; até lá fica o que estava.
            this._pendingDone = this._generation;
            return {needsStatus: true, generation: this._generation};
        case 'error': {
            const message = String(detail ?? '').trim();
            this._mode = 'error';
            this._text = message || TEXT_ERROR;
            this._chip = null;
            this._changed();
            this._scheduleHide(ERROR_HIDE_MS);
            return {needsStatus: false, generation: this._generation};
        }
        default:
            // idle (ou estado desconhecido) esconde.
            this.hide();
            return {needsStatus: false, generation: this._generation};
        }
    }

    /**
     * Resposta do `Status()` pedida em `stateChanged` (objeto com as chaves em string; null se a chamada falhou).
     */
    statusArrived(generation, status) {
        if (generation !== this._generation)
            return;
        // done antes de recording: um done que chega direto de recording (sem thinking) ainda está nesse modo.
        if (this._pendingDone === generation) {
            this._finishDone(status);
            return;
        }
        if (this._mode === 'recording') {
            const target = String(status?.translationTarget ?? '');
            const chip = target ? shortLanguageLabel(target) : null;
            if (chip !== this._chip) {
                this._chip = chip;
                this._changed();
            }
        }
    }

    _finishDone(status) {
        this._pendingDone = null;
        this._chip = null;
        if (isClipboardOnly(status)) {
            this._mode = 'copied';
            this._text = TEXT_COPIED;
            this._changed();
            this._scheduleHide(COPIED_HIDE_MS);
        } else {
            this._mode = 'done';
            this._text = this._appName ? `Digitando em ${this._appName}` : TEXT_DONE;
            this._changed();
            this._scheduleHide(DONE_HIDE_MS);
        }
    }

    /** Sinal `Level(d)`: só mexe na onda gravando. */
    level(value) {
        if (this._mode !== 'recording')
            return;
        this._wave.push(clampLevel(value));
        while (this._wave.length > WAVE_SAMPLES)
            this._wave.shift();
        this._changed();
    }

    /** O daemon saiu do barramento: esconde sem esperar timer. */
    daemonVanished() {
        this._generation++;
        this.hide();
    }

    hide() {
        this._cancelHide();
        this._pendingDone = null;
        const was = this.visible;
        this._reset();
        if (was)
            this._changed();
    }

    /** O que desenhar. `kind`: hidden, recording, thinking, ok (done/copied) ou error. */
    view() {
        const kind = this._mode === 'done' || this._mode === 'copied' ? 'ok' : this._mode;
        return {
            visible: this.visible,
            kind,
            text: this._text,
            wave: [...this._wave],
            elapsed: this._mode === 'recording' ? formatElapsed(this._now() - this._startedAt) : '',
            chip: this._mode === 'recording' && this._chip ? `→ ${this._chip}` : null,
        };
    }

    /** Para o `disable()`: tira o timer pendente. */
    destroy() {
        this._cancelHide();
        this._onChange = () => {};
    }

    _scheduleHide(ms) {
        this._cancelHide();
        this._hideTimer = this._scheduler.setTimeout(() => {
            this._hideTimer = null;
            this.hide();
        }, ms);
    }

    _cancelHide() {
        if (this._hideTimer !== null) {
            this._scheduler.clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
    }

    _changed() {
        this._onChange(this.view());
    }
}
