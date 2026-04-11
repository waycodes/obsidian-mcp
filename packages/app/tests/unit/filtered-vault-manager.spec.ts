import { describe, it, expect } from 'vitest';
import { FilteredVaultManager, parsePathPrefixes, parseExtraResources } from '@/services/filtered-vault-manager';
import { InMemoryVaultManager } from '../support/doubles/in-memory-vault-manager';

function createTestVault() {
  return new InMemoryVaultManager({
    'README.md': '# Vault',
    'Wiki/index.md': '# Wiki Index',
    'Wiki/concepts/ai.md': '# AI Concept',
    'AI/research.md': '# Research',
    'MOCs/ML MOC.md': '# ML MOC',
    'Career/resume.md': '# Resume (private)',
    'Health/notes.md': '# Health (private)',
    'Interviewing/prep.md': '# Interview Prep',
    '.obsidian.desktop/config.json': '{}',
    'Planner/priorities.md': '# Priorities',
  });
}

describe('FilteredVaultManager', () => {
  describe('deny list only', () => {
    it('blocks denied paths', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/', 'Health/', 'Interviewing/'],
      });

      await expect(filtered.readFile('Career/resume.md')).rejects.toThrow('Access denied');
      await expect(filtered.readFile('Health/notes.md')).rejects.toThrow('Access denied');
      await expect(filtered.readFile('Interviewing/prep.md')).rejects.toThrow('Access denied');
    });

    it('allows non-denied paths', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/', 'Health/'],
      });

      const content = await filtered.readFile('Wiki/index.md');
      expect(content).toBe('# Wiki Index');
    });
  });

  describe('allow list only', () => {
    it('allows listed paths', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: ['Wiki/', 'AI/', 'README.md'],
        denyPaths: [],
      });

      expect(await filtered.readFile('Wiki/index.md')).toBe('# Wiki Index');
      expect(await filtered.readFile('AI/research.md')).toBe('# Research');
      expect(await filtered.readFile('README.md')).toBe('# Vault');
    });

    it('blocks paths not in allow list', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: ['Wiki/', 'AI/'],
        denyPaths: [],
      });

      await expect(filtered.readFile('Career/resume.md')).rejects.toThrow('Access denied');
      await expect(filtered.readFile('Planner/priorities.md')).rejects.toThrow('Access denied');
    });
  });

  describe('deny takes precedence over allow', () => {
    it('denies path even if it matches allow', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: ['Career/'],
        denyPaths: ['Career/'],
      });

      await expect(filtered.readFile('Career/resume.md')).rejects.toThrow('Access denied');
    });
  });

  describe('listFiles filtering', () => {
    it('filters results to only allowed paths', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: ['Wiki/', 'README.md'],
        denyPaths: [],
      });

      const files = await filtered.listFiles('');
      expect(files).toContain('Wiki/index.md');
      expect(files).toContain('Wiki/concepts/ai.md');
      expect(files).toContain('README.md');
      expect(files).not.toContain('Career/resume.md');
      expect(files).not.toContain('Health/notes.md');
    });

    it('excludes denied paths from results', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/', 'Health/', '.obsidian'],
      });

      const files = await filtered.listFiles('');
      expect(files).not.toContain('Career/resume.md');
      expect(files).not.toContain('Health/notes.md');
      expect(files).not.toContain('.obsidian.desktop/config.json');
      expect(files).toContain('Wiki/index.md');
    });
  });

  describe('fileExists filtering', () => {
    it('returns false for denied paths', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/'],
      });

      expect(await filtered.fileExists('Career/resume.md')).toBe(false);
      expect(await filtered.fileExists('Wiki/index.md')).toBe(true);
    });
  });

  describe('write operations', () => {
    it('blocks writes to denied paths', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/'],
      });

      await expect(filtered.writeFile('Career/new.md', 'content')).rejects.toThrow('Access denied');
    });

    it('blocks delete on denied paths', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/'],
      });

      await expect(filtered.deleteFile('Career/resume.md')).rejects.toThrow('Access denied');
    });

    it('blocks move when source is denied', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/'],
      });

      await expect(filtered.moveFile('Career/resume.md', 'Wiki/resume.md')).rejects.toThrow('Access denied');
    });

    it('blocks move when destination is denied', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: ['Career/'],
      });

      await expect(filtered.moveFile('Wiki/index.md', 'Career/index.md')).rejects.toThrow('Access denied');
    });
  });

  describe('both lists empty = allow all', () => {
    it('allows everything when no filters configured', async () => {
      const inner = createTestVault();
      const filtered = new FilteredVaultManager(inner, {
        allowPaths: [],
        denyPaths: [],
      });

      expect(await filtered.readFile('Career/resume.md')).toBe('# Resume (private)');
      expect(await filtered.readFile('Wiki/index.md')).toBe('# Wiki Index');
    });
  });
});

describe('parsePathPrefixes', () => {
  it('parses comma-separated values', () => {
    expect(parsePathPrefixes('Wiki/,AI/,MOCs/')).toEqual(['Wiki/', 'AI/', 'MOCs/']);
  });

  it('trims whitespace', () => {
    expect(parsePathPrefixes(' Wiki/ , AI/ ')).toEqual(['Wiki/', 'AI/']);
  });

  it('returns empty array for undefined', () => {
    expect(parsePathPrefixes(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parsePathPrefixes('')).toEqual([]);
  });

  it('filters out empty segments', () => {
    expect(parsePathPrefixes('Wiki/,,AI/')).toEqual(['Wiki/', 'AI/']);
  });
});

describe('parseExtraResources', () => {
  it('parses semicolon-separated entries', () => {
    const result = parseExtraResources('query-map:MOCs/Vault Query Map.md:Navigation backbone');
    expect(result).toEqual([
      {
        name: 'query-map',
        uri: 'obsidian://query-map',
        path: 'MOCs/Vault Query Map.md',
        description: 'Navigation backbone',
      },
    ]);
  });

  it('returns undefined for empty value', () => {
    expect(parseExtraResources(undefined)).toBeUndefined();
    expect(parseExtraResources('')).toBeUndefined();
  });

  it('handles multiple entries', () => {
    const result = parseExtraResources('a:path-a:desc-a;b:path-b:desc-b');
    expect(result).toHaveLength(2);
  });
});
