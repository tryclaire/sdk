export interface paths {
    "/api/v1/context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read organization context
         * @description Returns the credential-selected organization, granted scopes, and availability of persisted connections without calling providers.
         */
        get: operations["getContext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/knowledge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List canonical knowledge
         * @description Searches canonical sources and notes while preserving team visibility, archival state, and human suppression. Page size is 20.
         */
        get: operations["listKnowledge"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/knowledge/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one knowledge item
         * @description Returns a bounded content segment. Follow contentRange.nextOffset to continue. Offsets and lengths count JavaScript UTF-16 string units. Suppressed sources remain unavailable.
         */
        get: operations["getKnowledgeItem"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List asset metadata
         * @description Lists one folder's children. Only metadata and stable URLs for deliberately public files are returned; private object keys and signed URLs are omitted. Page size is 50.
         */
        get: operations["listAssets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/assets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read asset metadata
         * @description Returns metadata for one organization-owned file or folder. No private object key or signed URL is exposed.
         */
        get: operations["getAsset"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/telegram/chats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List linked chats
         * @description Returns linked chat metadata and persisted message coverage. Telegram bots only retain messages observed after linking. Page size is 50.
         */
        get: operations["listTelegramChats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/telegram/chats/{id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read persisted chat messages
         * @description Returns messages already received by Claire. Search examines at most the newest 10,000 tracked messages and reports searchLimited when older history was excluded. Provider file IDs are omitted.
         */
        get: operations["listTelegramMessages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/x/mentions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List persisted X mentions
         * @description Reads the collector's stored payload and never performs a paid X request. The organization is marked watched for 90 seconds so the existing worker can use its active cadence; this request does not force collection. Page size is 20.
         */
        get: operations["listXMentions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read persisted token summary
         * @description Returns linked-token metadata, transfer-index coverage, holder totals, and the latest stored fee snapshot. It makes no RPC or market-provider request. The organization is marked watched for 90 seconds so the budgeted worker can use its active cadence; this request does not force collection.
         */
        get: operations["getToken"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Freshness: {
            /** @enum {string} */
            source: "database" | "collector" | "provider" | "local_preview";
            /** Format: date-time */
            updatedAt: string | null;
            /** @enum {string} */
            status: "current" | "stale" | "unavailable" | "synthetic";
            note?: string;
        };
        Error: {
            error: {
                code: string;
                message: string;
            };
            /** Format: uuid */
            requestId: string;
        };
        NumberedPagination: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
            hasNextPage: boolean;
        };
        Context: {
            organization: {
                /** Format: uuid */
                id: string;
                displayName: string;
                slug: string;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                updatedAt: string;
            };
            grantedScopes: components["schemas"]["Scope"][];
            connections: {
                knowledge: {
                    available: boolean;
                    docs: components["schemas"]["ConnectionState"];
                };
                assets: {
                    available: boolean;
                    itemCount: number;
                    /** Format: date-time */
                    updatedAt: string | null;
                };
                telegram: components["schemas"]["ConnectionState"] & {
                    chatCount: number;
                };
                x: components["schemas"]["ConnectionState"] & {
                    username: string | null;
                };
                token: components["schemas"]["ConnectionState"] & {
                    address: string | null;
                    symbol: string | null;
                };
            };
        };
        ConnectionState: {
            connected: boolean;
            /** @enum {string} */
            status: "available" | "current" | "stale" | "unavailable" | "synthetic" | "error";
            /** Format: date-time */
            updatedAt: string | null;
        };
        /** @enum {string} */
        Scope: "context:read" | "knowledge:read" | "assets:read" | "telegram:read" | "x:read" | "token:read";
        KnowledgeSummary: {
            id: string;
            title: string;
            /** @enum {string} */
            kind: "source" | "note";
            /** @enum {string} */
            source: "docs" | "assets" | "chain" | "profile" | "team" | "answer";
            preview: string;
            /** @enum {string} */
            visibility: "public" | "team";
            archived: boolean;
            /** @enum {string} */
            sourceStatus: "current" | "draft" | "removed" | "unavailable" | "reference";
            sourceLabel: string;
            sourceHref: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        KnowledgeItem: components["schemas"]["KnowledgeSummary"] & {
            content: string;
            /** @enum {string} */
            contentFormat: "markdown" | "plain_text";
            contentRange: {
                offset: number;
                length: number;
                total: number;
                nextOffset: number | null;
            };
        };
        Asset: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            parentId: string | null;
            /** @enum {string} */
            kind: "folder" | "file";
            name: string;
            mime: string | null;
            bytes: number;
            public: boolean;
            publicUrl: string | null;
            uploadedBy: null | {
                /** Format: uuid */
                id: string;
                displayName: string | null;
            };
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        AssetPagination: components["schemas"]["NumberedPagination"] & {
            /** Format: uuid */
            folderId: string | null;
            folderName: string | null;
        };
        TelegramChat: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            type: "group" | "supergroup" | "channel";
            title: string;
            username: string | null;
            memberCount: number;
            trackedMessageCount: number;
            /** Format: date-time */
            lastMessageAt: string | null;
            /** Format: date-time */
            linkedAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        TelegramMessage: {
            id: number;
            sender: {
                id: string | null;
                name: string;
                username: string | null;
            };
            /** @enum {string} */
            kind: "text" | "photo" | "video" | "animation" | "sticker" | "document" | "voice" | "audio" | "poll" | "other";
            text: string | null;
            detail: string | null;
            file: null | {
                width: number | null;
                height: number | null;
                duration: number | null;
                mimeType: string | null;
                fileName: string | null;
                fileSize: number | null;
                /** @enum {string|null} */
                sticker: "static" | "animated" | "video" | null;
            };
            replyToMessageId: number | null;
            /** Format: date-time */
            sentAt: string;
            /** Format: date-time */
            editedAt: string | null;
        };
        MessagePagination: {
            limit: number;
            hasMore: boolean;
            nextBefore: number | null;
            searchLimited: boolean;
        };
        XMention: {
            id: string;
            /** Format: uri */
            url: string;
            text: string;
            /** Format: date-time */
            createdAt: string;
            metrics: {
                likes: number;
                reposts: number;
                replies: number;
                quotes: number;
                views: number;
            };
            isReply: boolean;
            isRepost: boolean;
            author: components["schemas"]["XAuthor"];
            media: {
                /** @enum {string} */
                type: "photo" | "video" | "gif";
                url: string;
                previewUrl: string;
            }[];
            quoted: null | {
                author: components["schemas"]["XAuthor"];
                text: string;
                /** Format: uri */
                url: string;
            };
        };
        XAuthor: {
            id: string;
            username: string;
            name: string;
            verified: boolean;
        };
        TokenSourceFreshness: {
            /** Format: date-time */
            updatedAt: string | null;
            /** @enum {string} */
            status: "current" | "stale" | "unavailable" | "synthetic";
            note?: string;
        };
        TokenSummary: {
            connected: boolean;
            token: null | {
                address: string;
                name: string;
                symbol: string;
                pool: string;
                deployer: string;
                logoUrl: string | null;
            };
            index: null | {
                indexedTo: number;
                /** Format: date-time */
                indexedAt: string;
                /** Format: date-time */
                nextSyncAt: string;
                /** @enum {string} */
                state: "ready" | "collecting" | "error";
            };
            /** @description Positive tracked balances, excluding the pool, factory, zero and burn addresses. Raw balances use 18 decimal places. */
            holders: null | {
                count: number;
                trackedBalanceRaw: string;
            };
            latestFees: null | {
                /** Format: date-time */
                takenAt: string;
                priceUsd: number;
                ethUsd: number;
                unclaimedEth: number;
                unclaimedToken: number;
            };
            /** Format: date-time */
            latestTradeAt: string | null;
            sources: {
                transfers: components["schemas"]["TokenSourceFreshness"];
                fees: components["schemas"]["TokenSourceFreshness"];
            };
        };
    };
    responses: {
        /** @description Invalid or unknown query parameter. */
        BadRequest: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                "RateLimit-Reset": components["headers"]["RateLimitReset"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Missing, invalid, expired, revoked, or ineligible credential. */
        Unauthorized: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The credential lacks the required scope. */
        Forbidden: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                "RateLimit-Reset": components["headers"]["RateLimitReset"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The organization-owned resource was not found. */
        NotFound: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                "RateLimit-Reset": components["headers"]["RateLimitReset"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Only GET and HEAD are supported. */
        MethodNotAllowed: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                /** @description Allowed methods. */
                Allow?: "GET, HEAD";
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Read endpoints do not accept request bodies. */
        RequestBodyNotAllowed: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description A shared per-key, per-organization or IP rate limit was exceeded. */
        RateLimited: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                "RateLimit-Reset": components["headers"]["RateLimitReset"];
                /** @description Seconds until retry. */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description A required database, Redis or service operation could not be completed. */
        ServiceUnavailable: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                "RateLimit-Reset": components["headers"]["RateLimitReset"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Request processing exceeded the allowed time. */
        RequestTimeout: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        /** @description One-based page number. */
        Page: number;
        /** @description Stable kind-prefixed knowledge ID returned by the list endpoint. */
        KnowledgeId: string;
        AssetId: string;
        ChatId: string;
    };
    requestBodies: never;
    headers: {
        /** @description Opaque support identifier for this request. */
        RequestId: string;
        /** @description Per-key request limit for the active window. */
        RateLimitLimit: number;
        /** @description Requests remaining after this request. */
        RateLimitRemaining: number;
        /** @description Seconds until the active rate-limit window resets. */
        RateLimitReset: number;
        /** @description Validator for the stable response representation. */
        ETag: string;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getContext: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Context"];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listKnowledge: {
        parameters: {
            query?: {
                /** @description Case-insensitive text search. */
                q?: string;
                kind?: "all" | "source" | "note";
                visibility?: "all" | "public" | "team";
                archived?: boolean;
                /** @description One-based page number. */
                page?: components["parameters"]["Page"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["KnowledgeSummary"][];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                        pagination: components["schemas"]["NumberedPagination"];
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    getKnowledgeItem: {
        parameters: {
            query?: {
                /** @description Content offset. */
                offset?: number;
                /** @description Maximum content units returned. */
                limit?: number;
            };
            header?: never;
            path: {
                /** @description Stable kind-prefixed knowledge ID returned by the list endpoint. */
                id: components["parameters"]["KnowledgeId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["KnowledgeItem"];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listAssets: {
        parameters: {
            query?: {
                /** @description Folder UUID; omit for the root. */
                folderId?: string;
                /** @description One-based page number. */
                page?: components["parameters"]["Page"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Asset"][];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                        pagination: components["schemas"]["AssetPagination"];
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    getAsset: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["AssetId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Asset"];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listTelegramChats: {
        parameters: {
            query?: {
                /** @description One-based page number. */
                page?: components["parameters"]["Page"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["TelegramChat"][];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                        pagination: components["schemas"]["NumberedPagination"];
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listTelegramMessages: {
        parameters: {
            query?: {
                /** @description Case-insensitive text and file-name search. */
                q?: string;
                /** @description Return older messages before this message ID. */
                before?: number;
                limit?: number;
            };
            header?: never;
            path: {
                id: components["parameters"]["ChatId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["TelegramMessage"][];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                        pagination: components["schemas"]["MessagePagination"];
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listXMentions: {
        parameters: {
            query?: {
                /** @description One-based page number. */
                page?: components["parameters"]["Page"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["XMention"][];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                        pagination: components["schemas"]["NumberedPagination"];
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    getToken: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current persisted data */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["TokenSummary"];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                    };
                };
            };
            /** @description The authenticated, rate-limited request was revalidated after a current database read and the representation is unchanged. */
            304: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "RateLimit-Limit": components["headers"]["RateLimitLimit"];
                    "RateLimit-Remaining": components["headers"]["RateLimitRemaining"];
                    "RateLimit-Reset": components["headers"]["RateLimitReset"];
                    ETag: components["headers"]["ETag"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            405: components["responses"]["MethodNotAllowed"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
}
