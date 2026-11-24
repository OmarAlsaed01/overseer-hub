import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside the Workers runtime against a local D1, with made-up values only.
export default defineConfig(async () => {
	const migrations = await readD1Migrations("./migrations");
	return {
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						ACCESS_CLIENT_ID: "test-client-id",
						ACCESS_CLIENT_SECRET: "test-client-secret",
						ACCESS_TOKEN_URL: "https://example.invalid/token",
						ACCESS_AUTHORIZATION_URL: "https://example.invalid/authorize",
						ACCESS_JWKS_URL: "https://example.invalid/jwks",
						COOKIE_ENCRYPTION_KEY: "0".repeat(64),
						ALLOWED_EMAIL: "owner@example.com",
					},
				},
			}),
		],
		test: { setupFiles: ["./test/apply-migrations.ts"] },
	};
});
