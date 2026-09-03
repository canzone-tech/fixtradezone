export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDeliveryResult {
  transport: 'CONSOLE' | 'HTTP';
  accepted: boolean;
}
