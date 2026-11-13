// שרת MCP בחיבור stdio - להפעלה ישירה מתוך Claude Desktop / Claude Code.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openLibrary } from './db.js';
import { createMcpServer } from './mcp.js';

const server = createMcpServer(await openLibrary());
await server.connect(new StdioServerTransport());
