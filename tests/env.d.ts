declare namespace Cloudflare {
	interface Env {
		KV: KVNamespace;
		TASKS_CACHE_TTL_SECONDS?: string;
	}
}
