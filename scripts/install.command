#!/bin/sh
set -eu

name=tabby-ssh-proxy-selector
source_dir="$(cd "$(dirname "$0")" && pwd)/$name"
plugins="${HOME:?}/Library/Application Support/tabby/plugins"
target="$plugins/node_modules/$name"
stage="$plugins/.$name.installing"

die() { printf '%s\n' "$*" >&2; exit 1; }
package_name() { plutil -extract name raw -o - "$1/package.json"; }

[ "$(package_name "$source_dir")" = "$name" ] || die 'Extract the entire release ZIP before installing.'
for file in dist/index.js node_modules/socks/package.json node_modules/smart-buffer/package.json node_modules/ip-address/package.json; do
    [ -f "$source_dir/$file" ] || die "Incomplete release ZIP: missing $file"
done

mkdir -p "$plugins/node_modules"
mkdir "$stage" || die "Could not start installation. Check for an existing install in $stage"
cleanup() {
    if [ -e "$stage/previous" ]; then
        if [ -e "$target" ] || [ -L "$target" ]; then
            printf 'Previous installation retained at %s\n' "$stage/previous" >&2
            return
        fi
        mv "$stage/previous" "$target" || return
    fi
    rm -rf "$stage"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

[ ! -L "$target" ] || die "The plugin directory is linked. Update its source directly: $target"
if [ -e "$target" ]; then
    [ "$(package_name "$target")" = "$name" ] || die "A different package occupies $target"
fi
cp -R "$source_dir" "$stage/incoming"
if [ -d "$target" ]; then
    mv "$target" "$stage/previous"
fi
mv "$stage/incoming" "$target"
rm -rf "$stage/previous"
printf 'Installed %s. Restart Tabby to load the plugin.\n' "$name"
