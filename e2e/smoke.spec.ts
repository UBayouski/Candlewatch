import { expect, test } from "@playwright/test";

test("the page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Candlewatch");
  await expect(page.getByRole("heading", { name: "Candlewatch" })).toBeVisible();
});
