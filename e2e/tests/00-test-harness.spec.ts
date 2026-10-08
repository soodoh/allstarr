import { expect, test } from "../fixtures/app";

test.use({ requiredServices: [] });

test("test reset endpoint is reachable through the production router", async ({
	request,
	appUrl,
}) => {
	const response = await request.post(`${appUrl}/api/__test-reset`);
	expect(response.status()).toBe(200);
	await expect(response.json()).resolves.toEqual({ ok: true });
});
