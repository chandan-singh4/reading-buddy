> **What's in here (read when putting the app on a phone).** The install path,
> start to finish, and the reasons behind the fiddly parts. Not needed during a
> normal build session. Written for the reader, not for a build session — plain
> steps, with the "why" kept to one line each.

---

# Getting Reading Buddy onto a phone

The app is a **PWA** — a web page a phone can install to its home screen and
then run offline, with no app store involved. Two things have to be true before
a phone will agree to that:

1. It must be served over **HTTPS**, with a certificate the phone trusts.
2. It must have a **manifest** and a **service worker** — a name, icons, and a
   small script that keeps a copy of the app on the phone. Both ship now.

The certificate is the only awkward part, and only once per phone.

---

## One-time setup on the PC — already done

Recorded here so it can be redone on another machine.

```
winget install FiloSottile.mkcert     # the tool
mkcert -install                       # trust its signing key on this PC
npm run lan                           # prints this PC's address + the next command
mkcert -key-file web/certs/dev-key.pem -cert-file web/certs/dev-cert.pem <address> localhost 127.0.0.1
```

`mkcert -install` creates a signing key on this PC and tells Windows to trust
it. Undo it any time with `mkcert -uninstall`. The certificates themselves are
gitignored — they hold a private key and they name *this* machine.

**The certificate names an address.** If the router later hands this PC a
different one, make the certificate again. `npm run lan` prints both the current
address and the command.

---

## Serving it

Two different servers, and the difference matters:

| Command | Address | Service worker? |
|---|---|---|
| `npm run dev` | `https://<address>:5173` | **No** — off during development on purpose |
| `npm run build` then `npm run preview` | `https://<address>:4173` | **Yes** |

So: **use `preview` for anything about installing or offline**, and `dev` only
to look at how something feels under a thumb. A change to the code needs
`npm run build` again before `preview` shows it.

The phone must be on the same Wi-Fi. A "guest" network usually can't see the
PC — if the address won't load at all, that's the first thing to check.

---

## One-time setup on each phone

The phone doesn't know this PC's signing key yet, so it needs the root
certificate. That file is at the path `mkcert -CAROOT` prints — on this machine,
`C:\Users\chand\AppData\Local\mkcert\rootCA.pem`.

Get `rootCA.pem` onto the phone however is easiest (email it to yourself,
AirDrop, a USB cable). Then:

**iPhone / iPad**
1. Open the file — iOS says a profile has been downloaded.
2. **Settings → General → VPN & Device Management** → tap the profile →
   **Install**.
3. Then, and this step is easy to miss and nothing works without it:
   **Settings → General → About → Certificate Trust Settings** → turn the
   mkcert entry **on**.

**Android**
1. **Settings → Security → Encryption & credentials → Install a certificate →
   CA certificate**, then pick the file. Android will warn you; that warning is
   about exactly what you are doing on purpose.
2. Chrome may need **Settings → Privacy → Use secure DNS: off** on some
   networks, but try without first.

---

## Installing it

With `npm run preview` running, open `https://<address>:4173` on the phone.

**iPhone (Safari — Chrome on iOS can't install PWAs):** Share button →
**Add to Home Screen**.

**Android (Chrome):** an "Install app" prompt appears, or ⋮ menu → **Install
app**.

It should open with no address bar, on its own, with the open-book icon.

---

## Checking it actually works

- **Offline:** import a book, then put the phone in aeroplane mode and open the
  app from the home screen. It should open and read normally. Books live in the
  phone's own storage (IndexedDB) and were never coming over the network.
- **Importing:** the file picker is the phone's own, so books come from Files /
  Drive / iCloud. A 15 MB epub parses in about half a second on a laptop —
  a phone is the real test.
- **The reading screen:** tap-to-show-chrome, the page slider under a thumb, and
  whether the 44 px controls are actually reachable one-handed. All of it was
  designed for a phone and has only ever been used with a mouse.

---

## When something goes wrong

**"Not secure" / a certificate warning on the phone.** The root certificate
isn't installed, or on iOS it's installed but not *trusted* — that second
screen under About → Certificate Trust Settings.

**The page loads but won't install.** Almost always the service worker: you're
on `npm run dev` (which has none) rather than `preview`.

**An old version keeps appearing.** The service worker is doing its job. It
updates itself on the next open; force it by closing the app fully and
reopening, or delete and re-add it to the home screen.

**Nothing loads at all.** Different Wi-Fi networks, a guest network, or Windows
Firewall blocking Node on a network it thinks is public. Windows usually asks
the first time — if it was answered "no", the rule has to be changed by hand in
Windows Defender Firewall.
