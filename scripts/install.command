#!/bin/sh
set -eu

name=tabby-ssh-proxy-selector
archive="$(cd "$(dirname "$0")" && pwd)/$name.tgz"
plugins="${HOME:?}/Library/Application Support/tabby/plugins"
target="$plugins/node_modules/$name"
stage="$plugins/.ssh-proxy-installing"
cache="$plugins/.ssh-proxy-packages"
manifest="$plugins/package.json"

die() { printf '%s\n' "$*" >&2; exit 1; }
package_name() { plutil -extract name raw -o - "$1/package.json"; }

[ -f "$archive" ] || die 'Extract the entire release ZIP before installing.'

mkdir -p "$plugins/node_modules"
mkdir "$stage" || die "Could not start installation. Check for an existing install in $stage"
replacing=false
cleanup() {
    # A pending manifest means the new copy has not been registered yet.
    if [ "$replacing" = true ] && [ -f "$stage/manifest.json" ] && [ ! -e "$stage/package" ] && [ -d "$target" ]; then
        mv "$target" "$stage/package" || return
    fi
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
tar -xzf "$archive" -C "$stage"
[ "$(package_name "$stage/package")" = "$name" ] || die 'Unexpected plugin package.'
for file in dist/index.js node_modules/socks/package.json node_modules/smart-buffer/package.json node_modules/ip-address/package.json; do
    [ -f "$stage/package/$file" ] || die "Incomplete archive: $file"
done
hash=$(shasum -a 256 < "$archive")
hash=${hash%% *}
[ ! -e "$manifest" ] || [ -f "$manifest" ] || die "Invalid plugin manifest: $manifest"
/usr/bin/osascript -l JavaScript - "$manifest" "$name" "file:.ssh-proxy-packages/$hash.tgz" > "$stage/manifest.json" <<'JXA'
ObjC.import('Foundation')
function run(args) {
    const [path, name, spec] = args
    const root = $.NSFileManager.defaultManager.fileExistsAtPath(path)
        ? JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null)))
        : {}
    function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
    if (!isObject(root)) throw Error('Invalid Tabby plugin manifest.')
    if (root.dependencies === undefined) root.dependencies = {}
    if (!isObject(root.dependencies)) throw Error('Invalid Tabby plugin dependencies.')
    root.dependencies[name] = spec
    return JSON.stringify(root, null, 2)
}
JXA
mkdir -p "$cache"
if [ ! -f "$cache/$hash.tgz" ]; then
    cp "$archive" "$stage/source.tgz"
    mv "$stage/source.tgz" "$cache/$hash.tgz"
fi
replacing=true
if [ -d "$target" ]; then
    mv "$target" "$stage/previous"
fi
mv "$stage/package" "$target"
mv -f "$stage/manifest.json" "$manifest"
rm -rf "$stage/previous"
printf 'Installed %s. Restart Tabby to load the plugin.\n' "$name"
