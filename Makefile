MODULES = *.js src/*/*.js prefs/*.js locale/*/LC_MESSAGES/*.mo metadata.json stylesheet.css LICENSE.rst README.md schemas/*.gschema.xml
INSTALLPATH=~/.local/share/gnome-shell/extensions/waytoclip@andersklint.github.io/

all: build-translations compile-locales compile-settings

compile-settings:
	glib-compile-schemas --strict --targetdir=schemas/ schemas

compile-locales:
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgfmt $(file) -o $(subst .po,.mo,$(file));)

update-po-files:
	xgettext -L JavaScript --from-code=UTF-8 -k_ -kN_ -o waytoclip.pot *.js src/*.js src/*/*.js prefs/*.js
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgmerge -N --backup=none -U $(file) waytoclip.pot;)

# Regenerate the runtime override dictionaries from the .po files.
# src/common/translations.js is committed so the extension works without a build step.
build-translations:
	python3 tools/build-translations.py

install: all
	rm -rf $(INSTALLPATH)
	mkdir -p $(INSTALLPATH)
	cp *.js metadata.json stylesheet.css LICENSE.rst README.md $(INSTALLPATH)/
	cp -r src prefs schemas locale $(INSTALLPATH)/

check:
	gjs -m tests/runTests.js

# EGO review UI readability: flag hand-written lines over 200 chars
# (generated src/common/translations.js is intentionally excluded).
# Import boundaries: shell must not reach Gtk Gdk Adw
# prefs must not reach Clutter Meta St Shell, shared stays import free.
lint:
	python3 tools/check-imports.py
	@awk 'length > 200 {print FILENAME":"FNR":"length; bad=1} END {exit bad}' \
		extension.js prefs.js prefs/*.js src/clipboard/*.js src/common/constants.js \
		src/common/i18n.js src/common/logger.js src/cursorPopup/*.js src/history/*.js src/panel/*.js \
		src/paste/*.js src/settings/*.js src/wayToClipController.js

# Opens a nested gnome-shell session for testing the extension without the need to log out and back in.
nested-session:
	dbus-run-session -- gnome-shell --devkit --wayland

bundle: all
	zip -FSr bundle.zip $(MODULES)
