import type { components, operations } from "./schema.js";

export type Freshness = components["schemas"]["Freshness"];
export type Scope = components["schemas"]["Scope"];
export type Context = components["schemas"]["Context"];
export type ContextSource = components["schemas"]["ContextSource"];
export type ContextSearchResult = components["schemas"]["ContextSearchResult"];
export type SearchItem = ContextSearchResult["items"][number];
export type Person = operations["getPerson"]["responses"][200]["content"]["application/json"]["data"];
export type ConnectionState = components["schemas"]["ConnectionState"];
export type KnowledgeSummary = components["schemas"]["KnowledgeSummary"];
export type KnowledgeItem = components["schemas"]["KnowledgeItem"];
export type Asset = components["schemas"]["Asset"];
export type TelegramChat = components["schemas"]["TelegramChat"];
export type TelegramMessage = components["schemas"]["TelegramMessage"];
export type XMention = components["schemas"]["XMention"];
export type XAuthor = components["schemas"]["XAuthor"];
export type TokenSummary = components["schemas"]["TokenSummary"];
export type TokenSourceFreshness = components["schemas"]["TokenSourceFreshness"];
export type NumberedPagination = components["schemas"]["NumberedPagination"];
export type AssetPagination = components["schemas"]["AssetPagination"];
export type MessagePagination = components["schemas"]["MessagePagination"];
export type ErrorBody = components["schemas"]["Error"];

export type SearchParams = NonNullable<operations["searchContext"]["parameters"]["query"]>;
export type ListPeopleParams = NonNullable<operations["listPeople"]["parameters"]["query"]>;

export type ListKnowledgeParams = NonNullable<operations["listKnowledge"]["parameters"]["query"]>;
export type GetKnowledgeItemParams = NonNullable<operations["getKnowledgeItem"]["parameters"]["query"]>;
export type ListAssetsParams = NonNullable<operations["listAssets"]["parameters"]["query"]>;
export type ListTelegramChatsParams = NonNullable<operations["listTelegramChats"]["parameters"]["query"]>;
export type ListTelegramMessagesParams = NonNullable<operations["listTelegramMessages"]["parameters"]["query"]>;
export type ListXMentionsParams = NonNullable<operations["listXMentions"]["parameters"]["query"]>;

export type ContextResponse = operations["getContext"]["responses"][200]["content"]["application/json"];
export type SourcesResponse = operations["listContextSources"]["responses"][200]["content"]["application/json"];
export type SearchResponse = operations["searchContext"]["responses"][200]["content"]["application/json"];
export type PeopleResponse = operations["listPeople"]["responses"][200]["content"]["application/json"];
export type PersonResponse = operations["getPerson"]["responses"][200]["content"]["application/json"];
export type KnowledgeListResponse = operations["listKnowledge"]["responses"][200]["content"]["application/json"];
export type KnowledgeItemResponse = operations["getKnowledgeItem"]["responses"][200]["content"]["application/json"];
export type AssetsResponse = operations["listAssets"]["responses"][200]["content"]["application/json"];
export type AssetResponse = operations["getAsset"]["responses"][200]["content"]["application/json"];
export type TelegramChatsResponse = operations["listTelegramChats"]["responses"][200]["content"]["application/json"];
export type TelegramMessagesResponse = operations["listTelegramMessages"]["responses"][200]["content"]["application/json"];
export type XMentionsResponse = operations["listXMentions"]["responses"][200]["content"]["application/json"];
export type TokenResponse = operations["getToken"]["responses"][200]["content"]["application/json"];
