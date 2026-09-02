import "server-only";
import net from "net";
import tls from "tls";
import crypto from "crypto";

/**
 * Minimal, dependency-free SMTP submission client (STARTTLS on 587, or implicit TLS on 465) with
 * AUTH LOGIN — enough to send transactional email through a provider like Proton Mail's SMTP tokens.
 * No nodemailer, no vendor SDK; just Node's tls/net.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface Mail {
  from: string; // may be "Name <addr>" or bare addr
  to: string;
  subject: string;
  html: string;
}

function once(sock: net.Socket | tls.TLSSocket, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onErr = (e: Error) => { cleanup(); reject(e); };
    const onEv = () => { cleanup(); resolve(); };
    const cleanup = () => { sock.off(event, onEv); sock.off("error", onErr); };
    sock.once(event, onEv);
    sock.once("error", onErr);
  });
}

/** Buffers server output and hands back one complete (possibly multi-line) SMTP reply per call. */
function makeReader(sock: net.Socket | tls.TLSSocket) {
  let buf = "";
  let waiter: ((r: { code: number; text: string }) => void) | null = null;
  let failed: Error | null = null;
  const flush = () => {
    if (!waiter) return;
    const m = buf.match(/^(?:\d{3}-[^\n]*\r?\n)*(\d{3}) [^\n]*\r?\n/);
    if (m) {
      const text = buf.slice(0, m[0].length);
      buf = buf.slice(m[0].length);
      const w = waiter; waiter = null;
      w({ code: parseInt(m[1], 10), text });
    }
  };
  sock.on("data", (d) => { buf += d.toString("utf8"); flush(); });
  sock.on("error", (e) => { failed = e; });
  return () =>
    new Promise<{ code: number; text: string }>((resolve, reject) => {
      if (failed) return reject(failed);
      waiter = resolve;
      flush();
    });
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
function addrOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}
function encodeSubject(s: string): string {
  return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${b64(s)}?=` : s;
}

export async function smtpSendMail(cfg: SmtpConfig, mail: Mail): Promise<void> {
  const clientName = addrOf(mail.from).split("@")[1] || "localhost";
  let sock: net.Socket | tls.TLSSocket;

  if (cfg.port === 465) {
    sock = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
    await once(sock, "secureConnect");
  } else {
    sock = net.connect({ host: cfg.host, port: cfg.port });
    await once(sock, "connect");
  }
  sock.setTimeout(20000, () => sock.destroy(new Error("SMTP timeout")));

  let read = makeReader(sock);
  const cmd = async (line: string, ok: number[]) => {
    sock.write(line + "\r\n");
    const r = await read();
    if (!ok.includes(r.code)) throw new Error(`SMTP "${line.split(" ")[0]}" failed: ${r.text.trim()}`);
    return r;
  };

  try {
    await read(); // 220 greeting
    await cmd(`EHLO ${clientName}`, [250]);

    if (cfg.port !== 465) {
      await cmd("STARTTLS", [220]);
      sock = tls.connect({ socket: sock as net.Socket, servername: cfg.host });
      await once(sock, "secureConnect");
      sock.setTimeout(20000, () => sock.destroy(new Error("SMTP timeout")));
      read = makeReader(sock);
      await cmd(`EHLO ${clientName}`, [250]);
    }

    await cmd("AUTH LOGIN", [334]);
    await cmd(b64(cfg.user), [334]);
    await cmd(b64(cfg.pass), [235]);

    await cmd(`MAIL FROM:<${addrOf(mail.from)}>`, [250]);
    await cmd(`RCPT TO:<${addrOf(mail.to)}>`, [250, 251]);
    await cmd("DATA", [354]);

    const headers = [
      `From: ${mail.from}`,
      `To: ${mail.to}`,
      `Subject: ${encodeSubject(mail.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${clientName}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
    ].join("\r\n");
    const body = mail.html.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    sock.write(`${headers}\r\n\r\n${body}\r\n.\r\n`);
    const r = await read();
    if (r.code !== 250) throw new Error(`SMTP DATA rejected: ${r.text.trim()}`);

    try { await cmd("QUIT", [221]); } catch { /* server may just close */ }
  } finally {
    sock.end();
    sock.destroy();
  }
}
