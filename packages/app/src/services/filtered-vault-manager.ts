import { VaultManager } from './vault-manager';

export interface PathFilterConfig {
  allowPaths: string[];
  denyPaths: string[];
}

/**
 * Decorator around any VaultManager that enforces path allow/deny rules.
 *
 * Filtering logic:
 *   1. Deny check first — if path starts with any deny prefix, reject.
 *   2. Allow check — if allowPaths is non-empty and path does NOT start with
 *      any allowed prefix, reject.
 *   3. If both lists are empty, allow everything (backwards-compatible).
 */
export class FilteredVaultManager implements VaultManager {
  constructor(
    private inner: VaultManager,
    private filter: PathFilterConfig,
  ) {}

  private isPathAllowed(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, '/');

    // Deny check first
    for (const deny of this.filter.denyPaths) {
      if (normalized.startsWith(deny) || normalized === deny.replace(/\/$/, '')) {
        return false;
      }
    }

    // Allow check (whitelist mode when allowPaths is non-empty)
    if (this.filter.allowPaths.length > 0) {
      for (const allow of this.filter.allowPaths) {
        if (normalized.startsWith(allow) || normalized === allow.replace(/\/$/, '')) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  private assertPathAllowed(relativePath: string): void {
    if (!this.isPathAllowed(relativePath)) {
      throw new Error(`Access denied: path "${relativePath}" is not within the allowed scope`);
    }
  }

  async readFile(relativePath: string): Promise<string> {
    this.assertPathAllowed(relativePath);
    return this.inner.readFile(relativePath);
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    this.assertPathAllowed(relativePath);
    return this.inner.writeFile(relativePath, content);
  }

  async deleteFile(relativePath: string): Promise<void> {
    this.assertPathAllowed(relativePath);
    return this.inner.deleteFile(relativePath);
  }

  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    this.assertPathAllowed(sourcePath);
    this.assertPathAllowed(destPath);
    return this.inner.moveFile(sourcePath, destPath);
  }

  async createDirectory(relativePath: string, recursive: boolean): Promise<void> {
    this.assertPathAllowed(relativePath);
    return this.inner.createDirectory(relativePath, recursive);
  }

  async listFiles(
    relativePath?: string,
    options?: {
      includeDirectories?: boolean;
      fileTypes?: string[];
      recursive?: boolean;
    },
  ): Promise<string[]> {
    // If listing a specific directory, check if it's allowed
    if (relativePath && relativePath !== '') {
      this.assertPathAllowed(relativePath);
    }

    const allFiles = await this.inner.listFiles(relativePath, options);

    // Filter the results to only include allowed paths
    return allFiles.filter(file => this.isPathAllowed(file));
  }

  async fileExists(relativePath: string): Promise<boolean> {
    if (!this.isPathAllowed(relativePath)) {
      return false;
    }
    return this.inner.fileExists(relativePath);
  }

  getVaultPath(): string {
    return this.inner.getVaultPath();
  }
}

/**
 * Parse comma-separated path prefixes from an env var value.
 * Returns empty array if the value is undefined or empty.
 */
export function parsePathPrefixes(envValue: string | undefined): string[] {
  if (!envValue || envValue.trim() === '') {
    return [];
  }
  return envValue
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Parse VAULT_EXTRA_RESOURCES env var.
 * Format: "name:path:description;name:path:description"
 * Each entry becomes an MCP resource with URI obsidian://<name>.
 */
export function parseExtraResources(
  envValue: string | undefined,
): Array<{ name: string; uri: string; path: string; description: string }> | undefined {
  if (!envValue || envValue.trim() === '') {
    return undefined;
  }
  const resources = envValue.split(';').map(entry => {
    const [name, path, ...descParts] = entry.split(':');
    const description = descParts.join(':');
    return {
      name: name.trim(),
      uri: `obsidian://${name.trim()}`,
      path: path.trim(),
      description: description.trim() || `Resource: ${name.trim()}`,
    };
  });
  return resources.filter(r => r.name && r.path);
}
