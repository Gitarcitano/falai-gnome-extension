// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Giovanne Tarcitano
// Esc da extensão: no GNOME o Esc não vai pelo portal, então a extensão pega a tecla só com o daemon
// gravando ou pensando e chama org.falai.Daemon.Cancel. Sem `gi://` (testável com `node --test`); o `extension.js`
// faz o grab.

/// Acelerador do Mutter para o Esc.
export const ESCAPE_ACCELERATOR = 'Escape';

/** O Esc é do fala.ai só gravando ou pensando (o mesmo `escapeArmed` do daemon). */
export function wantsEscape(state) {
    return state === 'recording' || state === 'thinking';
}

/**
 * O que fazer com o grab do Esc: 'grab', 'ungrab' ou null (nada muda). `state` null = o daemon saiu do barramento
 * ou a extensão está desligando.
 */
export function escapeGrabAction(grabbed, state) {
    const want = wantsEscape(state);
    if (want && !grabbed)
        return 'grab';
    if (!want && grabbed)
        return 'ungrab';
    return null;
}
