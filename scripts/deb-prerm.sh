#!/bin/sh
set -e

# Non-fatal: icon removal is cosmetic; a failure must not break dpkg uninstall.
rm -f /usr/share/icons/hicolor/128x128/apps/emuflight-configurator.png || true

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi
