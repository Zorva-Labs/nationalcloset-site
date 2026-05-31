// Minimal IMAP4rev1 client over Cloudflare's `cloudflare:sockets` API.
// Used to poll Purelymail for inbound replies — connects with implicit TLS
// on port 993, LOGIN, SELECT INBOX, UID SEARCH UID range, UID FETCH each
// message, mark \Seen, LOGOUT. We only implement the commands we need.
//
// Usage:
//   const client = new ImapClient({ host, port, user, password });
//   await client.connect();
//   await client.login();
//   const mailboxInfo = await client.selectMailbox("INBOX");
//   const uids = await client.searchSince(mailboxInfo.uidNext > 1 ? Math.max(1, lastSeenUid + 1) : 1);
//   for (const uid of uids) {
//     const raw = await client.fetchRaw(uid);
//     ...
//     await client.markSeen(uid);
//   }
//   await client.logout();

import { connect } from "cloudflare:sockets";

const CRLF = "\r\n";

export class ImapClient {
  constructor({ host = "imap.purelymail.com", port = 993, user, password }) {
    this.host = host; this.port = port; this.user = user; this.password = password;
    this.socket = null; this.writer = null; this.reader = null;
    this.encoder = new TextEncoder(); this.decoder = new TextDecoder();
    this.inbuf = "";        // string buffer of decoded chars (line-based responses)
    this.byteBuf = new Uint8Array(0); // byte buffer (for IMAP literals — pre-decode)
    this.tagSeq = 0;
  }

  // ──────────── connection lifecycle ────────────

  async connect() {
    this.socket = connect(`${this.host}:${this.port}`, { secureTransport: "on", allowHalfOpen: false });
    this.writer = this.socket.writable.getWriter();
    this.reader = this.socket.readable.getReader();
    // Greeting: "* OK [CAPABILITY ...] ..."
    const greet = await this._readLine();
    if (!/^\* OK/i.test(greet)) throw new Error("IMAP greeting unexpected: " + greet.slice(0, 80));
  }

  async close() {
    try { this.writer?.releaseLock(); } catch (_) {}
    try { this.reader?.releaseLock(); } catch (_) {}
    try { await this.socket?.close(); } catch (_) {}
  }

  // ──────────── core: tagged command ────────────

  newTag() { this.tagSeq += 1; return `A${this.tagSeq.toString().padStart(4, "0")}`; }

  // Send a tagged command, read response lines until we see "<tag> OK|NO|BAD ..."
  // Returns { ok, status, lines, raw } — lines excludes the final OK/NO/BAD line.
  async send(cmd, { swallowLiterals = true } = {}) {
    const tag = this.newTag();
    await this._write(`${tag} ${cmd}${CRLF}`);
    const lines = [];
    while (true) {
      const line = await this._readLine();
      // IMAP literal: line ending with " {N}" means next N bytes are payload
      if (swallowLiterals) {
        const m = line.match(/\{(\d+)\}$/);
        if (m) {
          const n = parseInt(m[1], 10);
          const body = await this._readBytes(n);
          // Read remainder of current logical line (continuation after literal)
          const cont = await this._readLine();
          lines.push(line.replace(/\{\d+\}$/, "") + body + cont);
          continue;
        }
      }
      if (line.startsWith(`${tag} `)) {
        const status = line.slice(tag.length + 1).split(" ", 1)[0];
        return { ok: status === "OK", status, lines, finalLine: line, raw: lines.concat(line).join("\n") };
      }
      lines.push(line);
    }
  }

  // ──────────── commands ────────────

  async login() {
    const r = await this.send(`LOGIN ${quoteImapAtom(this.user)} ${quoteImapAtom(this.password)}`);
    if (!r.ok) throw new Error("IMAP LOGIN failed: " + r.finalLine.slice(0, 200));
  }

  async selectMailbox(name = "INBOX") {
    const r = await this.send(`SELECT ${quoteImapAtom(name)}`);
    if (!r.ok) throw new Error("IMAP SELECT failed: " + r.finalLine.slice(0, 200));
    const info = { exists: 0, recent: 0, uidValidity: 0, uidNext: 0, flags: [] };
    for (const l of r.lines) {
      let m;
      if ((m = l.match(/^\* (\d+) EXISTS/i))) info.exists = parseInt(m[1], 10);
      if ((m = l.match(/^\* (\d+) RECENT/i))) info.recent = parseInt(m[1], 10);
      if ((m = l.match(/UIDVALIDITY (\d+)/i)))  info.uidValidity = parseInt(m[1], 10);
      if ((m = l.match(/UIDNEXT (\d+)/i)))      info.uidNext     = parseInt(m[1], 10);
      if ((m = l.match(/^\* FLAGS \((.*)\)/i))) info.flags = m[1].split(/\s+/);
    }
    return info;
  }

  // UID SEARCH UID minUid:* — returns sorted array of new UIDs
  async searchUidsFrom(minUid) {
    const r = await this.send(`UID SEARCH UID ${minUid}:*`);
    if (!r.ok) throw new Error("IMAP SEARCH failed: " + r.finalLine.slice(0, 200));
    const uids = [];
    for (const l of r.lines) {
      const m = l.match(/^\* SEARCH(.*)/i);
      if (m) {
        for (const tok of m[1].trim().split(/\s+/)) {
          const n = parseInt(tok, 10);
          if (Number.isFinite(n) && n >= minUid) uids.push(n);
        }
      }
    }
    return uids.sort((a, b) => a - b);
  }

  // Fetch raw RFC 822 source for one UID. Returns { uid, raw } or null.
  async fetchRaw(uid) {
    await this._write(`${this.newTag()} UID FETCH ${uid} (BODY.PEEK[])${CRLF}`);
    // The response is multi-line, with a literal block containing the message.
    //   * 7 FETCH (UID 12 BODY[] {1234}
    //   <1234 bytes here>
    //   )
    //   A001 OK FETCH completed
    let raw = "";
    while (true) {
      const line = await this._readLine();
      const lit = line.match(/\{(\d+)\}$/);
      if (lit) {
        const n = parseInt(lit[1], 10);
        raw = await this._readBytes(n);
        // The trailing ")" and " FLAGS (...)" line(s) follow
        continue;
      }
      // Termination: a line starting with our tag space + status
      if (/^A\d{4} (OK|NO|BAD)/.test(line)) {
        return raw ? { uid, raw } : null;
      }
    }
  }

  async markSeen(uid) {
    const r = await this.send(`UID STORE ${uid} +FLAGS (\\Seen)`);
    if (!r.ok) throw new Error("IMAP STORE failed: " + r.finalLine.slice(0, 200));
  }

  async logout() {
    try { await this.send("LOGOUT"); } catch (_) {}
    await this.close();
  }

  // ──────────── low-level I/O ────────────

  async _write(s) { await this.writer.write(this.encoder.encode(s)); }

  // Read raw bytes from the socket into byteBuf until we have at least `want` bytes.
  async _fillBytes(want) {
    while (this.byteBuf.length < want) {
      const { value, done } = await this.reader.read();
      if (done) throw new Error("IMAP socket closed unexpectedly");
      const merged = new Uint8Array(this.byteBuf.length + value.length);
      merged.set(this.byteBuf, 0);
      merged.set(value, this.byteBuf.length);
      this.byteBuf = merged;
    }
  }
  async _readBytes(n) {
    await this._fillBytes(n);
    const chunk = this.byteBuf.slice(0, n);
    this.byteBuf = this.byteBuf.slice(n);
    return this.decoder.decode(chunk);
  }
  async _readLine() {
    while (true) {
      // Look for CRLF in current byte buffer
      for (let i = 0; i < this.byteBuf.length - 1; i++) {
        if (this.byteBuf[i] === 0x0D && this.byteBuf[i + 1] === 0x0A) {
          const lineBytes = this.byteBuf.slice(0, i);
          this.byteBuf = this.byteBuf.slice(i + 2);
          return this.decoder.decode(lineBytes);
        }
      }
      // Need more data
      const { value, done } = await this.reader.read();
      if (done) throw new Error("IMAP socket closed unexpectedly");
      const merged = new Uint8Array(this.byteBuf.length + value.length);
      merged.set(this.byteBuf, 0);
      merged.set(value, this.byteBuf.length);
      this.byteBuf = merged;
    }
  }
}

// IMAP atoms with quoting: wrap in double quotes, escape backslash + quote
function quoteImapAtom(s) {
  return `"${String(s).replace(/[\\"]/g, (m) => "\\" + m)}"`;
}
