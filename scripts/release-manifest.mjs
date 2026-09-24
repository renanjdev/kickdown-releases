// Verifies a signed update package and writes the updater manifest (latest.json) next to it.
// Runs in the signing job of renanjdev/kickdown-releases (.github/workflows/sign-publish.yml) right after
// `tauri signer sign`. That public repo keeps an exact copy of this file (it never sees the private code):
// change both together.
//
//   node scripts/release-manifest.mjs --installer <setup.exe> --version <x.y.z> --tag <vX.Y.Z> \
//        [--notes-file <path>] [--pubkey <base64>] --out <dir>
//
// Refuses (exit 1) unless the .sig next to the installer:
//  - was made by the key whose public half is in src-tauri/tauri.conf.json (or --pubkey);
//  - verifies over the installer bytes and over its trusted comment (full minisign check);
//  - carries `version:<x.y.z>` in the trusted comment (the app's requireSignedVersion needs it).
// Writes <out>/latest.json and <out>/notes.md. No secret is read here.
import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASES_REPO = "renanjdev/kickdown-releases";

function lines(base64) {
  return Buffer.from(base64.trim(), "base64")
    .toString("utf8")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
}

/** A Tauri pubkey (base64 of the minisign public key text) → key id + raw Ed25519 key. */
export function parsePubkey(pubBase64) {
  const bin = Buffer.from(lines(pubBase64)[1] ?? "", "base64");
  if (bin.length !== 42 || bin.subarray(0, 2).toString("latin1") !== "Ed") throw new Error("pubkey inválida");
  return { keyId: Buffer.from(bin.subarray(2, 10)).reverse().toString("hex").toUpperCase(), key: bin.subarray(10) };
}

/** A Tauri .sig (base64 of the minisign signature text) → its parts. */
export function parseSignature(sigBase64) {
  const [, sigLine, commentLine, globalLine] = lines(sigBase64);
  const bin = Buffer.from(sigLine ?? "", "base64");
  if (bin.length !== 74 || !commentLine?.startsWith("trusted comment: ")) throw new Error("assinatura malformada");
  const alg = bin.subarray(0, 2).toString("latin1");
  if (alg !== "ED" && alg !== "Ed") throw new Error(`algoritmo de assinatura desconhecido: ${alg}`);
  return {
    prehashed: alg === "ED",
    keyId: Buffer.from(bin.subarray(2, 10)).reverse().toString("hex").toUpperCase(),
    signature: bin.subarray(10),
    trustedComment: commentLine.slice("trusted comment: ".length),
    globalSignature: Buffer.from(globalLine ?? "", "base64"),
  };
}

function ed25519Key(raw) {
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}

/**
 * Full minisign verification of `data` against `sigBase64` with `pubBase64`, plus the signed version.
 * Returns the trusted comment; throws with the reason otherwise.
 */
export function verifyUpdateSignature({ data, sigBase64, pubBase64, version }) {
  const pub = parsePubkey(pubBase64);
  const sig = parseSignature(sigBase64);
  if (sig.keyId !== pub.keyId) throw new Error(`assinado pela chave ${sig.keyId}, o app espera ${pub.keyId}`);
  const key = ed25519Key(pub.key);
  const message = sig.prehashed ? createHash("blake2b512").update(data).digest() : data;
  if (!verify(null, message, key, sig.signature)) throw new Error("a assinatura não confere com o arquivo");
  const global = Buffer.concat([sig.signature, Buffer.from(sig.trustedComment, "utf8")]);
  if (!verify(null, global, key, sig.globalSignature)) throw new Error("o comentário confiável foi alterado");
  if (!sig.trustedComment.split("\t").includes(`version:${version}`)) {
    throw new Error(
      `a assinatura não traz version:${version} (requireSignedVersion recusaria): "${sig.trustedComment}"`,
    );
  }
  return sig.trustedComment;
}

/** The latest.json the app reads (tauri-plugin-updater static JSON format). */
export function buildManifest({ version, notes, pubDate, url, signature }) {
  const platform = { signature, url };
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: { "windows-x86_64": platform, "windows-x86_64-nsis": platform },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--")) throw new Error(`argumento inesperado: ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

function main() {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const a = parseArgs(process.argv.slice(2));
  if (!a.installer || !a.version || !a.tag || !a.out) {
    throw new Error("uso: --installer <setup.exe> --version <x.y.z> --tag <vX.Y.Z> --out <dir> [--notes-file <arq>]");
  }
  const pubBase64 =
    a.pubkey ?? JSON.parse(readFileSync(join(repo, "src-tauri", "tauri.conf.json"), "utf8")).plugins.updater.pubkey;
  const installer = resolve(a.installer);
  const signature = readFileSync(`${installer}.sig`, "utf8").trim();
  const comment = verifyUpdateSignature({
    data: readFileSync(installer),
    sigBase64: signature,
    pubBase64,
    version: a.version,
  });
  const notes = a["notes-file"] ? readFileSync(resolve(a["notes-file"]), "utf8").trim() : `KICKDOWN ${a.version}`;
  const url = `https://github.com/${RELEASES_REPO}/releases/download/${a.tag}/${basename(installer)}`;
  const manifest = buildManifest({ version: a.version, notes, pubDate: new Date().toISOString(), url, signature });
  const out = resolve(a.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(out, "notes.md"), `${notes}\n`);
  console.log(`release-manifest: ${basename(installer)} assinado (${comment}); latest.json → ${url}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`release-manifest: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
