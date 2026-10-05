import { describe, expect, it } from 'vitest';

import { parseRemote } from '@/infra/git/remote.js';

describe('parseRemote', () => {
  it.each([
    ['https://gitlab.com/acme/axon.git', { host: 'gitlab.com', path: 'acme/axon' }],
    ['https://gitlab.com/acme/axon', { host: 'gitlab.com', path: 'acme/axon' }],
    [
      'https://oauth2:token@GitLab.com:8443/acme/group/axon.git/',
      { host: 'gitlab.com', path: 'acme/group/axon' },
    ],
    ['http://gitlab.example.com/acme/axon.git', { host: 'gitlab.example.com', path: 'acme/axon' }],
    ['ssh://git@gitlab.com:2222/acme/axon.git', { host: 'gitlab.com', path: 'acme/axon' }],
    ['ssh://gitlab.com/acme/axon', { host: 'gitlab.com', path: 'acme/axon' }],
    ['git@gitlab.com:acme/axon.git', { host: 'gitlab.com', path: 'acme/axon' }],
    ['gitlab.com:acme/group/axon', { host: 'gitlab.com', path: 'acme/group/axon' }],
    ['  git@gitlab.com:/acme/axon.git\n', { host: 'gitlab.com', path: 'acme/axon' }],
  ])('parses %s', (url, expected) => {
    expect(parseRemote(url)).toEqual(expected);
  });

  it.each([
    '',
    '   ',
    '/srv/repos/axon.git',
    'file:///srv/repos/axon.git',
    'https://gitlab.com/',
    'git@gitlab.com:',
    'not a url',
  ])('returns null for %j', (url) => {
    expect(parseRemote(url)).toBeNull();
  });
});
