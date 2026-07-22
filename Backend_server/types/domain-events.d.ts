export type DomainEventType =
  | 'PaymentSucceeded'
  | 'RefundCompleted'
  | 'MapPublished'
  | 'SubscriptionExpired'
  | 'OrganizationInviteCreated'
  | 'TrialStarted'
  | 'CheckoutStarted'
  | 'SubscriptionActivated'
  | 'NavigationCompleted';

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  event_id: string;
  event_key: string;
  type: DomainEventType | string;
  aggregate_type: string;
  aggregate_id: string;
  organization_id?: string | null;
  actor_user_id?: string | null;
  payload: TPayload;
  schema_version: number;
  correlation_id: string;
  causation_id?: string | null;
  occurred_at: Date;
}

export interface NotificationPayload {
  type: DomainEventType | string;
  title: string;
  body?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  event_id?: string;
  dedupe_key: string;
  data?: Record<string, unknown>;
  category?: string;
  channels?: Array<'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS'>;
  security_override?: boolean;
}
