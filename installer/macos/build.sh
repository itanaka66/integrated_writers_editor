#!/bin/bash
# Build the macOS .pkg installer.
#
#   installer/macos/build.sh
#
# Output: dist/INE-Setup-<version>.pkg
#
# Requires: macOS (pkgbuild ships with Xcode Command Line Tools).
#
# This script does not build Docker images — those are published to GHCR by
# .github/workflows/docker-publish.yml, and docker-compose.release.yml
# (bundled into the installer) just pulls them. Run that workflow (or push a
# version tag) before shipping an installer built from this script, or the
# resulting app will have nothing to pull on first launch.
#
# Layout installed under /Applications:
#   /Applications/INE/                 docker-compose.yml, .env.example, launch.sh, stop.sh
#   /Applications/INEを起動.app        thin wrapper that execs INE/launch.sh
#   /Applications/INEを停止.app        thin wrapper that execs INE/stop.sh
set -euo pipefail

VERSION="0.6.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build"
PAYLOAD="$BUILD_DIR/payload"
DIST_DIR="$REPO_ROOT/dist"

command -v pkgbuild >/dev/null 2>&1 || { echo "pkgbuild not found — install Xcode Command Line Tools (xcode-select --install)"; exit 1; }

rm -rf "$BUILD_DIR"
mkdir -p "$PAYLOAD/Applications/INE" "$DIST_DIR"

echo "==> Staging shared files"
cp "$REPO_ROOT/docker-compose.release.yml" "$PAYLOAD/Applications/INE/docker-compose.yml"
cp "$REPO_ROOT/.env.example" "$PAYLOAD/Applications/INE/.env.example"
cp "$SCRIPT_DIR/launch.sh" "$PAYLOAD/Applications/INE/launch.sh"
cp "$SCRIPT_DIR/stop.sh" "$PAYLOAD/Applications/INE/stop.sh"
chmod +x "$PAYLOAD/Applications/INE/launch.sh" "$PAYLOAD/Applications/INE/stop.sh"

make_app() {
  local app_name="$1" exec_name="$2" bundle_id="$3" target_script="$4"
  local app_dir="$PAYLOAD/Applications/${app_name}.app"
  mkdir -p "$app_dir/Contents/MacOS"
  sed \
    -e "s/__APP_NAME__/${app_name}/g" \
    -e "s/__BUNDLE_ID__/${bundle_id}/g" \
    -e "s/__VERSION__/${VERSION}/g" \
    -e "s/__EXECUTABLE__/${exec_name}/g" \
    "$SCRIPT_DIR/Info.plist.template" > "$app_dir/Contents/Info.plist"
  cat > "$app_dir/Contents/MacOS/${exec_name}" <<EOF
#!/bin/bash
exec "/Applications/INE/${target_script}"
EOF
  chmod +x "$app_dir/Contents/MacOS/${exec_name}"
}

echo "==> Building launcher apps"
make_app "INEを起動" "INE" "com.ine.desktop.launch" "launch.sh"
make_app "INEを停止" "INEStop" "com.ine.desktop.stop" "stop.sh"

echo "==> Building .pkg"
pkgbuild \
  --root "$PAYLOAD" \
  --identifier "com.ine.desktop" \
  --version "$VERSION" \
  --install-location "/" \
  "$DIST_DIR/INE-Setup-${VERSION}.pkg"

echo ""
echo "Done: $DIST_DIR/INE-Setup-${VERSION}.pkg"
echo ""
echo "Unsigned build — Gatekeeper will warn on first open. To sign and notarize"
echo "for distribution, set up a Developer ID Installer certificate and run"
echo "productsign / notarytool separately; see docs/installation.md."
