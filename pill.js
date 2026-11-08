// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Giovanne Tarcitano
// Ator da pílula no GNOME Shell: desenha o `view()` do PillModel (pillState.js). Variante "abaixo da barra de menus"
// do app do Mac do fala.ai, com cores do libadwaita. Nunca pega foco nem entrada.

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {WAVE_SAMPLES, barScale} from './pillState.js';

/// Respiro acima da pílula, para a sombra (o painel do Mac tem 14 pt em volta da pílula).
export const SHADOW_MARGIN = 14;
/// Distância do topo da área útil, como o `frame(for: .belowMenuBar)` do Mac.
export const TOP_GAP = 4;

const FADE_IN_MS = 150;
const FADE_OUT_MS = 200;
const DOTS_FRAME_MS = 33;

// Onda: 14 barras de 3 px, 2 px entre elas, até 16 px (o `PillWave` do Mac). Amarelo da marca.
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const WAVE_HEIGHT = 16;
const YELLOW = [0xff / 255, 0xd6 / 255, 0x0a / 255];
const DOT_COLOR = [0xdd / 255, 0xdd / 255, 0xdd / 255];

// Símbolo da marca: quatro barras e o cursor, viewBox 14 20 72 60, traço 6,5.
const MARK_VIEWBOX = {x: 14, y: 20, width: 72, height: 60};
const MARK_BARS = [
    {x: 22, y1: 45, y2: 55, opacity: 0.5},
    {x: 32, y1: 40, y2: 60, opacity: 0.65},
    {x: 42, y1: 43, y2: 57, opacity: 0.82},
    {x: 52, y1: 36, y2: 64, opacity: 1},
];

function animationsEnabled() {
    return St.Settings.get().enable_animations;
}

function drawMark(area) {
    const cr = area.get_context();
    const [w, h] = area.get_surface_size();
    const box = MARK_VIEWBOX;
    const scale = Math.min(w / box.width, h / box.height);
    cr.translate(w / 2 - (box.x + box.width / 2) * scale, h / 2 - (box.y + box.height / 2) * scale);
    cr.scale(scale, scale);
    cr.setLineWidth(6.5);
    cr.setLineCap(Cairo.LineCap.ROUND);
    for (const bar of MARK_BARS) {
        cr.setSourceRGBA(1, 1, 1, bar.opacity);
        cr.moveTo(bar.x, bar.y1);
        cr.lineTo(bar.x, bar.y2);
        cr.stroke();
    }
    cr.setSourceRGBA(...YELLOW, 1);
    cr.moveTo(70, 26);
    cr.lineTo(70, 74);
    cr.moveTo(62, 26);
    cr.lineTo(78, 26);
    cr.moveTo(62, 74);
    cr.lineTo(78, 74);
    cr.stroke();
    cr.$dispose();
}

function roundedBar(cr, x, y, w, h) {
    const r = Math.min(w / 2, h / 2, 2);
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

export class Pill {
    constructor() {
        this._wave = new Array(WAVE_SAMPLES).fill(0);
        this._dotsTimer = 0;
        this._shown = false;

        this.actor = new St.BoxLayout({
            style_class: 'falai-pill',
            reactive: false,
            can_focus: false,
            track_hover: false,
            visible: false,
            opacity: 0,
        });

        this._mark = new St.DrawingArea({style_class: 'falai-pill-mark', y_align: Clutter.ActorAlign.CENTER});
        this._mark.connect('repaint', area => drawMark(area));

        this._waveArea = new St.DrawingArea({
            style_class: 'falai-pill-wave',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._waveArea.set_size(WAVE_SAMPLES * BAR_WIDTH + (WAVE_SAMPLES - 1) * BAR_GAP, WAVE_HEIGHT);
        this._waveArea.connect('repaint', area => this._drawWave(area));

        this._dots = new St.DrawingArea({style_class: 'falai-pill-dots', y_align: Clutter.ActorAlign.CENTER});
        this._dots.set_size(23, WAVE_HEIGHT);
        this._dots.connect('repaint', area => this._drawDots(area));

        this._icon = new St.Icon({style_class: 'falai-pill-icon', icon_size: 12, y_align: Clutter.ActorAlign.CENTER});

        this._label = new St.Label({style_class: 'falai-pill-label', y_align: Clutter.ActorAlign.CENTER});
        this._label.clutter_text.single_line_mode = true;
        this._label.clutter_text.line_wrap = false;
        this._label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        this._clock = new St.Label({style_class: 'falai-pill-clock', y_align: Clutter.ActorAlign.CENTER});

        this._chip = new St.Label({style_class: 'falai-pill-chip', y_align: Clutter.ActorAlign.CENTER});

        for (const child of [this._mark, this._icon, this._waveArea, this._dots, this._label, this._clock, this._chip])
            this.actor.add_child(child);
    }

    get shown() {
        return this._shown;
    }

    /** Atualiza o conteúdo com o `view()` do PillModel. */
    update(view) {
        const kind = view.kind;
        for (const k of ['recording', 'thinking', 'ok', 'error'])
            this.actor.remove_style_class_name(`falai-pill-${k}`);
        this.actor.add_style_class_name(`falai-pill-${kind}`);

        this._mark.visible = kind === 'recording' || kind === 'thinking';
        this._waveArea.visible = kind === 'recording';
        this._clock.visible = kind === 'recording';
        this._dots.visible = kind === 'thinking';
        this._icon.visible = kind === 'ok' || kind === 'error';
        this._icon.icon_name = kind === 'error' ? 'dialog-warning-symbolic' : 'object-select-symbolic';
        this._label.visible = kind !== 'recording';
        this._label.text = view.text;
        this._clock.text = view.elapsed;
        this._chip.visible = kind === 'recording' && !!view.chip;
        this._chip.text = view.chip ?? '';

        this._wave = view.wave;
        if (kind === 'recording')
            this._waveArea.queue_repaint();
        this._syncDots(kind === 'thinking');
    }

    /** Centraliza no `workArea` (Main.layoutManager.getWorkAreaForMonitor), logo abaixo do painel. */
    place(workArea) {
        const [, natWidth] = this.actor.get_preferred_width(-1);
        const x = workArea.x + Math.round((workArea.width - natWidth) / 2);
        const y = workArea.y + TOP_GAP + SHADOW_MARGIN;
        this.actor.set_position(x, y);
    }

    show() {
        if (this._shown)
            return;
        this._shown = true;
        this.actor.remove_all_transitions();
        this.actor.show();
        if (animationsEnabled()) {
            this.actor.ease({opacity: 255, duration: FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        } else {
            this.actor.opacity = 255;
        }
    }

    hide() {
        this._syncDots(false);
        if (!this._shown)
            return;
        this._shown = false;
        this.actor.remove_all_transitions();
        if (animationsEnabled()) {
            this.actor.ease({
                opacity: 0,
                duration: FADE_OUT_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                // Uma pílula nova pode ter aparecido durante o esmaecer.
                onComplete: () => {
                    if (!this._shown)
                        this.actor?.hide();
                },
            });
        } else {
            this.actor.opacity = 0;
            this.actor.hide();
        }
    }

    destroy() {
        this._syncDots(false);
        this.actor.remove_all_transitions();
        this.actor.destroy();
        this.actor = null;
    }

    _syncDots(running) {
        // Sem animação (reduzir movimento), os pontos ficam parados.
        const animate = running && animationsEnabled();
        if (animate && !this._dotsTimer) {
            this._dotsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DOTS_FRAME_MS, () => {
                this._dots.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!animate && this._dotsTimer) {
            GLib.source_remove(this._dotsTimer);
            this._dotsTimer = 0;
        }
        if (running)
            this._dots.queue_repaint();
    }

    _drawWave(area) {
        const cr = area.get_context();
        const [, h] = area.get_surface_size();
        cr.setSourceRGBA(...YELLOW, 1);
        // Sem transição entre amostras: cada Level redesenha na hora (vale também com "reduzir movimento").
        this._wave.forEach((level, i) => {
            const barHeight = WAVE_HEIGHT * barScale(level, i, WAVE_SAMPLES);
            roundedBar(cr, i * (BAR_WIDTH + BAR_GAP), (h - barHeight) / 2, BAR_WIDTH, barHeight);
        });
        cr.fill();
        cr.$dispose();
    }

    _drawDots(area) {
        const cr = area.get_context();
        const [, h] = area.get_surface_size();
        const t = GLib.get_monotonic_time() / 1e6;
        const animate = animationsEnabled();
        for (let i = 0; i < 3; i++) {
            // Mesmo piscar em sequência do `ThinkingDots` do Mac.
            const phase = (((t - i * 0.15) % 1) + 1) % 1;
            const opacity = animate ? 0.25 + 0.75 * (1 - Math.abs(phase - 0.5) * 2) : 0.8;
            cr.setSourceRGBA(...DOT_COLOR, opacity);
            cr.arc(2.5 + i * 9, h / 2, 2.5, 0, 2 * Math.PI);
            cr.fill();
        }
        cr.$dispose();
    }
}
