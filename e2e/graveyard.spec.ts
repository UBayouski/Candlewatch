// The graveyard and the Door in a real browser (ghosts-and-graveyard R11). E1, E2 and E7 follow in tasks 20 and 21.
import { expect, test } from "@playwright/test";
import { doorState, graveyardFixture, itemIds, openGraveyardApp, smallHistory } from "./graveyard-fixtures";

test.describe("the helpers (task 19.1)", () => {
  test("a stored burned-out session shows the usable Door, and the stored history is on the page", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("burned-out-small", "burned-out", smallHistory) });
    try {
      const { page } = app;
      expect(await doorState(page)).toEqual({ buttonShown: true, shutShown: false });
      await expect(page.getByRole("button", { name: "Open the graveyard" })).toBeVisible();
      // The view is closed: no Item is drawn in the room.
      expect(await itemIds(page)).toEqual([]);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("a stored lit session shows the shut door and no Door button", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("lit-small", "lit", smallHistory) });
    try {
      expect(await doorState(app.page)).toEqual({ buttonShown: false, shutShown: true });
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
