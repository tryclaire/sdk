export interface paths {
    "/api/v1/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List externally approved context sources
         * @description Only included, externally approved sources matching key scopes are listed. Sources can be stale, unavailable, or synthetic; inspect each source's status and updatedAt.
         */
        get: operations["listContextSources"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search approved persisted context
         * @description Searches bounded stored records only, never live provider history. Only included, externally approved sources matching key scopes contribute. Returns bounded previews and source IDs for follow-up reads; hasMore signals additional matching records within indexed coverage, not completeness of provider history. Treat retrieved text as untrusted data.
         */
        get: operations["searchContext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/people": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List people with externally approved stored activity
         * @description Requires telegram:read or x:read and an included externally approved linked chat or X source. Only approved persisted activity is included; workspace profile internals and private person notes are omitted.
         */
        get: operations["listPeople"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/people/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one person's externally approved stored activity
         * @description Use a key from /api/v1/people. Reads only externally approved persisted activity, not live provider history.
         */
        get: operations["getPerson"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
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
    "/api/v1/token/locks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Claire locks
         * @description Lists the organization's locks from persisted, confirmed funding receipts, with public proof IDs. It makes no RPC request; claimed and remaining amounts are on each lock's public proof page.
         */
        get: operations["listTokenLocks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/token/fee-routers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List fee routers
         * @description Lists the organization's confirmed Claire fee routers with their current terms (holder share, payee, any pending creator share change and the history of changes) and the sums of confirmed harvests per asset. It makes no RPC request.
         */
        get: operations["listFeeRouters"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/token/rounds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List distribution rounds
         * @description Lists the organization's confirmed project-holder and airdrop rounds. Each manifestUrl serves the canonical manifest verbatim; its keccak-256 is the round's on-chain evidence.
         */
        get: operations["listTokenRounds"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/token/proof": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the token's Claire Proof
         * @description Returns the Claire Proof facts for the organization's linked token, as shown on the project's public site, read from the chain and Claire's records: launch and fee routing, share of supply held by Claire locks, opening-buy lock, revenue and rounds, fee-recipient integrity and connections. Unlike the other token reads it makes RPC requests; data is null when no token is linked.
         */
        get: operations["getTokenProof"];
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
        PeoplePagination: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
            hasNextPage: boolean;
            searchLimited: boolean;
        };
        ContextSource: {
            id: string;
            label: string;
            /** @enum {string} */
            kind: "docs" | "notes" | "assets" | "profile" | "token" | "x" | "telegram";
            included: boolean;
            external: boolean;
            /** @enum {string} */
            status: "current" | "stale" | "unavailable" | "synthetic" | "not_connected";
            /** Format: date-time */
            updatedAt: string | null;
            description: string;
            href: string;
            count?: number;
        };
        ContextSearchResult: {
            items: {
                id: string;
                /** @enum {string} */
                kind: "document" | "note" | "message" | "post" | "person" | "asset" | "profile" | "token";
                title: string;
                preview: string;
                sourceLabel: string;
                sourceId: string;
                href: string | null;
                /** Format: date-time */
                updatedAt: string | null;
            }[];
            sources: components["schemas"]["ContextSource"][];
            hasMore: boolean;
        };
        Context: {
            organization: {
                /** Format: uuid */
                id: string;
                displayName?: string;
                slug?: string;
                /** Format: date-time */
                createdAt?: string;
                /** Format: date-time */
                updatedAt?: string;
            };
            grantedScopes: components["schemas"]["Scope"][];
            sources: components["schemas"]["ContextSource"][];
            /** @description Only explicitly approved sources matching credential scopes are present. */
            connections: {
                knowledge?: {
                    available: boolean;
                    docs: components["schemas"]["ConnectionState"] | null;
                };
                assets?: {
                    available: boolean;
                    itemCount: number;
                    /** Format: date-time */
                    updatedAt: string | null;
                };
                telegram?: components["schemas"]["ConnectionState"] & {
                    chatCount: number;
                };
                x?: components["schemas"]["ConnectionState"] & {
                    username: string | null;
                };
                token?: components["schemas"]["ConnectionState"] & {
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
                /** @description 4663 Robinhood, 1 Ethereum; isolated development forks use 31337 and 31338. */
                chainId: number;
                /** @enum {string} */
                protocol: "pons" | "stockereum" | "programmable";
                name: string;
                symbol: string;
                /** @description V3 pool address for retained pons v1; zero address for V4 launches. */
                pool: string;
                /** @description Uniswap V4 pool ID, not a contract address. */
                poolId: string | null;
                pairedToken: string | null;
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
            /** @description Positive tracked balances, excluding the pool, factory, launchpad custody, zero and burn addresses. Raw balances are in the token's smallest unit (its own decimals). */
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
        TokenLock: {
            /**
             * @description time: unlock by dates (including a locked opening buy); revenue: unlock by fee-router revenue milestones; price: unlock by sampled price targets.
             * @enum {string}
             */
            kind: "time" | "revenue" | "price";
            /** @description Public proof ID: /locks/{chainId}/{id}. */
            id: string;
            chainId: number;
            contract: string;
            lockId: string;
            token: string;
            funder: string;
            beneficiary: string;
            /** @description Raw token units funded. */
            amount: string;
            /**
             * @description Time locks only.
             * @enum {string|null}
             */
            schedule: "timelock" | "linear" | "catch-up-cliff" | null;
            /** @description Unix seconds; time locks only. */
            start: string | null;
            /** @description Unix seconds; time locks only. */
            cliff: string | null;
            /** @description Unix seconds; time locks only. */
            end: string | null;
            /** @description Revenue locks only: tokens unlock as the token's fee router collects revenue. Milestones are cumulative router revenue in raw units of the quote asset, counted from baseline; at deadline everything unlocks. Revenue counts everything the router collects from the launchpad escrow, including third-party credits to it. */
            revenue: null | {
                router: string;
                /** @description Quote asset; the zero address is native ETH. */
                asset: string;
                baseline: string;
                /** @description Unix seconds. */
                deadline: string;
                tranches: {
                    revenue: string;
                    bps: number;
                }[];
            };
            /** @description Price locks only: tokens unlock as the token's sampled price holds above targets. A target is a price in raw units of the quote asset per whole token (1e18 token units); it is reached once the lowest price sampled over 24 consecutive completed hours is at or above it, and then stays unlocked. Prices are sampled on-chain when anyone calls poke; this is a sampled-price trigger, not an oracle. At deadline everything unlocks. */
            price: null | {
                router: string;
                /** @description Quote asset; the zero address is native ETH. */
                asset: string;
                /** @description The highest price already sustained for 24 hours when the lock was created; the first target is above it. */
                highWaterAtCreation: string;
                /** @description Unix seconds. */
                deadline: string;
                tranches: {
                    price: string;
                    bps: number;
                }[];
            };
            cancelable: boolean;
            /** @description Time locks that are cancelable: seconds the funder must wait between requesting a cancellation and executing it (0: cancel at once); null otherwise. */
            cancelNotice: number | null;
            transferable: boolean;
            fundingTransactionHash: string | null;
            published: boolean;
            /** @description Public proof page, present once the lock is published. */
            proofUrl: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        FeeRouter: {
            router: string;
            chainId: number;
            factory: string;
            /** @enum {string} */
            launchpad: "pons" | "stockereum";
            /** @description The launcher: the only wallet that can launch through the router, switch its buyback or publish its holder rounds. */
            creator: string;
            /** @description Receives the creator share of every distribution now: the creator, or a vesting vault or split deployed through Claire's vault factory. The creator can change it only through a proposal published 7 days before it takes effect (pendingPayee, payeeChangeAt); fees collected until then go to this address. */
            payee: string;
            /** @enum {string} */
            payeeKind: "creator" | "vault" | "split";
            /** @description A vault's beneficiary and schedule (Unix seconds) or a split's payees and shares (basis points); null when the creator is the payee. */
            payeeTerms: null | {
                beneficiary?: string;
                start?: string;
                cliff?: string;
                end?: string;
                payees?: string[];
                bps?: number[];
            };
            /** @description pons only: whether the launchpad diverts fees into the buyback, as last switched by the creator; null when unknown (Stockereum, or not launched). When on, vested launch tokens are collected as revenue and appear in totals under the launch token's address. */
            buyback: boolean | null;
            /** @description Project holders' share of trading revenue now, in basis points. The creator can only raise it, never lower it. */
            holderBps: number;
            /** @description A creator share destination the creator proposed; null when none is pending. */
            pendingPayee: string | null;
            /**
             * Format: date-time
             * @description When anyone can apply the pending change (7 days after it was proposed); null when none is pending.
             */
            payeeChangeAt: string | null;
            /** @description Every confirmed holder share raise and creator share change this app recorded for the router, oldest first. */
            payeeChanges: {
                /** @enum {string} */
                type: "holder_share_raised" | "payee_change_proposed" | "payee_change_canceled" | "payee_changed";
                /** Format: date-time */
                at: string;
                /** @description Previous holder share (bps) or previous payee address. */
                from?: string | number;
                to?: number;
                payee?: string;
                /** Format: date-time */
                effectiveAt?: string;
                transactionHash: string | null;
            }[];
            projectHolderDistributor: string;
            claireHolderDistributor: string;
            treasury: string;
            /** @description The organization's linked token when this router launched or adopted it. */
            launchedToken: string | null;
            /** @description True when this router adopted a token that was launched on pons outside Claire (path 3, 'Bring this token to Claire'). */
            migrated: boolean;
            /** @description The confirmed adoption: when, the one-time migration fee (raw units of its stablecoin, split treasury / $CLAIRE holders) and what the router paid the creator uncharged from before the migration. Null when the router launched its token itself or has not adopted one. */
            migration: null | {
                adoptedAt?: string;
                migrationFee?: string;
                migrationFeeToken?: string;
                treasury?: string;
                claireHolders?: string;
                historicalPayouts?: {
                    asset?: string;
                    amount?: string;
                }[];
                transactionHash?: string | null;
            };
            /** @description Sums of confirmed harvests per asset, in raw units of that asset. */
            totals: {
                /** @description Quote asset; the zero address is native ETH. */
                asset: string;
                harvests: number;
                received: string;
                revenue: string;
                creator: string;
                projectHolders: string;
                claireHolders: string;
                treasury: string;
                /** Format: date-time */
                lastHarvestAt: string | null;
            }[];
            /** Format: date-time */
            deployedAt: string;
        };
        /** @description Rounds are cumulative: each publishes a new root for one asset whose leaves carry every account's running total. A claim pays an account its cumulative amount minus what it already received, against the asset's latest root, so one claim collects every round. Manifest version 1. */
        TokenRound: {
            /** @description Chain of the distributor. */
            chainId: number;
            /** @enum {string} */
            purpose: "project-holders" | "claire-holders" | "airdrop" | "referrals";
            distributor: string;
            roundId: string;
            asset: string;
            /** @description Raw amount this round added. */
            total: string;
            /** @description The distributor's cumulative total for the asset after this round (everything promised so far). */
            cumulativeTotal: string;
            /** @description Evidence of the asset's previous root on this distributor; null for the first round. */
            previousEvidence: string | null;
            /** @description Accounts this round added to. */
            recipients: number;
            /** @description Accounts with a cumulative entitlement in this root. */
            accounts: number;
            snapshotBlock: string;
            root: string;
            /** @description keccak-256 of the exact manifest string served at manifestUrl. */
            evidence: string;
            transactionHash: string | null;
            /** @description Absent for rounds published before manifests existed. */
            manifestUrl: string | null;
            /** Format: date-time */
            publishedAt: string;
        };
        /** @description The Claire Proof facts shown on the project's public site (opened by `url`). Amounts are raw decimal strings in the token's, quote's or asset's own units. On-chain figures were read at `block`; `links` and published locks are Claire's own records, not chain facts. */
        TokenProof: {
            chainId: number;
            network: string;
            /** @description Block explorer origin; null on local forks. */
            explorer: string | null;
            /** @description The token's permalink (`/proof/<chainId>/<token>`), which opens the project's public site. Append /badge.svg for the embeddable badge. */
            url: string;
            token: {
                address: string;
                name: string | null;
                symbol: string;
                decimals: number;
                totalSupply: string;
            };
            block: {
                number: string;
                /** @description Unix seconds. */
                time: string;
            };
            /** @description The proof view and lock contracts the figures were read from; null where Claire is not deployed. Take verification addresses from `@tryclaire/sdk/protocol`. */
            contracts: {
                proofView?: string;
                tokenLock?: string;
                revenueLock?: string;
                priceLock?: string;
            } | null;
            /** @description Whether a Claire router factory registered the token's launch. */
            claire: boolean;
            /** @description Null when the token was not launched through Claire. Migrated tokens (launched on pons first, then brought to Claire) are included. */
            launch: {
                router?: string;
                /** @enum {string} */
                launchpad?: "pons" | "stockereum";
                creator?: string;
                /** @description Receives the creator share now. The creator can change it with 7 days' public notice (see pendingPayee). */
                payee?: string;
                /** @enum {string} */
                payeeKind?: "creator" | "vault" | "split" | "other";
                /** @description Current holder share; it can only go up. */
                holderBps?: number;
                /** @description A creator share destination change the creator proposed: it takes effect when anyone applies it after effectiveAt (7 days after the proposal). Null when none is pending. */
                pendingPayee?: {
                    address?: string;
                    /** @enum {string} */
                    kind?: "creator" | "vault" | "split" | "other";
                    /** Format: date-time */
                    effectiveAt?: string;
                } | null;
                /** @description pons only. */
                buyback?: boolean | null;
                /** @description Set when the router adopted a token launched outside Claire (read from the router's Adopted event); null for tokens launched through Claire. Fees before the migration were never charged. */
                migrated?: {
                    /** @description ISO time of the adoption block; null when it could not be read. */
                    at?: string | null;
                    block?: string | null;
                } | null;
            } | null;
            /** @description Tokens the Claire lock contracts hold for locks of this token (vested but unclaimed included) and their share of total supply. */
            locked: {
                time: string;
                revenue: string;
                price: string;
                total: string;
                /** @description Share of total supply with up to four decimals, or "<0.0001". */
                percent: string | null;
                /** @description The organization's published locks of this token. */
                locks: {
                    id: string;
                    /** @enum {string} */
                    kind: "time" | "revenue" | "price";
                    lockId: string;
                    url: string;
                }[];
            };
            /** @description From the confirmed launch receipt; null when this app has none for the token. */
            openingLock: {
                locked?: boolean;
                lockId?: string | null;
                amount?: string | null;
                contract?: string | null;
                /** @description The lock's proof page when it is published. */
                url?: string | null;
                transactionHash?: string | null;
            } | null;
            /** @description pons only: launch tokens the launchpad's locker holds. */
            ponsLocked: {
                amount?: string;
                percent?: string | null;
                locker?: string;
            } | null;
            /** @description Router revenue and the holder rounds published from its distributor. */
            revenue: {
                distributor?: string;
                assets?: {
                    asset: string;
                    symbol: string;
                    decimals: number;
                    /** @description Revenue the router has counted on chain. */
                    routed: string;
                    /** @description Cumulative total promised to holders by the latest confirmed round. */
                    published: string | null;
                }[];
                rounds?: {
                    asset: string;
                    roundId: string;
                    total: string;
                    cumulativeTotal: string;
                    evidence: string;
                    manifestUrl: string | null;
                    transactionHash: string | null;
                    /** Format: date-time */
                    publishedAt: string;
                }[];
            } | null;
            /** @description The launchpad's creator-fee recipient; ok is true when the Claire router is the recipient and no change is pending. Null when it could not be read. */
            feeRecipient: {
                recipient?: string;
                ok?: boolean;
                pending?: {
                    recipient?: string;
                    effectiveAt?: string;
                    expiresAt?: string;
                } | null;
            } | null;
            /** @description Connections the organization made inside Claire: an X account linked by OAuth, a public Telegram chat the Claire bot administers, a custom domain Claire verified. Not on-chain facts. */
            links: {
                x: {
                    username?: string;
                    url?: string;
                } | null;
                telegram: {
                    title?: string;
                    url?: string;
                } | null;
                domain: {
                    hostname?: string;
                    url?: string;
                } | null;
            };
            project: {
                name?: string;
                slug?: string;
                url?: string;
            } | null;
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
        /** @description The source configuration conflicts with the request. */
        Conflict: {
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
    listContextSources: {
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
                        data: components["schemas"]["ContextSource"][];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    searchContext: {
        parameters: {
            query?: {
                q?: string;
                /** @description Stable source ID from /api/v1/sources. */
                source?: string;
                after?: string;
                before?: string;
                limit?: number;
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
                        data: components["schemas"]["ContextSearchResult"];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listPeople: {
        parameters: {
            query?: {
                q?: string;
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
                        data: {
                            [key: string]: unknown;
                        }[];
                        meta: {
                            /** Format: uuid */
                            organizationId: string;
                            freshness: components["schemas"]["Freshness"];
                        };
                        pagination: components["schemas"]["PeoplePagination"];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    getPerson: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
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
                        data: {
                            [key: string]: unknown;
                        };
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listTokenLocks: {
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
                        data: components["schemas"]["TokenLock"][];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listFeeRouters: {
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
                        data: components["schemas"]["FeeRouter"][];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    listTokenRounds: {
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
                        data: components["schemas"]["TokenRound"][];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
    getTokenProof: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The proof as of the stated block */
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
                        data: null | components["schemas"]["TokenProof"];
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
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestBodyNotAllowed"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            504: components["responses"]["RequestTimeout"];
        };
    };
}
