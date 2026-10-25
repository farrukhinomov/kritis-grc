import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router";

import { useExplorerPlace } from "./useExplorerPlace";

function renderPlace(search: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/", `/risks${search}`]} initialIndex={1}>
      {children}
    </MemoryRouter>
  );
  return renderHook(
    () => ({
      place: useExplorerPlace(),
      params: new URLSearchParams(useLocation().search),
      pathname: useLocation().pathname,
      navigation: useNavigationType(),
    }),
    { wrapper },
  );
}

describe("the explorer's place in the URL", () => {
  it("replaces the history entry for a filter and starts again on page 1", () => {
    const { result } = renderPlace("?page=3");

    act(() => {
      result.current.place.setScope("sc-nord");
    });

    expect(result.current.navigation).toBe("REPLACE");
    expect(result.current.params.get("scope")).toBe("sc-nord");
    expect(result.current.params.get("page")).toBeNull();
  });

  it("clears the cell, category and page with the rating, as they belong to it", () => {
    const { result } = renderPlace("?cell=3-4&category=pending&page=2");

    act(() => {
      result.current.place.setRating("inherent");
    });

    expect(result.current.params.toString()).toBe("rating=inherent");
  });

  it("opens a cell's sheet as a history entry, so back closes it and stays on the page", () => {
    const { result } = renderPlace("");

    act(() => {
      result.current.place.openCellSheet({ likelihood: 3, impact: 4 });
    });
    expect(result.current.navigation).toBe("PUSH");
    expect(result.current.params.get("cell")).toBe("3-4");

    act(() => {
      result.current.place.closeCellSheet();
    });
    expect(result.current.navigation).toBe("POP");
    expect(result.current.pathname).toBe("/risks");
    expect(result.current.params.get("cell")).toBeNull();
  });

  it("closes a sheet from a shared link without leaving the page", () => {
    const { result } = renderPlace("?cell=3-4");

    act(() => {
      result.current.place.closeCellSheet();
    });

    expect(result.current.pathname).toBe("/risks");
    expect(result.current.params.get("cell")).toBeNull();
  });
});
