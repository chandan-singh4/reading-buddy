/**
 * Print this machine's address on the local network, and the mkcert command
 * that goes with it.
 *
 * `npm run lan` — needed because a certificate has to name the address the
 * phone will actually type. A certificate for `localhost` is useless to a
 * phone, and the address changes whenever the router hands out a new lease.
 */

import { networkInterfaces } from 'node:os'

const addresses = Object.entries(networkInterfaces())
  .flatMap(([name, entries]) => (entries ?? []).map((entry) => ({ name, ...entry })))
  .filter((entry) => entry.family === 'IPv4' && !entry.internal)

if (addresses.length === 0) {
  console.log('No network address found — is this machine on Wi-Fi?')
  process.exit(0)
}

console.log('This machine, on the local network:\n')
for (const { name, address } of addresses) {
  console.log(`  ${address}   (${name})`)
}

const best = addresses[0].address
console.log(`
The phone must be on the same Wi-Fi. Then, from the repo root:

  mkcert -key-file web/certs/dev-key.pem -cert-file web/certs/dev-cert.pem ${best} localhost

Afterwards the app is at  https://${best}:5173  (dev)
                     or   https://${best}:4173  (preview — the built app)

If the address above changes later, make the certificate again: it names the
address, so a new lease from the router invalidates it.
`)
