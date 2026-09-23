/**
 * Test-account credentials, loaded from `.env.<TEST_ENV>`
 * (`E2E_USERNAME` / `E2E_PASSWORD`, plus `_2` / `_3` … one pair per worker).
 */
export interface E2ECredentials {
	username: string;
	password: string;
}

/** Per-environment anchors read from `.env.<TEST_ENV>`. */
export interface E2EEnvironment {
	/** Origin of the app under test (`BASE_URL`). */
	baseURL: string;
	/** Origin used for API-based data setup (`API_BASE_URL`, defaults to `baseURL`). */
	apiBaseURL: string;
	/** Tenant / organisation / workspace the specs operate in (`E2E_TENANT_NAME`). */
	tenantName?: string;
}
