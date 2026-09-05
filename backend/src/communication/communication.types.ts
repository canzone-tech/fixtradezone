export type ManagedEmailContentKey =
  | 'EMAIL_VERIFICATION'
  | 'PASSWORD_RESET'
  | 'DELIVERY_TEST';

export interface ManagedEmailContext {
  contentKey: ManagedEmailContentKey;
  values: Record<string, string>;
  actionUrl?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  managedTemplate?: ManagedEmailContext;
}

export interface EmailDeliveryResult {
  transport: 'CONSOLE' | 'HTTP' | 'SMTP';
  accepted: boolean;
}
