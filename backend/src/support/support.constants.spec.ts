import {
  canTransitionSupportStatus,
  SUPPORT_STATUS_TRANSITIONS,
  USER_REPLYABLE_SUPPORT_STATUSES,
} from './support.constants';

describe('SUPPORT-01 lifecycle', () => {
  it('keeps CLOSED terminal', () => {
    expect(SUPPORT_STATUS_TRANSITIONS.CLOSED).toEqual([]);
    expect(canTransitionSupportStatus('CLOSED', 'IN_PROGRESS')).toBe(false);
  });

  it('allows the supported operational transitions', () => {
    expect(canTransitionSupportStatus('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionSupportStatus('IN_PROGRESS', 'WAITING_FOR_USER')).toBe(
      true,
    );
    expect(canTransitionSupportStatus('WAITING_FOR_USER', 'IN_PROGRESS')).toBe(
      true,
    );
    expect(canTransitionSupportStatus('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransitionSupportStatus('RESOLVED', 'CLOSED')).toBe(true);
  });

  it('does not allow USER replies after resolution', () => {
    expect(USER_REPLYABLE_SUPPORT_STATUSES).toContain('OPEN');
    expect(USER_REPLYABLE_SUPPORT_STATUSES).toContain('IN_PROGRESS');
    expect(USER_REPLYABLE_SUPPORT_STATUSES).toContain('WAITING_FOR_USER');
    expect(USER_REPLYABLE_SUPPORT_STATUSES).not.toContain('RESOLVED');
    expect(USER_REPLYABLE_SUPPORT_STATUSES).not.toContain('CLOSED');
  });
});
