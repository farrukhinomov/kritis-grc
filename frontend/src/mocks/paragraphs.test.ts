import { byParagraph } from "./handlers/compliance";

describe("paragraph order", () => {
  it("follows the statute: by number, then by letter", () => {
    expect(["§ 30a", "§ 8a", "§ 30", "§ 8", "§ 12"].toSorted(byParagraph)).toEqual([
      "§ 8",
      "§ 8a",
      "§ 12",
      "§ 30",
      "§ 30a",
    ]);
  });

  it("copes with headings without a number", () => {
    expect(["Anlage", "§ 2"].toSorted(byParagraph)).toEqual(["§ 2", "Anlage"]);
  });
});
