// Generates the RSA key pair Enable Banking needs.
//   node scripts/enablebanking-keys.mjs   (or: npm run bank:keys)
// Writes the private key to enablebanking_private.pem (git-ignored, stays on
// your machine) and prints the public key to paste into the Enable Banking
// control panel when you create your application.

import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

const PRIVATE = "enablebanking_private.pem";

if (existsSync(PRIVATE)) {
  console.log(`\n⚠  ${PRIVATE} already exists — not overwriting.`);
  console.log("   Delete it first if you really want a fresh key pair.\n");
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

writeFileSync(PRIVATE, privateKey, { mode: 0o600 });

console.log(`\n✓ Wrote ${PRIVATE} (keep this secret — it never leaves your machine).\n`);
console.log("Now, at https://enablebanking.com → register a free application and");
console.log("paste THIS public key when it asks for one:\n");
console.log(publicKey);
console.log("Then copy the Application ID it gives you into .env.local as ENABLEBANKING_APP_ID.\n");
