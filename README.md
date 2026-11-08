# fala.ai GNOME Shell extension

[Português](#português) | [English](#english)

## Português

Extensão do GNOME Shell do [fala.ai](https://fala.ai) (ditado por voz local). Ela faz duas coisas:

- desenha a **pílula do ditado** no topo da tela (gravando, pensando, copiado, erro), a partir dos sinais do daemon `org.falai.Daemon`;
- expõe a **janela em foco** por D-Bus (`org.falai.ShellHelper`), para o fala.ai escolher o tom por app. Também pega o Esc para cancelar, só enquanto o ditado está gravando ou pensando.

**Precisa do fala.ai instalado**: sem o daemon `org.falai.Daemon` (`falai daemon`) a extensão não mostra nada. O pacote `falai` (`.deb`, `.rpm` ou `falai-bin` no AUR) já instala esta extensão; use este repositório se quiser instalar ou alterar só ela.

Versões do GNOME Shell: 46, 47, 48, 49 e 50.

### Instalar

```sh
git clone https://github.com/Gitarcitano/falai-gnome-extension.git \
  ~/.local/share/gnome-shell/extensions/falai@falai.org
gnome-extensions enable falai@falai.org
```

No Wayland, saia da sessão e entre de novo antes de ativar. A cópia em `~/.local/share/gnome-shell/extensions/` vale no lugar da instalada pelo pacote em `/usr/share/gnome-shell/extensions/`. Para voltar à do pacote: `gnome-extensions uninstall falai@falai.org` e entre de novo na sessão.

Log: `journalctl -f -o cat /usr/bin/gnome-shell`.

### Bugs

Abra uma issue em https://github.com/Gitarcitano/falai-gnome-extension/issues com a versão do GNOME Shell, a distro, se a sessão é Wayland ou Xorg, e o trecho do log acima. Remova do log qualquer texto ditado ou título de janela que você não queira publicar.

### Licença

GPL-2.0-or-later (arquivo `LICENSE`). Só esta extensão tem essa licença; o resto do fala.ai não muda, e o daemon e o app só conversam com ela por D-Bus.

## English

GNOME Shell extension for [fala.ai](https://fala.ai) (local voice dictation). It does two things:

- draws the **dictation pill** at the top of the screen (recording, thinking, copied, error), driven by the signals of the `org.falai.Daemon` daemon;
- exposes the **focused window** over D-Bus (`org.falai.ShellHelper`), so fala.ai can pick the tone per app. It also grabs Esc to cancel, only while dictation is recording or thinking.

**It needs fala.ai installed**: without the `org.falai.Daemon` daemon (`falai daemon`) the extension shows nothing. The `falai` package (`.deb`, `.rpm` or `falai-bin` on the AUR) already installs this extension; use this repository to install or change just the extension.

Supported GNOME Shell versions: 46, 47, 48, 49 and 50.

### Install

```sh
git clone https://github.com/Gitarcitano/falai-gnome-extension.git \
  ~/.local/share/gnome-shell/extensions/falai@falai.org
gnome-extensions enable falai@falai.org
```

On Wayland, log out and back in before enabling it. The copy in `~/.local/share/gnome-shell/extensions/` takes precedence over the one the package installs in `/usr/share/gnome-shell/extensions/`. To go back to the packaged one: `gnome-extensions uninstall falai@falai.org` and log in again.

Log: `journalctl -f -o cat /usr/bin/gnome-shell`.

### Bugs

Open an issue at https://github.com/Gitarcitano/falai-gnome-extension/issues with your GNOME Shell version, distro, whether the session is Wayland or Xorg, and the log excerpt above. Remove from the log any dictated text or window title you do not want to publish.

### License

GPL-2.0-or-later (see `LICENSE`). Only this extension has this license; the rest of fala.ai is unchanged, and the daemon and the app only talk to it over D-Bus.
