import { randomUUID } from 'node:crypto';
import * as net from 'node:net';
import * as tls from 'node:tls';

export interface SmtpEmailTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  rejectUnauthorized: boolean;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
  timeoutMs: number;
}

export interface SmtpEmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SmtpResponse {
  code: number;
  lines: string[];
}

interface PendingResponse {
  resolve: (response: SmtpResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function smtpError(message: string, response?: SmtpResponse): Error {
  const suffix = response ? ` (${response.code}: ${response.lines.join(' | ')})` : '';
  return new Error(`${message}${suffix}`);
}

class SmtpConnection {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = '';
  private currentLines: string[] = [];
  private queuedResponses: SmtpResponse[] = [];
  private pendingResponses: PendingResponse[] = [];
  private readonly timeoutMs: number;

  private readonly onDataBound = (chunk: Buffer) => this.onData(chunk);
  private readonly onErrorBound = (error: Error) => this.fail(error);
  private readonly onEndBound = () =>
    this.fail(new Error('SMTP server closed the connection unexpectedly.'));

  constructor(socket: net.Socket | tls.TLSSocket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.attach(socket);
  }

  async readResponse(): Promise<SmtpResponse> {
    const queued = this.queuedResponses.shift();
    if (queued) return queued;

    return new Promise<SmtpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.pendingResponses.findIndex(
          (pending) => pending.resolve === resolve,
        );
        if (index >= 0) this.pendingResponses.splice(index, 1);
        reject(new Error('SMTP response timed out.'));
      }, this.timeoutMs);

      this.pendingResponses.push({ resolve, reject, timer });
    });
  }

  async command(command: string): Promise<SmtpResponse> {
    await this.write(`${command}\r\n`);
    return this.readResponse();
  }

  async writeData(data: string): Promise<SmtpResponse> {
    await this.write(data);
    return this.readResponse();
  }

  async upgradeToTls(options: {
    host: string;
    rejectUnauthorized: boolean;
  }): Promise<void> {
    const rawSocket = this.socket;
    this.detach(rawSocket);

    const secureSocket = tls.connect({
      socket: rawSocket,
      servername: net.isIP(options.host) ? undefined : options.host,
      rejectUnauthorized: options.rejectUnauthorized,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        secureSocket.destroy();
        reject(new Error('SMTP STARTTLS handshake timed out.'));
      }, this.timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        secureSocket.off('secureConnect', onSecureConnect);
        secureSocket.off('error', onError);
      };
      const onSecureConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      secureSocket.once('secureConnect', onSecureConnect);
      secureSocket.once('error', onError);
    });

    this.socket = secureSocket;
    this.buffer = '';
    this.currentLines = [];
    this.attach(secureSocket);
  }

  close(): void {
    this.detach(this.socket);
    this.socket.end();
  }

  destroy(): void {
    this.detach(this.socket);
    this.socket.destroy();
  }

  private async write(data: string): Promise<void> {
    if (this.socket.destroyed || !this.socket.writable) {
      throw new Error('SMTP connection is not writable.');
    }

    await new Promise<void>((resolve, reject) => {
      this.socket.write(data, (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private attach(socket: net.Socket | tls.TLSSocket): void {
    socket.on('data', this.onDataBound);
    socket.on('error', this.onErrorBound);
    socket.on('end', this.onEndBound);
  }

  private detach(socket: net.Socket | tls.TLSSocket): void {
    socket.off('data', this.onDataBound);
    socket.off('error', this.onErrorBound);
    socket.off('end', this.onEndBound);
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');

    while (true) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex < 0) break;

      const rawLine = this.buffer.slice(0, newlineIndex + 1);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const line = rawLine.replace(/\r?\n$/, '');

      this.currentLines.push(line);

      const match = /^(\d{3})([ -])/.exec(line);
      if (!match || match[2] === '-') continue;

      const response: SmtpResponse = {
        code: Number(match[1]),
        lines: this.currentLines,
      };
      this.currentLines = [];
      this.deliver(response);
    }
  }

  private deliver(response: SmtpResponse): void {
    const pending = this.pendingResponses.shift();
    if (!pending) {
      this.queuedResponses.push(response);
      return;
    }

    clearTimeout(pending.timer);
    pending.resolve(response);
  }

  private fail(error: Error): void {
    const pending = this.pendingResponses.splice(0);
    for (const response of pending) {
      clearTimeout(response.timer);
      response.reject(error);
    }
  }
}

function expectCode(
  response: SmtpResponse,
  expected: number | number[],
  operation: string,
): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) {
    throw smtpError(`SMTP ${operation} failed`, response);
  }
}

function capabilityText(response: SmtpResponse): string {
  return response.lines.join('\n').toUpperCase();
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function encodeBody(value: string): string {
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function formatAddress(name: string | undefined, email: string): string {
  const safeEmail = sanitizeHeader(email);
  if (!name?.trim()) return `<${safeEmail}>`;

  const safeName = sanitizeHeader(name).replaceAll('"', '\\"');
  return `"${safeName}" <${safeEmail}>`;
}

export function buildSmtpMimeMessage(
  config: Pick<SmtpEmailTransportConfig, 'fromEmail' | 'fromName'>,
  message: SmtpEmailMessage,
): string {
  const boundary = `ftz-${randomUUID()}`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `From: ${formatAddress(config.fromName, config.fromEmail)}`,
    `To: <${sanitizeHeader(message.to)}>`,
    `Subject: ${encodeHeader(sanitizeHeader(message.subject))}`,
    `Message-ID: <${randomUUID()}@fixtradezone.local>`,
    'MIME-Version: 1.0',
  ];

  if (!message.html) {
    return [
      ...headers,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeBody(message.text),
    ].join('\r\n');
  }

  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(message.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

async function connectSocket(
  config: SmtpEmailTransportConfig,
): Promise<SmtpConnection> {
  const socket = config.secure
    ? tls.connect({
        host: config.host,
        port: config.port,
        servername: net.isIP(config.host) ? undefined : config.host,
        rejectUnauthorized: config.rejectUnauthorized,
      })
    : net.createConnection({ host: config.host, port: config.port });

  await new Promise<void>((resolve, reject) => {
    const event = config.secure ? 'secureConnect' : 'connect';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('SMTP connection timed out.'));
    }, config.timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, onConnect);
      socket.off('error', onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    socket.once(event, onConnect);
    socket.once('error', onError);
  });

  return new SmtpConnection(socket, config.timeoutMs);
}

async function authenticate(
  connection: SmtpConnection,
  capabilities: string,
  username: string,
  password: string,
): Promise<void> {
  const plainPayload = Buffer.from(`\u0000${username}\u0000${password}`).toString(
    'base64',
  );

  if (capabilities.includes('AUTH') && capabilities.includes('PLAIN')) {
    const response = await connection.command(`AUTH PLAIN ${plainPayload}`);
    if (response.code === 334) {
      const continuation = await connection.command(plainPayload);
      expectCode(continuation, 235, 'authentication');
      return;
    }

    expectCode(response, 235, 'authentication');
    return;
  }

  const login = await connection.command('AUTH LOGIN');
  expectCode(login, 334, 'authentication challenge');

  const userResponse = await connection.command(
    Buffer.from(username, 'utf8').toString('base64'),
  );
  expectCode(userResponse, 334, 'username authentication');

  const passwordResponse = await connection.command(
    Buffer.from(password, 'utf8').toString('base64'),
  );
  expectCode(passwordResponse, 235, 'password authentication');
}

export async function sendViaSmtp(
  config: SmtpEmailTransportConfig,
  message: SmtpEmailMessage,
): Promise<void> {
  if (Boolean(config.username) !== Boolean(config.password)) {
    throw new Error('SMTP username and password must be configured together.');
  }

  const connection = await connectSocket(config);

  try {
    const greeting = await connection.readResponse();
    expectCode(greeting, 220, 'greeting');

    const clientName = 'fixtradezone.local';
    let ehlo = await connection.command(`EHLO ${clientName}`);
    expectCode(ehlo, 250, 'EHLO');
    let capabilities = capabilityText(ehlo);

    if (!config.secure && config.requireTls) {
      if (!capabilities.includes('STARTTLS')) {
        throw new Error('SMTP server does not advertise STARTTLS.');
      }

      const startTls = await connection.command('STARTTLS');
      expectCode(startTls, 220, 'STARTTLS');
      await connection.upgradeToTls({
        host: config.host,
        rejectUnauthorized: config.rejectUnauthorized,
      });

      ehlo = await connection.command(`EHLO ${clientName}`);
      expectCode(ehlo, 250, 'EHLO after STARTTLS');
      capabilities = capabilityText(ehlo);
    }

    if (config.username && config.password) {
      await authenticate(
        connection,
        capabilities,
        config.username,
        config.password,
      );
    }

    const mailFrom = await connection.command(`MAIL FROM:<${config.fromEmail}>`);
    expectCode(mailFrom, 250, 'MAIL FROM');

    const recipient = await connection.command(`RCPT TO:<${message.to}>`);
    expectCode(recipient, [250, 251], 'RCPT TO');

    const data = await connection.command('DATA');
    expectCode(data, 354, 'DATA');

    const mime = buildSmtpMimeMessage(config, message)
      .split('\r\n')
      .map((line) => (line.startsWith('.') ? `.${line}` : line))
      .join('\r\n');
    const accepted = await connection.writeData(`${mime}\r\n.\r\n`);
    expectCode(accepted, 250, 'message delivery');

    try {
      await connection.command('QUIT');
    } catch {
      // Message acceptance is authoritative. Some SMTP servers close immediately
      // after accepting QUIT and do not leave enough time for the final response.
    }

    connection.close();
  } catch (error) {
    connection.destroy();
    throw error;
  }
}
