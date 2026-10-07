import { Claire, type ClaireAPIError, type ClaireResponseError, type ContextSource, type ContextSearchResult, type SearchItem, type SearchParams, type ListPeopleParams, type Person, type SourcesResponse, type SearchResponse, type PeopleResponse, type PersonResponse } from '../dist/index.js';

const sdk = new Claire({ apiKey: 'type-only', timeoutMs: 1000 });

async function consume() {
  const context = await sdk.context.get();
  const scope: 'context:read' | 'knowledge:read' | 'assets:read' | 'telegram:read' | 'x:read' | 'token:read' | undefined = context.data.grantedScopes[0];
  const requestId: string | null = context.http.requestId;
  const freshness: 'current' | 'stale' | 'unavailable' | 'synthetic' = context.meta.freshness.status;
  const identity: string | undefined = context.data.organization.displayName;
  const connection: boolean | undefined = context.data.connections.telegram?.connected;
  const approved: ContextSource | undefined = context.data.sources[0];
  const sources: SourcesResponse = await sdk.sources.list();
  const sourceStatus: ContextSource['status'] | undefined = sources.data[0]?.status;
  const query: SearchParams = { q: 'hello', ...(approved ? { source: approved.id } : {}), after: '2026-01-01T00:00:00Z', before: '2026-10-01T00:00:00Z', limit: 50 };
  const search: SearchResponse = await sdk.search(query);
  const result: ContextSearchResult = search.data;
  const match: SearchItem | undefined = result.items[0];
  const sourceId: string | undefined = match?.sourceId;
  const peopleQuery: ListPeopleParams = { q: 'Alice', page: 1 };
  const people: PeopleResponse = await sdk.people.list(peopleQuery);
  const page: number = people.pagination.page;
  const peopleLimited: boolean = people.pagination.searchLimited;
  const person: PersonResponse = await sdk.people.get('tg:42');
  const fields: Person = person.data;
  const unknownField: unknown = fields.key;
  void [identity, connection, sourceStatus, sourceId, page, peopleLimited, unknownField];

  const knowledge = await sdk.knowledge.list({ q: 'C++', archived: false, kind: 'note', visibility: 'team', page: 1 });
  const next: boolean = knowledge.pagination.hasNextPage;
  const summaryKind: 'source' | 'note' | undefined = knowledge.data[0]?.kind;
  const item = await sdk.knowledge.get('docs:abc', { offset: 0, limit: 100 });
  const nextOffset: number | null = item.data.contentRange.nextOffset;

  const assets = await sdk.assets.list({ folderId: 'folder', page: 2 });
  const folder: string | null = assets.pagination.folderId;
  const asset = await sdk.assets.get('asset');
  const publicUrl: string | null = asset.data.publicUrl;

  const chats = await sdk.telegram.chats.list({ page: 1 });
  const chatTitle: string | undefined = chats.data[0]?.title;
  const messages = await sdk.telegram.messages.list('chat', { q: 'hello', before: 42, limit: 10 });
  const cursor: number | null = messages.pagination.nextBefore;
  const limited: boolean = messages.pagination.searchLimited;

  const mentions = await sdk.x.mentions.list({ page: 1 });
  const mentionId: string | undefined = mentions.data[0]?.id;
  const token = await sdk.token.get();
  const raw: string | undefined = token.data.holders?.trackedBalanceRaw;
  const tokenAddress: string | undefined = token.data.token?.address;
  if (token.data.token) {
    const chainId: number = token.data.token.chainId;
    const protocol: 'pons' | 'stockereum' = token.data.token.protocol;
    const poolId: string | null = token.data.token.poolId;
    const pairedToken: string | null = token.data.token.pairedToken;
    void [chainId, protocol, poolId, pairedToken];
  }
  const latestTrade: string | null = token.data.latestTradeAt;
  const error = null as unknown as ClaireAPIError;
  const retry: number | null = error.retryAfterSeconds;
  const responseError = null as unknown as ClaireResponseError;
  void [scope, requestId, freshness, next, summaryKind, nextOffset, folder, publicUrl, chatTitle, cursor, limited, mentionId, raw, tokenAddress, latestTrade, retry, responseError];

  // @ts-expect-error query uses the documented q field, not query
  await sdk.knowledge.list({ query: 'hello' });
  // @ts-expect-error unknown knowledge filter
  await sdk.knowledge.list({ visibility: 'private' });
  // @ts-expect-error enum must exclude unknown values
  await sdk.knowledge.list({ kind: 'article' });
  // @ts-expect-error page is numeric
  await sdk.x.mentions.list({ page: '2' });
  // @ts-expect-error search limit is numeric
  await sdk.search({ limit: '50' });
  // @ts-expect-error people page is numeric
  await sdk.people.list({ page: '2' });
  // @ts-expect-error person fields remain unknown until specified by the API contract
  const inferredName: string = person.data.displayName;
  void inferredName;
  // @ts-expect-error message cursor is numeric
  await sdk.telegram.messages.list('chat', { before: '42' });
  // @ts-expect-error read-only API has no mutation method
  await sdk.knowledge.create({ title: 'not supported' });
  // @ts-expect-error exact response data is not an untyped object
  const invalid: number = token.data.holders?.trackedBalanceRaw;
  void invalid;
}

void consume;
