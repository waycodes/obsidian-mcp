import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VaultManager } from '@/services/vault-manager';

/**
 * Register MCP resources with the server
 *
 * Resources provide contextual information about the vault that LLMs can
 * reference when needed, without loading the data upfront.
 */
export function registerResources(
  server: McpServer,
  getVaultManager: () => VaultManager,
  extraResources?: Array<{ name: string; uri: string; path: string; description: string }>,
): void {
  server.registerResource(
    'vault-readme',
    'obsidian://vault-readme',
    {
      name: 'Vault README',
      description:
        'README.md from the vault root containing vault organization guidelines and structure',
      mimeType: 'text/markdown',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true, // Interacts with git-backed vault
      },
    },
    async uri => {
      const vault = getVaultManager();

      try {
        const readmeExists = await vault.fileExists('README.md');

        if (!readmeExists) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'text/markdown',
                text: 'No README.md found in vault root.',
              },
            ],
          };
        }

        const content = await vault.readFile('README.md');

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error reading README.md';

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: `Error reading vault README: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );

  // Register additional resources if configured
  if (extraResources) {
    for (const resource of extraResources) {
      server.registerResource(
        resource.name,
        resource.uri,
        {
          name: resource.name,
          description: resource.description,
          mimeType: 'text/markdown',
          annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async resUri => {
          const vault = getVaultManager();
          try {
            const exists = await vault.fileExists(resource.path);
            const text = exists
              ? await vault.readFile(resource.path)
              : `File not found: ${resource.path}`;
            return { contents: [{ uri: resUri.href, mimeType: 'text/markdown', text }] };
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return {
              contents: [{ uri: resUri.href, mimeType: 'text/markdown', text: `Error: ${msg}` }],
            };
          }
        },
      );
    }
  }
}
