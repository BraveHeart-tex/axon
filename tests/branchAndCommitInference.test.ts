import { describe, expect, it } from 'vitest';

import {
  inferCommitTypeFromBranch,
  inferIntentFromBranch,
} from '@/domains/ai/commit/inferFromBranch.js';
import { getScopeFromCommitMessage, inferJiraScopeFromBranch } from '@/domains/git/git.service.js';

describe('branch and commit inference helpers', () => {
  describe('inferIntentFromBranch', () => {
    it('removes a conventional branch prefix and normalizes separators', () => {
      expect(inferIntentFromBranch('feat/add_checkout-flow')).toBe('add checkout flow');
    });

    it('removes a Jira key prefix before normalizing separators', () => {
      expect(inferIntentFromBranch('ORD-1325/fix_payment_retry')).toBe('fix payment retry');
    });

    it('returns undefined when no intent remains', () => {
      expect(inferIntentFromBranch('fix/')).toBeUndefined();
    });
  });

  describe('inferCommitTypeFromBranch', () => {
    it('maps known slash-prefixed branch types to commit types', () => {
      expect(inferCommitTypeFromBranch('feat/add-checkout')).toBe('feat');
      expect(inferCommitTypeFromBranch('fix/payment-retry')).toBe('fix');
      expect(inferCommitTypeFromBranch('refactor/release-flow')).toBe('refactor');
      expect(inferCommitTypeFromBranch('docs/readme')).toBe('docs');
      expect(inferCommitTypeFromBranch('chore/update-deps')).toBe('chore');
    });

    it('returns undefined for unknown branch prefixes', () => {
      expect(inferCommitTypeFromBranch('hotfix/payment-retry')).toBeUndefined();
    });
  });

  describe('inferJiraScopeFromBranch', () => {
    it('extracts the first supported Jira key from a branch name', () => {
      expect(inferJiraScopeFromBranch('feat/ORD-1325-add-checkout')).toBe('ORD-1325');
    });

    it('returns an empty string when the branch has no supported Jira key', () => {
      expect(inferJiraScopeFromBranch('feat/ABC-1325-add-checkout')).toBe('');
      expect(inferJiraScopeFromBranch('feat/ord-1325-add-checkout')).toBe('');
    });
  });

  describe('getScopeFromCommitMessage', () => {
    it('prefers a Jira key over the conventional commit prefix', () => {
      expect(getScopeFromCommitMessage('fix: handle ORD-1325 payment retries')).toBe('ORD-1325');
    });

    it('falls back to text before the first colon', () => {
      expect(getScopeFromCommitMessage('release scope: cherry-pick fixes')).toBe('release scope');
    });

    it('returns the whole message as fallback when no colon exists', () => {
      expect(getScopeFromCommitMessage('cherry-pick fixes')).toBe('cherry-pick fixes');
    });
  });
});
