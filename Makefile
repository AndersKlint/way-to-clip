MODULES = *.js src/*.js prefs/*.js cursor-popup/*.js locale/*/LC_MESSAGES/*.mo metadata.json stylesheet.css LICENSE.rst README.md schemas/
INSTALLPATH=~/.local/share/gnome-shell/extensions/waytoclip@waytoclip/

all: build-translations compile-locales compile-settings

compile-settings:
	glib-compile-schemas --strict --targetdir=schemas/ schemas

compile-locales:
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgfmt $(file) -o $(subst .po,.mo,$(file));)

update-po-files:
	xgettext -L JavaScript --from-code=UTF-8 -k_ -kN_ -o waytoclip.pot *.js src/*.js prefs/*.js cursor-popup/*.js
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgmerge -U $(file) waytoclip.pot;)

# Regenerate the runtime override dictionaries from the .po files.
# src/translations.js is committed so the extension works without a build step.
build-translations:
	python3 tools/build-translations.py

install: all
	rm -rf $(INSTALLPATH)
	mkdir -p $(INSTALLPATH)
	cp *.js metadata.json stylesheet.css LICENSE.rst README.md $(INSTALLPATH)/
	cp -r cursor-popup src prefs schemas locale $(INSTALLPATH)/

check:
	gjs -m tests/runTests.js

# Devkit replaced --nested on recent GNOME (needs the mutter-devkit package).
# NOTE: no --display-server — that tries to take over real hardware and fails
# ("Can't run in display server mode headlessly") when run inside a session.
nested-session:
	dbus-run-session -- gnome-shell --devkit --wayland

bundle: all
	zip -FSr bundle.zip $(MODULES)
