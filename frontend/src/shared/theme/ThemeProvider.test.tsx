import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import deDE from "antd/locale/de_DE";

import { COLOR_MODE_STORAGE_KEY } from "./colorMode";
import { semanticTokens, type ThemeName } from "./semantic";
import { useColorMode, useSemanticTokens, useTenantTheme } from "./themeContext";
import { ThemeProvider } from "./ThemeProvider";

function ModeProbe() {
  const { preference, mode, setPreference } = useColorMode();
  const tokens = useSemanticTokens();
  return (
    <>
      <output aria-label="mode">{`${preference}/${mode}`}</output>
      <output aria-label="primary">{tokens.primary}</output>
      <button
        type="button"
        onClick={() => {
          setPreference("dark");
        }}
      >
        dark
      </button>
    </>
  );
}

function TenantPage({ theme }: { theme: ThemeName }) {
  useTenantTheme(theme);
  return null;
}

function renderWithTheme(children: React.ReactNode) {
  return render(<ThemeProvider locale={deDE}>{children}</ThemeProvider>);
}

const root = document.documentElement;

afterEach(() => {
  localStorage.clear();
});

describe("ThemeProvider", () => {
  it("starts in system mode, which is light when the system prefers light", () => {
    renderWithTheme(<ModeProbe />);

    expect(screen.getByLabelText("mode")).toHaveTextContent("system/light");
    expect(root.dataset.colorMode).toBe("light");
  });

  it("applies and remembers a chosen mode", async () => {
    renderWithTheme(<ModeProbe />);

    await userEvent.click(screen.getByRole("button", { name: "dark" }));

    expect(screen.getByLabelText("mode")).toHaveTextContent("dark/dark");
    expect(root.dataset.colorMode).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe("dark");
    expect(root.style.getPropertyValue("--grc-surface")).toBe(
      semanticTokens("saar-green", "dark").surface,
    );
  });

  it("applies a Tenant's Theme while its page is mounted and restores the default after", () => {
    const { rerender } = renderWithTheme(
      <>
        <ModeProbe />
        <TenantPage theme="blue" />
      </>,
    );

    expect(screen.getByLabelText("primary")).toHaveTextContent(
      semanticTokens("blue", "light").primary,
    );
    expect(root.dataset.theme).toBe("blue");

    rerender(
      <ThemeProvider locale={deDE}>
        <ModeProbe />
      </ThemeProvider>,
    );

    expect(root.dataset.theme).toBe("saar-green");
  });

  it("explains a missing provider instead of failing obscurely", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<ModeProbe />)).toThrow(/inside <ThemeProvider>/);
  });
});
