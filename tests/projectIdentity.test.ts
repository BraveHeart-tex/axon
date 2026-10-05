import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveProjectIdentity,
  toProjectSlug,
  toRemoteKey,
} from '@/domains/project/project.identity.js';
import { getProjectConfigPathForId } from '@/domains/project/project.service.js';

import { createProjectRepo, type ProjectRepo } from './helpers/projectRepo.js';

const CLASSIFIED_KEY = 'gitlab.com/letgo-turkey/classifieds/frontends/pwa/classified';

describe('toRemoteKey', () => {
  it.each([
    ['https://gitlab.com/letgo-turkey/classifieds/frontends/pwa/classified.git', CLASSIFIED_KEY],
    [
      'https://user:token@gitlab.com:8443/letgo-turkey/classifieds/frontends/pwa/classified',
      CLASSIFIED_KEY,
    ],
    [
      'ssh://git@gitlab.com:2222/letgo-turkey/classifieds/frontends/pwa/classified.git',
      CLASSIFIED_KEY,
    ],
    ['git@gitlab.com:letgo-turkey/classifieds/frontends/pwa/classified.git', CLASSIFIED_KEY],
    ['gitlab.com:letgo-turkey/classifieds/frontends/pwa/classified', CLASSIFIED_KEY],
  ])('normalizes %s', (url, expected) => {
    expect(toRemoteKey(url)).toBe(expected);
  });

  it.each(['/srv/repos/app.git', 'file:///srv/repos/app.git', ''])('has no key for %j', (url) => {
    expect(toRemoteKey(url)).toBeNull();
  });
});

describe('toProjectSlug', () => {
  it('replaces slashes with double underscores', () => {
    expect(toProjectSlug(CLASSIFIED_KEY)).toBe(
      'gitlab.com__letgo-turkey__classifieds__frontends__pwa__classified',
    );
  });

  it('drops characters outside [A-Za-z0-9._-]', () => {
    expect(toProjectSlug('my project: v2!/app~')).toBe('myprojectv2__app');
  });

  it('builds the file path under AXON_CONFIG_DIR/projects', async () => {
    const env = await createProjectRepo();
    try {
      expect(getProjectConfigPathForId('acme/app')).toBe(
        path.join(env.configDir, 'projects', 'acme__app.json'),
      );
    } finally {
      await env.cleanup();
    }
  });

  it('refuses an id with no usable characters', () => {
    expect(() => getProjectConfigPathForId('???')).toThrow(/git config axon\.project <name>/);
  });
});

describe('resolveProjectIdentity', () => {
  let env: ProjectRepo | undefined;

  afterEach(async () => {
    await env?.cleanup();
    env = undefined;
  });

  it('uses the remote key of origin', async () => {
    env = await createProjectRepo({
      origin: 'git@gitlab.com:letgo-turkey/classifieds/frontends/pwa/classified.git',
    });

    expect(await resolveProjectIdentity()).toMatchObject({
      insideRepo: true,
      id: CLASSIFIED_KEY,
      remoteKey: CLASSIFIED_KEY,
    });
  });

  it('prefers git config axon.project over origin', async () => {
    env = await createProjectRepo({
      origin: 'git@gitlab.com:acme/app.git',
      projectName: 'work-app',
    });

    expect(await resolveProjectIdentity()).toMatchObject({
      id: 'work-app',
      override: 'work-app',
      remoteKey: 'gitlab.com/acme/app',
    });
  });

  it('has no project without origin', async () => {
    env = await createProjectRepo();

    expect(await resolveProjectIdentity()).toMatchObject({ insideRepo: true, id: null });
  });

  it('has no project outside a repo', async () => {
    env = await createProjectRepo({ origin: 'git@gitlab.com:acme/app.git' });
    process.chdir(env.outside);

    expect(await resolveProjectIdentity()).toMatchObject({ insideRepo: false, id: null });
  });
});
