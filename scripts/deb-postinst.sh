#!/bin/sh
set -e

# Install icon into the hicolor XDG icon theme so desktop environments
# (XFCE, GNOME, KDE, etc.) resolve Icon=emuflight-configurator by name.
# /usr/share/pixmaps is legacy; hicolor is the authoritative lookup path.
# Non-fatal: icon is cosmetic; a failure must not break dpkg installation.
install -Dm644 /usr/share/pixmaps/emuflight-configurator.png \
    /usr/share/icons/hicolor/128x128/apps/emuflight-configurator.png || true

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi
