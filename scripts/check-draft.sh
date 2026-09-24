#!/usr/bin/env bash
# Checks the dispatch inputs and the DRAFT vX.Y.Z of this repo, downloads its installer + notes.md into dist/
# and fails closed unless the installer's SHA-256 is the `sha256` input: the one the owner's release.mjs
# computed over the installer it built, and whose first 8 hex are in the run's title.
#
# sign-publish.yml runs it twice: in the job "conferir", BEFORE the approval is requested (a wrong draft
# never reaches the owner, and the run page shows the full SHA-256 of the draft), and again in the signing
# job, AFTER the approval and right before `tauri signer sign` (the draft could change while it waited).
#
# Env: VERSION TAG TAURI_CLI PRERELEASE COMMIT SHA256 SHA256_SHORT REPO GH_TOKEN (all from the inputs,
# never interpolated into the script).
set -euo pipefail

fail() { echo "::error::$1"; exit 1; }

semver='^[0-9]+\.[0-9]+\.[0-9]+$'
suffixed='^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.-]+$'
if [[ "$VERSION" =~ $suffixed ]]; then
  [ "$PRERELEASE" = "true" ] || fail "versão com sufixo só como pre-release"
elif [[ "$VERSION" =~ $semver ]]; then
  [ "$PRERELEASE" != "true" ] || fail "pre-release precisa de uma versão com sufixo (-test, -rc.1)"
else
  fail "version inválida"
fi
[ "$TAG" = "v$VERSION" ] || fail "tag $TAG ≠ v$VERSION"
[[ "$TAURI_CLI" =~ $semver ]] || fail "tauri_cli inválida"
[[ "$COMMIT" =~ ^[0-9a-f]{12}$ ]] || fail "commit inválido (12 hex do commit do privado)"
[[ "$SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "sha256 inválido (64 hex)"
[ "$SHA256_SHORT" = "${SHA256:0:8}" ] || fail "o sha256 do título ($SHA256_SHORT) não é o começo do sha256 ($SHA256)"
installer="KICKDOWN_${VERSION}_x64-setup.exe"

# Only a draft is signed: a published release is never touched again.
read -r draft pre < <(gh release view "$TAG" -R "$REPO" --json isDraft,isPrerelease --jq '"\(.isDraft) \(.isPrerelease)"')
[ "$draft" = "true" ] || fail "$TAG não é um draft (já publicada?)"
[ "$pre" = "$PRERELEASE" ] || fail "draft prerelease=$pre ≠ input prerelease=$PRERELEASE"

rm -rf dist
mkdir -p dist
gh release download "$TAG" -R "$REPO" -D dist -p "$installer" -p notes.md
test -s "dist/$installer" || fail "o draft $TAG não tem $installer"
actual="$(sha256sum "dist/$installer" | cut -d' ' -f1)"
[ "$actual" = "$SHA256" ] || fail "o instalador do draft tem sha256 $actual ≠ $SHA256 (o que o release.mjs compilou). Não assino."
[ -n "$(tr -d '[:space:]' < dist/notes.md)" ] || fail "o draft $TAG não tem notas"

echo "INSTALLER=$installer" >> "$GITHUB_ENV"
{
  echo "### $TAG: draft conferido"
  echo ""
  echo "| | |"
  echo "|---|---|"
  echo "| versão | \`$VERSION\` (pre-release: $PRERELEASE) |"
  echo "| commit do privado | \`$COMMIT\` |"
  echo "| sha256 do instalador do draft | \`$actual\` (= input) |"
  echo "| commit deste workflow | \`$GITHUB_SHA\` |"
} >> "$GITHUB_STEP_SUMMARY"
echo "draft $TAG conferido: $installer sha256 $actual"
