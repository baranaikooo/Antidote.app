import assert from "node:assert/strict";
import { notificationPreviewTitle } from "./notification-copy.ts";

Deno.test("names the sender in a Slovak notification sentence", () => {
  assert.equal(
    notificationPreviewTitle(true, "Jana", "female"),
    "Jana vám napísala",
  );
  assert.equal(
    notificationPreviewTitle(true, "Peter", "male"),
    "Peter vám napísal",
  );
  assert.equal(
    notificationPreviewTitle(true, "Alex", "other"),
    "Alex vám píše",
  );
  assert.equal(
    notificationPreviewTitle(false, "Jana", "female"),
    "Jana vám poslala hlasovú odpoveď",
  );
  assert.equal(
    notificationPreviewTitle(false, "Peter", "male"),
    "Peter vám poslal hlasovú odpoveď",
  );
  assert.equal(
    notificationPreviewTitle(false, "Alex", null),
    "Alex vám posiela hlasovú odpoveď",
  );
  assert.equal(notificationPreviewTitle(true, null, null), "");
  assert.equal(
    notificationPreviewTitle(true, " Jana\n Nováková ", "female"),
    "Jana Nováková vám napísala",
  );
});
